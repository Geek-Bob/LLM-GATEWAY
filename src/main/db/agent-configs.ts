/**
 * Agent 配置版本数据访问层
 *
 * 本模块封装对 `agent_configs` 表的所有 CRUD 操作。
 * 每个 Agent 可以有多个配置版本，其中一个标记为当前激活（is_current = 1）。
 *
 * 关键设计决策：
 * - 采用依赖注入模式，接收 Database 实例而非使用全局getDb()
 * - 删除当前配置时抛出错误，防止误操作
 * - setCurrent 使用两步更新（先清除旧标记，再设置新标记）确保唯一性
 * - 字段映射采用显式 rowToConfig 函数，snake_case 转 camelCase
 */

import type { Database } from './database'

/**
 * SQLite 返回的原始行类型（snake_case 字段名）
 */
export interface AgentConfigRow {
  id: number
  agent_id: number
  name: string
  content: string
  is_current: number
  created_at: string
  updated_at: string
}

/**
 * 创建 AgentConfig 的输入参数
 */
export interface CreateAgentConfigInput {
  agentId: number
  name: string
  content: string
}

/**
 * 创建 AgentConfig Repository 实例
 *
 * 采用依赖注入模式，接收 Database 实例，便于测试和模块解耦。
 * 返回的对象包含所有 AgentConfig CRUD 操作方法。
 *
 * @param db - Database 实例
 * @returns AgentConfig Repository 对象
 */
export function createAgentConfigRepository(db: Database) {
  return {
    /**
     * 列出指定 Agent 的所有配置，按 name ASC 排序
     * @param agentId - Agent ID
     * @returns AgentConfigRow 数组，无配置时返回空数组
     */
    async listByAgent(agentId: number): Promise<AgentConfigRow[]> {
      const stmt = db.prepare('SELECT * FROM agent_configs WHERE agent_id = ? ORDER BY name')
      return stmt.all(agentId) as AgentConfigRow[]
    },

    /**
     * 按主键查询单个配置
     * @param id - 配置 ID
     * @returns AgentConfigRow 对象，不存在时返回 null
     */
    async getById(id: number): Promise<AgentConfigRow | null> {
      const stmt = db.prepare('SELECT * FROM agent_configs WHERE id = ?')
      const row = stmt.get(id) as AgentConfigRow | undefined
      return row ?? null
    },

    /**
     * 获取指定 Agent 的当前激活配置
     * @param agentId - Agent ID
     * @returns 当前 AgentConfigRow 对象，无当前配置时返回 null
     */
    async getCurrent(agentId: number): Promise<AgentConfigRow | null> {
      const stmt = db.prepare(
        'SELECT * FROM agent_configs WHERE agent_id = ? AND is_current = 1'
      )
      const row = stmt.get(agentId) as AgentConfigRow | undefined
      return row ?? null
    },

    /**
     * 创建新配置
     * 新配置默认 is_current = 0（非当前配置）
     *
     * @param input - 创建参数
     * @returns 创建后的完整 AgentConfigRow 对象
     * @throws 如果同名配置已存在则抛出 UNIQUE 约束错误
     */
    async create(input: CreateAgentConfigInput): Promise<AgentConfigRow> {
      const stmt = db.prepare(
        'INSERT INTO agent_configs (agent_id, name, content) VALUES (?, ?, ?)'
      )
      const result = stmt.run([input.agentId, input.name, input.content])
      const config = await this.getById(result.lastInsertRowid)
      if (!config) throw new Error(`Failed to create config: record not found after insert for agent ${input.agentId}`)
      return config
    },

    /**
     * 更新配置内容
     * 每次更新自动刷新 updated_at 时间戳
     *
     * @param id - 配置 ID
     * @param content - 新的配置内容
     * @returns 更新后的完整 AgentConfigRow 对象
     * @throws 如果配置不存在则抛出错误
     */
    async updateContent(id: number, content: string): Promise<AgentConfigRow> {
      const stmt = db.prepare(
        "UPDATE agent_configs SET content = ?, updated_at = datetime('now') WHERE id = ?"
      )
      stmt.run([content, id])
      const config = await this.getById(id)
      if (!config) throw new Error(`Failed to update config: config ${id} not found`)
      return config
    },

    /**
     * 切换当前激活配置
     * 使用两步更新：先清除该 Agent 的所有 is_current 标记，再设置新的当前配置。
     *
     * @param agentId - Agent ID
     * @param configId - 要设为当前的配置 ID
     */
    async setCurrent(agentId: number, configId: number): Promise<void> {
      // 先校验 configId 存在性
      const config = await this.getById(configId)
      if (!config) throw new Error(`Failed to set current config: config ${configId} not found`)
      if (config.agent_id !== agentId) {
        throw new Error(`Failed to set current config: config ${configId} does not belong to agent ${agentId}`)
      }

      // 使用事务包装，防止第一条 UPDATE 成功、第二条失败导致无激活配置
      db.exec('BEGIN')
      try {
        const clearStmt = db.prepare(
          'UPDATE agent_configs SET is_current = 0 WHERE agent_id = ?'
        )
        clearStmt.run([agentId])
        const setStmt = db.prepare(
          'UPDATE agent_configs SET is_current = 1 WHERE id = ? AND agent_id = ?'
        )
        const result = setStmt.run([configId, agentId])
        if (result.changes === 0) {
          throw new Error(`Failed to set current config: config ${configId} not found for agent ${agentId}`)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },

    /**
     * 清除指定 Agent 的所有 current 标记
     * 使用单条 SQL 批量清除，替代逐条遍历
     *
     * @param agentId - Agent ID
     */
    async clearCurrent(agentId: number): Promise<void> {
      const stmt = db.prepare('UPDATE agent_configs SET is_current = 0 WHERE agent_id = ?')
      stmt.run([agentId])
    },

    /**
     * 删除配置
     * 当前激活的配置不可删除，防止误操作
     *
     * @param id - 配置 ID
     * @throws 如果配置不存在或为当前配置则抛出错误
     */
    async remove(id: number): Promise<void> {
      const config = await this.getById(id)
      if (!config) throw new Error(`Failed to delete config: config ${id} not found`)
      if (config.is_current === 1) throw new Error(`Failed to delete config: cannot delete current config ${id}`)
      const stmt = db.prepare('DELETE FROM agent_configs WHERE id = ?')
      stmt.run(id)
    },
  }
}
