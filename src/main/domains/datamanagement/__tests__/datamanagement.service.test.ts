// @vitest-environment node
/**
 * Task 4: createDataManagementService 清空编排测试。
 *
 * 覆盖 6 类场景（TDD Red → Green）：
 * 1. 单业务：clear({business:true}) 清空 4 表，返回 business.cleared=true
 * 2. Agent 保护：清空后 agents / agent_configs 行数不变
 * 3. 级联：messages 表随 conversations 级联清空
 * 4. 单运行：clear({operational:true}) 清统计表 + 删日志文件 + 计数器重置
 * 5. 组合：clear({business:true, operational:true}) 先业务后运行，两者均 cleared
 * 6. 事务原子性：业务中途失败 → ROLLBACK（4 表均未清空），抛 Failed to clear business data
 * 7. 部分成功：组合输入下运行失败时，业务已清空不可回滚，抛含提示的错误
 *
 * 测试手段：
 * - 内存数据库 + 临时日志目录，不 mock 内部 Repository
 * - 失败注入采用真实 db 状态（DROP TABLE）或模块自然失败（resetLogs 未初始化），
 *   不 mock 正常行为，符合 backend/37-testing.md「Mock 边界」
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { initDatabase, closeDatabase } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createProviderRepository } from '../../../db/providers'
import { createModelMappingRepository } from '../../../db/model-mappings'
import { createApiKeyRepository } from '../../../db/api-keys'
import { createConversationRepository } from '../../../db/conversations'
import { createLogStatsRepository } from '../../../db/logs-stats'
import { getDb } from '../../../db/connection'
import { initLogsDir, createLogEntry, resetLogs, getEntryCounter, getCurrentFileLines } from '../../../db/logs-writer'
import { createDataManagementService } from '../datamanagement.service'

function tmpLogDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datamgmt-svc-')))
}

function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

/**
 * 获取表行数（只读断言，不经 service）。
 * 表名经白名单过滤避免 SQL 注入（仅测试内部使用，表名均来自 schema）。
 */
function rowCount(table: 'providers' | 'model_mappings' | 'api_keys' | 'conversations' | 'messages' | 'agents' | 'agent_configs' | 'request_stats' | 'request_stats_provider'): number {
  const db = getDb()
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }
  return row.cnt
}

/**
 * 预置业务数据：每个表写入 2 条记录。
 * agents 表由 createTables 自动插入 7 个内置预设，这里不再额外写入。
 */
