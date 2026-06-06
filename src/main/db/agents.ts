/**
 * Agent 数据访问层
 *
 * 本模块封装对 `agents` 表的所有 CRUD 操作。
 * Agent 记录的是可复用的 Agent 配置模板，包括内置 Agent 和用户自定义 Agent。
 *
 * 关键设计决策：
 * - 采用依赖注入模式，接收 Database 实例而非使用全局getDb()
 * - is_builtin = 1 表示内置 Agent，不可删除
 * - 字段映射采用显式 rowToAgent 函数，snake_case 转 camelCase
 */

import type { Database } from './database'

/**
 * SQLite 返回的原始行类型（snake_case 字段名）
 */
export interface AgentRow {
  id: number
  name: string
  display_name: string
  config_path: string
  config_format: 'json' | 'toml' | 'env'
  is_builtin: number
  created_at: string
  updated_at: string
}

/**
 * 应用层 Agent 类型（camelCase 字段名）
 */
export interface Agent {
  id: number
  name: string
  displayName: string
  configPath: string
  configFormat: 'json' | 'toml' | 'env'
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

/**
 * 创建 Agent 的输入参数
 */
export interface CreateAgentInput {
  name: string
  displayName: string
  configPath: string
  configFormat: 'json' | 'toml' | 'env'
}

/**
 * 更新 Agent 的输入参数（所有字段可选）
 */
export interface UpdateAgentInput {
  displayName?: string
  configPath?: string
  configFormat?: 'json' | 'toml' | 'env'
}

/**
 * 将 SQLite 返回的平铺行对象还原为 Agent 类型。
 * 处理 snake_case 到 camelCase 的字段名转换。
 */
function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    configPath: row.config_path,
    configFormat: row.config_format,
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 创建 Agent Repository 实例
 *
 * 采用依赖注入模式，接收 Database 实例，便于测试和模块解耦。
 * 返回的对象包含所有 Agent CRUD 操作方法。
 *
 * @param db - Database 实例
 * @returns Agent Repository 对象
 */
export function createAgentRepository(db: Database) {
  return {
    /**
     * 列出所有 Agent，按 is_builtin DESC, name ASC 排序
     * 内置 Agent 优先显示
     */
    async list(): Promise<Agent[]> {
      const stmt = db.prepare('SELECT * FROM agents ORDER BY is_builtin DESC, name')
      const rows = stmt.all() as AgentRow[]
      return rows.map(rowToAgent)
    },

    /**
     * 按主键查询单个 Agent
     * @param id - Agent ID
     * @returns Agent 对象，不存在时返回 null
     */
    async getById(id: number): Promise<Agent | null> {
      const stmt = db.prepare('SELECT * FROM agents WHERE id = ?')
      const row = stmt.get(id) as AgentRow | undefined
      return row ? rowToAgent(row) : null
    },

    /**
     * 按 name 精确匹配查询 Agent
     * @param name - Agent 名称（全局唯一）
     * @returns Agent 对象，不存在时返回 null
     */
    async getByName(name: string): Promise<Agent | null> {
      const stmt = db.prepare('SELECT * FROM agents WHERE name = ?')
      const row = stmt.get(name) as AgentRow | undefined
      return row ? rowToAgent(row) : null
    },

    /**
     * 创建自定义 Agent
     * is_builtin 固定为 0（用户创建的 Agent 不是内置的）
     *
     * @param input - 创建参数
     * @returns 创建后的完整 Agent 对象
     * @throws 如果 name 已存在则抛出 UNIQUE 约束错误
     */
    async create(input: CreateAgentInput): Promise<Agent> {
      const stmt = db.prepare(
        `INSERT INTO agents (name, display_name, config_path, config_format, is_builtin)
         VALUES (?, ?, ?, ?, 0)`
      )
      const result = stmt.run([input.name, input.displayName, input.configPath, input.configFormat])
      const agent = await this.getById(result.lastInsertRowid)
      if (!agent) throw new Error('Failed to create agent')
      return agent
    },

    /**
     * 部分更新 Agent 字段
     * 仅更新提供的字段，不存在的字段不影响数据库
     * 每次更新自动刷新 updated_at 时间戳
     *
     * @param id - Agent ID
     * @param input - 更新参数
     * @returns 更新后的完整 Agent 对象
     * @throws 如果 Agent 不存在则抛出错误
     */
    async update(id: number, input: UpdateAgentInput): Promise<Agent> {
      const updates: string[] = []
      const values: unknown[] = []

      if (input.displayName !== undefined) {
        updates.push('display_name = ?')
        values.push(input.displayName)
      }
      if (input.configPath !== undefined) {
        updates.push('config_path = ?')
        values.push(input.configPath)
      }
      if (input.configFormat !== undefined) {
        updates.push('config_format = ?')
        values.push(input.configFormat)
      }

      // 无更新字段时直接返回当前 Agent
      if (updates.length === 0) {
        const agent = await this.getById(id)
        if (!agent) throw new Error('Agent not found')
        return agent
      }

      // 每次更新自动刷新 updated_at 时间戳
      updates.push("updated_at = datetime('now')")
      values.push(id)

      const stmt = db.prepare(
        `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`
      )
      stmt.run(values)

      const agent = await this.getById(id)
      if (!agent) throw new Error('Agent not found')
      return agent
    },

    /**
     * 删除 Agent
     * 内置 Agent（is_builtin = 1）不可删除，会抛出错误
     *
     * @param id - Agent ID
     * @throws 如果 Agent 不存在或为内置 Agent 则抛出错误
     */
    async remove(id: number): Promise<void> {
      const agent = await this.getById(id)
      if (!agent) throw new Error('Agent not found')
      if (agent.isBuiltin === 1) throw new Error('Cannot delete builtin agent')
      const stmt = db.prepare('DELETE FROM agents WHERE id = ?')
      stmt.run(id)
    },
  }
}
