// @vitest-environment node
/**
 * 模型映射端到端集成测试
 *
 * 测试 models.service 的完整 CRUD 生命周期：
 * 创建映射 -> 查找映射 -> 删除映射，以及 UNIQUE 约束行为。
 * 使用内存数据库，每个测试用例之间清理表数据确保隔离。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../../db/connection'
import { createTables } from '../../db/schema'
import { createModelsService } from '../../domains/models/models.service'

describe('模型映射端到端', () => {
  let service: ReturnType<typeof createModelsService>

  beforeAll(async () => {
    // 初始化内存数据库，避免文件 I/O 和测试间干扰
    await initDatabase(':memory:')
    createTables()
  })

  afterAll(() => {
    closeDatabase()
  })

  beforeEach(() => {
    // 每个测试前清理 model_mappings 表，确保测试隔离
    const db = getDb()
    db.exec('DELETE FROM model_mappings')
    service = createModelsService()
  })

  it('完整流程：创建映射 -> 查找映射 -> 删除映射', () => {
    // 1. 创建映射
    const mapping = service.createModelMapping({
      providerType: 'anthropic',
      sourceModel: 'test/source-model',
      targetModel: 'test/target-model',
    })
    expect(mapping.id).toBeDefined()
    expect(mapping.providerType).toBe('anthropic')
    expect(mapping.sourceModel).toBe('test/source-model')
    expect(mapping.targetModel).toBe('test/target-model')
    expect(mapping.isActive).toBe(1)

    // 2. 查找映射
    const found = service.findModelMapping('anthropic', 'test/source-model')
    expect(found).not.toBeNull()
    expect(found!.targetModel).toBe('test/target-model')

    // 3. 查找不存在的映射
    const notFound = service.findModelMapping('anthropic', 'nonexistent/model')
    expect(notFound).toBeNull()

    // 4. 删除映射
    service.deleteModelMapping(mapping.id)
    const afterDelete = service.findModelMapping('anthropic', 'test/source-model')
    expect(afterDelete).toBeNull()
  })

  it('UNIQUE 约束：同一 provider_type + source_model 不能重复', () => {
    // 第一次插入应成功
    service.createModelMapping({
      providerType: 'openai',
      sourceModel: 'test/duplicate',
      targetModel: 'test/first',
    })

    // 第二次插入相同 provider_type + source_model 应抛出 SQLite UNIQUE 约束错误
    expect(() => {
      service.createModelMapping({
        providerType: 'openai',
        sourceModel: 'test/duplicate',
        targetModel: 'test/second',
      })
    }).toThrow()
  })

  it('端到端生命周期：创建 -> 更新 -> 验证更新 -> 列表查询 -> 删除', () => {
    // 1. 创建
    const created = service.createModelMapping({
      providerType: 'openai',
      sourceModel: 'e2e/source',
      targetModel: 'e2e/target',
    })
    expect(created.id).toBeDefined()

    // 2. 更新目标模型
    const updated = service.updateModelMapping(created.id, {
      targetModel: 'e2e/updated-target',
    })
    expect(updated.targetModel).toBe('e2e/updated-target')
    expect(updated.sourceModel).toBe('e2e/source')

    // 3. 通过 findModelMapping 验证更新生效
    const found = service.findModelMapping('openai', 'e2e/source')
    expect(found).not.toBeNull()
    expect(found!.targetModel).toBe('e2e/updated-target')

    // 4. 列表查询包含此记录
    const all = service.listModelMappings()
    expect(all.find((m) => m.id === created.id)).toBeDefined()

    // 5. 删除后确认消失
    service.deleteModelMapping(created.id)
    const afterDelete = service.findModelMapping('openai', 'e2e/source')
    expect(afterDelete).toBeNull()

    const allAfterDelete = service.listModelMappings()
    expect(allAfterDelete.find((m) => m.id === created.id)).toBeUndefined()
  })
})