async function seedBusinessData(): Promise<void> {
  const db = getDb()
  const providerRepo = createProviderRepository(db)
  const modelMappingRepo = createModelMappingRepository(db)
  const apiKeyRepo = createApiKeyRepository(db)
  const conversationRepo = createConversationRepository(db)

  await providerRepo.create({ name: 'openai', providerType: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'sk-openai-xxx', models: ['gpt-4'] })
  await providerRepo.create({ name: 'anthropic', providerType: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant-xxx', models: ['claude-3'] })
  await modelMappingRepo.create('gpt-3.5', 'openai/gpt-4')
  await modelMappingRepo.create('claude-haiku', 'anthropic/claude-3-haiku')
  await apiKeyRepo.create('key-1', 60)
  await apiKeyRepo.create('key-2', 100)
  const conv1 = await conversationRepo.create('对话1', 'gpt-4')
  const conv2 = await conversationRepo.create('对话2', 'claude-3')
  await conversationRepo.addMessage(conv1.id, 'user', '你好', '')
  await conversationRepo.addMessage(conv1.id, 'assistant', '你好，有什么可以帮你？', '')
  await conversationRepo.addMessage(conv2.id, 'user', '写代码', '')
}

/**
 * 预置运行数据：统计表写若干行 + NDJSON 日志文件写若干条。
 * 调用前需先 initLogsDir(logDir)。
 */
async function seedOperationalData(): Promise<void> {
  const db = getDb()
  const statsRepo = createLogStatsRepository(db)
  await statsRepo.updateRequestStats({ tokensIn: 100, tokensOut: 50, durationMs: 500, statusCode: 200 })
  await statsRepo.updateRequestStats({ tokensIn: 200, tokensOut: 80, durationMs: 800, statusCode: 500 })
  await statsRepo.updateProviderStats({ providerId: 1, model: 'gpt-4', tokensIn: 100, tokensOut: 50, durationMs: 500, statusCode: 200 })
  await statsRepo.updateProviderStats({ providerId: 2, model: 'claude-3', tokensIn: 200, tokensOut: 80, durationMs: 800, statusCode: 500 })

  for (let i = 0; i < 5; i++) {
    createLogEntry({ model: 'gpt-4', apiFormat: 'openai', statusCode: 200, tokensIn: 100, tokensOut: 50 })
  }
}

describe('createDataManagementService.clear', () => {
  let logDir: string

  beforeEach(async () => {
    logDir = tmpLogDir()
    await initDatabase(':memory:')
    createTables()
    initLogsDir(logDir)
  })

  afterEach(() => {
    closeDatabase()
    rmDir(logDir)
    vi.resetModules()
  })

  describe('单业务清空 (business=true)', () => {
    it('清空 providers/model_mappings/api_keys/conversations 4 表，返回 business.cleared=true', async () => {
      await seedBusinessData()
      expect(rowCount('providers')).toBe(2)
      expect(rowCount('model_mappings')).toBe(2)
      expect(rowCount('api_keys')).toBe(2)
      expect(rowCount('conversations')).toBe(2)

      const service = createDataManagementService(getDb())
      const result = await service.clear({ business: true, operational: false })

      expect(result.business.cleared).toBe(true)
      expect(result.operational.cleared).toBe(false)
      expect(rowCount('providers')).toBe(0)
      expect(rowCount('model_mappings')).toBe(0)
      expect(rowCount('api_keys')).toBe(0)
      expect(rowCount('conversations')).toBe(0)
    })

    it('messages 表随 conversations 级联清空', async () => {
      await seedBusinessData()
      expect(rowCount('messages')).toBe(3)

      const service = createDataManagementService(getDb())
      await service.clear({ business: true, operational: false })

      expect(rowCount('messages')).toBe(0)
    })

    it('agents 和 agent_configs 行数不变（Agent 保护）', async () => {
      await seedBusinessData()
      const agentsBefore = rowCount('agents')
      const agentConfigsBefore = rowCount('agent_configs')
      expect(agentsBefore).toBe(7) // createTables 内置 7 个预设

      const service = createDataManagementService(getDb())
      await service.clear({ business: true, operational: false })

      expect(rowCount('agents')).toBe(agentsBefore)
      expect(rowCount('agent_configs')).toBe(agentConfigsBefore)
    })
  })

  describe('单运行清空 (operational=true)', () => {
    it('清空 request_stats / request_stats_provider，删除日志文件并重置计数器', async () => {
      await seedOperationalData()
      expect(rowCount('request_stats')).toBeGreaterThan(0)
      expect(rowCount('request_stats_provider')).toBeGreaterThan(0)
      expect(getEntryCounter()).toBe(5)
      expect(getCurrentFileLines()).toBe(5)
      expect(fs.readdirSync(logDir).filter((f) => /^logs-\d{4}\.ndjson$/.test(f))).toHaveLength(1)

      const service = createDataManagementService(getDb())
      const result = await service.clear({ business: false, operational: true })

      expect(result.business.cleared).toBe(false)
      expect(result.operational.cleared).toBe(true)
      expect(rowCount('request_stats')).toBe(0)
      expect(rowCount('request_stats_provider')).toBe(0)
      expect(getEntryCounter()).toBe(0)
      expect(getCurrentFileLines()).toBe(0)
      expect(fs.readdirSync(logDir).filter((f) => /^logs-\d{4}\.ndjson$/.test(f))).toHaveLength(0)
      expect(fs.existsSync(path.join(logDir, 'logs-meta.json'))).toBe(false)
    })

    it('业务数据不受影响', async () => {
      await seedBusinessData()
      await seedOperationalData()
      const providersBefore = rowCount('providers')

      const service = createDataManagementService(getDb())
      await service.clear({ business: false, operational: true })

      expect(rowCount('providers')).toBe(providersBefore)
    })
  })

  describe('组合清空 (business=true, operational=true)', () => {
    it('先业务后运行，两者均 cleared=true', async () => {
      await seedBusinessData()
      await seedOperationalData()

      const service = createDataManagementService(getDb())
      const result = await service.clear({ business: true, operational: true })

      expect(result.business.cleared).toBe(true)
      expect(result.operational.cleared).toBe(true)
      expect(rowCount('providers')).toBe(0)
      expect(rowCount('model_mappings')).toBe(0)
      expect(rowCount('api_keys')).toBe(0)
      expect(rowCount('conversations')).toBe(0)
      expect(rowCount('messages')).toBe(0)
      expect(rowCount('request_stats')).toBe(0)
      expect(rowCount('request_stats_provider')).toBe(0)
      expect(getEntryCounter()).toBe(0)
      expect(getCurrentFileLines()).toBe(0)
    })
  })

  describe('事务原子性：业务中途失败 → ROLLBACK', () => {
    it('api_keys 表缺失导致 clearAll 抛错时，4 表均未清空，抛 Failed to clear business data', async () => {
      await seedBusinessData()
      expect(rowCount('providers')).toBe(2)
      expect(rowCount('model_mappings')).toBe(2)
      expect(rowCount('api_keys')).toBe(2)
      expect(rowCount('conversations')).toBe(2)

      // 制造中途失败：DROP api_keys 表后 DELETE FROM api_keys 自然抛 'no such table'
      // 顺序：providers(成功) → model_mappings(成功) → api_keys(失败，触发 ROLLBACK)
      const db = getDb()
      db.exec('DROP TABLE api_keys')

      const service = createDataManagementService(db)
      await expect(service.clear({ business: true, operational: false }))
        .rejects.toThrow(/Failed to clear business data:/)

      // ROLLBACK 后 providers / model_mappings / conversations 数据恢复（事务原子）
      expect(rowCount('providers')).toBe(2)
      expect(rowCount('model_mappings')).toBe(2)
      // api_keys 表已不存在（DROP 不在事务中恢复，因 DROP 属 DDL 在 sql.js 中隐式提交）
      // conversations 应已回滚恢复
      expect(rowCount('conversations')).toBe(2)
      expect(rowCount('messages')).toBe(3)
    })
  })

  describe('部分成功：运行数据失败时业务已清空', () => {
    it('组合输入下 resetLogs 抛错时，业务已清空，错误消息含 business data already cleared', async () => {
      await seedBusinessData()
      await seedOperationalData()

      // 制造运行数据失败：重置 logsDir 为未初始化状态（resetLogs 抛 'Logs directory not initialized'）
      // 通过重新加载模块获得 logsDir=null 的干净状态
      vi.resetModules()
      const { createDataManagementService: freshCreateService } = await import('../datamanagement.service')
      // resetLogs 来自重新加载的 logs-writer，此时 logsDir 为 null
      // 但 service 内部 import 的 resetLogs 是首次加载时的引用——
      // 为确保 service 调用的是未初始化的 resetLogs，需要 service 也重新加载
      // （vi.resetModules 已在上面执行，下面 freshCreateService 来自新模块实例，
      //  它 import 的 resetLogs 也来自新的 logs-writer 模块实例，logsDir=null）

      const service = freshCreateService(getDb())
      await expect(service.clear({ business: true, operational: true }))
        .rejects.toThrow(/Failed to clear operational data: .*\(business data already cleared\)/)

      // 业务数据已实际清空（不可回滚）
      expect(rowCount('providers')).toBe(0)
      expect(rowCount('model_mappings')).toBe(0)
      expect(rowCount('api_keys')).toBe(0)
      expect(rowCount('conversations')).toBe(0)
      expect(rowCount('messages')).toBe(0)
    })
  })
})
