/**
 * Agent Service 业务逻辑层
 *
 * 封装 Agent 和 AgentConfig 的业务操作，包括：
 * - Agent CRUD（依赖注入模式，接收 Database 实例）
 * - AgentConfig CRUD（依赖注入模式，接收 Database 实例）
 * - 配置切换（原子写入到 Agent 配置路径）
 *
 * 关键设计决策：
 * - Agent Repository 使用依赖注入模式（Pattern A），便于测试
 * - AgentConfig Repository 使用依赖注入模式（Pattern A），接收 Database 实例
 * - switchConfig 使用原子写入（临时文件 + rename），确保配置一致性
 * - 写入失败时回滚数据库状态
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { Database } from '../../db/database'
import { createAgentRepository, type AgentRow } from '../../db/agents'
import { createAgentConfigRepository, type AgentConfigRow } from '../../db/agent-configs'
import { createLogger } from '../../core/logger'
import type {
  AgentEntity,
  AgentConfigEntity,
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  SwitchConfigInput,
} from './agent.types'

const logger = createLogger('agent-service')

/**
 * 展开 ~ 路径为用户主目录
 * @param p - 可能包含 ~ 的路径
 * @returns 展开后的完整路径
 */
function expandHomePath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}

/**
 * 创建 Agent Service 实例
 *
 * 采用依赖注入模式，接收 Database 实例，便于测试和模块解耦。
 * 返回的对象包含所有 Agent 和 AgentConfig 的业务操作方法。
 *
 * @param db - Database 实例
 * @returns Agent Service 对象
 */
