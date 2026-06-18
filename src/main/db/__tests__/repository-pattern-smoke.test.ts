// @vitest-environment node
/**
 * Repository 模式防回归冒烟测试
 *
 * 仅 import 所有 createXxxRepository 工厂，断言：
 * 1. 每个工厂导出存在且 typeof === 'function'
 * 2. 工厂调用后返回对象具备约定的关键方法
 *
 * 后续任何 Repository 重构遗失 export，import 阶段即被本测试捕获，CI 立即失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDatabase, closeDatabase } from '../connection'
import { createTables } from '../schema'
import type { Database } from '../database'
import { createProviderRepository } from '../providers'
import { createApiKeyRepository } from '../api-keys'
import { createConversationRepository } from '../conversations'
import { createAgentRepository } from '../agents'
import { createAgentConfigRepository } from '../agent-configs'
import { createModelMappingRepository } from '../model-mappings'
import { createLogStatsRepository } from '../logs-stats'

type RepoFactory = (db: Database) => Record<string, unknown>

const repositoryContracts: Array<[string, RepoFactory, string[]]> = [
  [
    'createProviderRepository',
    createProviderRepository as unknown as RepoFactory,
    ['list', 'findById', 'findByName', 'listActive', 'listNames', 'create', 'update', 'remove']
  ],
  [
    'createApiKeyRepository',
    createApiKeyRepository as unknown as RepoFactory,
    ['list', 'findById', 'create', 'findPlaintextById', 'verify', 'remove']
  ],
  [
    'createConversationRepository',
    createConversationRepository as unknown as RepoFactory,
    ['list', 'findById', 'create', 'update', 'remove', 'listMessages', 'addMessage']
  ],
  [
    'createAgentRepository',
    createAgentRepository as unknown as RepoFactory,
    ['list', 'getById', 'getByName', 'create', 'update', 'remove']
  ],
  [
    'createAgentConfigRepository',
    createAgentConfigRepository as unknown as RepoFactory,
    ['listByAgent', 'getById', 'getCurrent', 'create', 'updateContent', 'setCurrent', 'clearCurrent', 'remove']
  ],
  [
    'createModelMappingRepository',
    createModelMappingRepository as unknown as RepoFactory,
    ['list', 'findById', 'findActive', 'create', 'update', 'remove']
  ],
  [
    'createLogStatsRepository',
    createLogStatsRepository as unknown as RepoFactory,
    ['updateRequestStats', 'updateProviderStats', 'getStats', 'getRangeSummary', 'getDetailedStats']
  ]
]

describe('Repository pattern smoke test', () => {
  let db: Database

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    createTables()
  })

  afterEach(() => {
    closeDatabase()
  })

  it.each(repositoryContracts)(
    '%s should be a function and produce an object with required methods',
    (_name, factory, methods) => {
      expect(typeof factory).toBe('function')
      const repo = factory(db)
      expect(repo).toBeTypeOf('object')
      expect(repo).not.toBeNull()
      for (const method of methods) {
        expect(repo).toHaveProperty(method)
        expect(typeof repo[method]).toBe('function')
      }
    }
  )
})
