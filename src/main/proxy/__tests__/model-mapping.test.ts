// @vitest-environment node
/**
 * 模型映射端到端集成测试
 *
 * 测试 models.service 的完整 CRUD 生命周期：
 * 创建映射 -> 查找映射 -> 删除映射，以及 UNIQUE 约束行为。
 * 使用内存数据库，每个测试用例之间清理表数据确保隔离。
 *
 * 注：7e022a9 重构后 service 方法全部 async，所有调用必须 await。
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
    service = createModelsService(getDb())
  })

  it('完整流程：创建映射 -> 查找映射 -> 删除映射', async () => {
    // 1. 创建映射
    const mapping = await service.createModelMapping({
      sourceModel: 'test/source-model',
      targetModel: 'test/target-model',
    })
    expect(mapping.id).toBeDefined()
    expect(mapping.sourceModel).toBe('test/source-model')
    expect(mapping.targetModel).toBe('test/target-model')
    expect(mapping.isActive).toBe(1)

    // 2. 查找映射
    const found = await service.findModelMapping('test/source-model')
    expect(found).not.toBeNull()
    expect(found!.targetModel).toBe('test/target-model')

    // 3. 查找不存在的映射
    const notFound = await service.findModelMapping('nonexistent/model')
    expect(notFound).toBeNull()

    // 4. 删除映射
    await service.deleteModelMapping(mapping.id)
    const afterDelete = await service.findModelMapping('test/source-model')
    expect(afterDelete).toBeNull()
  })

  it('UNIQUE 约束：同一 source_model 不能重复', async () => {
    // 第一次插入应成功
    await service.createModelMapping({
      sourceModel: 'test/duplicate',
      targetModel: 'test/first',
    })

    // 第二次插入相同 source_model 应抛出 SQLite UNIQUE 约束错误
    await expect(
      service.createModelMapping({
        sourceModel: 'test/duplicate',
        targetModel: 'test/second',
      })
    ).rejects.toThrow()
  })

  it('端到端生命周期：创建 -> 更新 -> 验证更新 -> 列表查询 -> 删除', async () => {
    // 1. 创建
    const created = await service.createModelMapping({
      sourceModel: 'e2e/source',
      targetModel: 'e2e/target',
    })
    expect(created.id).toBeDefined()

    // 2. 更新目标模型
    const updated = await service.updateModelMapping(created.id, {
      targetModel: 'e2e/updated-target',
    })
    expect(updated.targetModel).toBe('e2e/updated-target')
    expect(updated.sourceModel).toBe('e2e/source')

    // 3. 通过 findModelMapping 验证更新生效
    const found = await service.findModelMapping('e2e/source')
    expect(found).not.toBeNull()
    expect(found!.targetModel).toBe('e2e/updated-target')

    // 4. 列表查询包含此记录
    const all = await service.listModelMappings()
    expect(all.find((m) => m.id === created.id)).toBeDefined()

    // 5. 删除后确认消失
    await service.deleteModelMapping(created.id)
    const afterDelete = await service.findModelMapping('e2e/source')
    expect(afterDelete).toBeNull()

    const allAfterDelete = await service.listModelMappings()
    expect(allAfterDelete.find((m) => m.id === created.id)).toBeUndefined()
  })
})