export function createAgentService(db: Database) {
  const agentRepo = createAgentRepository(db)
  const configRepo = createAgentConfigRepository(db)

  return {
    /**
     * 列出所有 Agent
     * @returns AgentEntity 数组，按 is_builtin DESC, name ASC 排序
     */
    async list(): Promise<AgentEntity[]> {
      const rows = await agentRepo.list()
      return rows.map(agentRowToEntity)
    },

    /**
     * 获取单个 Agent
     * @param id - Agent ID
     * @returns AgentEntity 对象，不存在时返回 null
     */
    async getById(id: number): Promise<AgentEntity | null> {
      const row = await agentRepo.getById(id)
      return row ? agentRowToEntity(row) : null
    },

    /**
     * 创建自定义 Agent
     * @param input - 创建参数
     * @returns 创建后的完整 AgentEntity 对象
     * @throws 如果 name 已存在则抛出 UNIQUE 约束错误
     */
    async create(input: CreateAgentInput): Promise<AgentEntity> {
      const row = await agentRepo.create(input)
      return agentRowToEntity(row)
    },

    /**
     * 更新 Agent
     * @param id - Agent ID
     * @param input - 更新参数
     * @returns 更新后的完整 AgentEntity 对象
     * @throws 如果 Agent 不存在则抛出错误
     */
    async update(id: number, input: UpdateAgentInput): Promise<AgentEntity> {
      const row = await agentRepo.update(id, input)
      if (!row) throw new Error(`Failed to update agent: agent ${id} not found`)
      return agentRowToEntity(row)
    },

    /**
     * 删除自定义 Agent（内置不可删）
     * @param id - Agent ID
     * @throws 如果 Agent 不存在则抛出 `agent ${id} not found` 错误
     * @throws 如果 Agent 为内置 Agent 则抛出 `cannot delete builtin agent` 错误
     */
    async remove(id: number): Promise<void> {
      // 业务规则：内置 Agent 不可删除（在 service 层校验，保持 db 层为纯 CRUD）
      const agent = await agentRepo.getById(id)
      if (!agent) throw new Error(`Failed to delete agent: agent ${id} not found`)
      if (agent.is_builtin === 1) throw new Error(`Failed to delete agent: cannot delete builtin agent ${id}`)
      await agentRepo.remove(id)
    },

    /**
     * 列出某个 Agent 的所有配置
     * @param agentId - Agent ID
     * @returns AgentConfigEntity 数组，按 name ASC 排序
     */
    async listConfigs(agentId: number): Promise<AgentConfigEntity[]> {
      const rows = await configRepo.listByAgent(agentId)
      return rows.map(configRowToEntity)
    },

    /**
     * 获取单个配置
     * @param id - 配置 ID
     * @returns AgentConfigEntity 对象，不存在时返回 null
     */
    async getConfig(id: number): Promise<AgentConfigEntity | null> {
      const row = await configRepo.getById(id)
      return row ? configRowToEntity(row) : null
    },

    /**
     * 创建配置
     * @param input - 创建参数
     * @returns 创建后的完整 AgentConfigEntity 对象
     * @throws 如果同名配置已存在则抛出 UNIQUE 约束错误
     */
    async createConfig(input: CreateAgentConfigInput): Promise<AgentConfigEntity> {
      const row = await configRepo.create(input)
      return configRowToEntity(row)
    },

    /**
     * 更新配置内容
     * @param id - 配置 ID
     * @param input - 更新参数
     * @returns 更新后的完整 AgentConfigEntity 对象
     * @throws 如果配置不存在则抛出错误
     */
    async updateConfig(id: number, input: UpdateAgentConfigInput): Promise<AgentConfigEntity> {
      const row = await configRepo.updateContent(id, input.content)
      if (!row) throw new Error(`Failed to update config: config ${id} not found`)
      return configRowToEntity(row)
    },

    /**
     * 删除配置
     *
     * 业务规则：当前激活的配置不可删除，防止误操作。
     *
     * @param id - 配置 ID
     * @throws 如果配置不存在则抛出 not found 错误
     * @throws 如果配置为当前激活配置则抛出 cannot delete current config 错误
     */
    async deleteConfig(id: number): Promise<void> {
      // 业务规则：不能删除当前激活配置（在 service 层校验，保持 db 层为纯 CRUD）
      const config = await configRepo.getById(id)
      if (!config) throw new Error(`Failed to delete config: config ${id} not found`)
      if (config.is_current === 1) {
        throw new Error(`Failed to delete config: cannot delete current config ${id}`)
      }
      return configRepo.remove(id)
    },

    /**
     * 读取 Agent 配置文件内容
     *
     * 读取 Agent config_path 指向的文件内容，用于新建配置时预填充编辑器。
     * 文件不存在时返回空字符串（不报错，因为配置文件可能尚未创建）。
     *
     * @param agentId - Agent ID
     * @returns 文件内容字符串，文件不存在时返回空字符串
     * @throws 如果 Agent 不存在则抛出错误
     */
    async readConfigFile(agentId: number): Promise<string> {
      const agent = await agentRepo.getById(agentId)
      if (!agent) throw new Error(`Failed to read config file: agent ${agentId} not found`)

      const configPath = expandHomePath(agent.config_path)
      try {
        return await fs.readFile(configPath, 'utf-8')
      } catch (error) {
        // 文件不存在是正常情况（用户可能尚未创建配置文件）
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return ''
        }
        throw new Error(`Failed to read config file: ${configPath}`, { cause: error })
      }
    },

    /**
     * 切换配置（原子写入到 Agent 路径）
     *
     * 流程：
     * 1. 校验配置和 Agent 存在性
     * 2. 更新数据库状态（setCurrent）
     * 3. 原子写入到 Agent 配置路径（临时文件 + rename）
     * 4. 写入失败时回滚数据库状态
     *
     * @param input - 切换参数（agentId, configId）
     * @throws 如果配置或 Agent 不存在则抛出错误
     * @throws 如果文件写入失败则抛出错误（数据库已回滚）
     */
    async switchConfig(input: SwitchConfigInput): Promise<void> {
      const { agentId, configId } = input

      // 1. 读取配置和 Agent 信息
      const config = await configRepo.getById(configId)
      if (!config) throw new Error(`Failed to switch config: config ${configId} not found`)
      if (config.agent_id !== agentId) throw new Error(`Failed to switch config: config ${configId} does not belong to agent ${agentId}`)

      const agent = await agentRepo.getById(agentId)
      if (!agent) throw new Error(`Failed to switch config: agent ${agentId} not found`)

      // 2. 保存当前状态（用于回滚）
      const previousCurrent = await configRepo.getCurrent(agentId)

      // 3. 更新数据库状态
      await configRepo.setCurrent(agentId, configId)

      // 4. 原子写入到 Agent 路径
      const configPath = expandHomePath(agent.config_path)
      const dir = path.dirname(configPath)
      const tmpPath = `${configPath}.tmp.${Date.now()}`

      try {
        // 确保目录存在
        await fs.mkdir(dir, { recursive: true })

        // 写入临时文件
        await fs.writeFile(tmpPath, config.content, 'utf-8')

        // 原子替换
        await fs.rename(tmpPath, configPath)
      } catch (error) {
        // 写入失败，回滚数据库状态（回滚本身也需要 try-catch，避免掩盖原始错误）
        try {
          if (previousCurrent) {
            await configRepo.setCurrent(agentId, previousCurrent.id)
          } else {
            // 如果之前没有 current 配置，清除所有 current 标记
            await configRepo.clearCurrent(agentId)
          }
        } catch (rollbackError) {
          // 回滚失败，记录日志但不掩盖原始错误
          logger.error('Failed to rollback database state after switchConfig write failure', {
            agentId,
            configId,
            error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          })
        }
        throw error
      }
    },
  }
}

/**
 * 将数据库层 snake_case AgentRow 转换为 camelCase AgentEntity。
 */
function agentRowToEntity(row: AgentRow): AgentEntity {
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
 * 将数据库层 snake_case AgentConfigRow 转换为 camelCase AgentConfigEntity。
 */
function configRowToEntity(row: AgentConfigRow): AgentConfigEntity {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    content: row.content,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type AgentService = ReturnType<typeof createAgentService>
