// @vitest-environment node
/**
 * models.service 单元测试
 *
 * 使用内存数据库测试模型映射 CRUD 和模型列表查询。
 * 遵循 Domain Pattern 模式 B（无状态 service，内部通过模块级 import 访问 db）。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createModelsService } from '../models.service'

describe('models.service', () => {
  let service: ReturnType<typeof createModelsService>

  beforeAll(async () => {
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

  describe('getAllModels', () => {
    it('无活跃 provider 时应返回空数组', () => {
      const models = service.getAllModels()
      expect(Array.isArray(models)).toBe(true)
      expect(models).toHaveLength(0)
    })

    it('应返回活跃 provider 的模型列表', () => {
      // 插入一个活跃 provider，models 以 JSON 数组存储
      const db = getDb()
      db.prepare(`
        INSERT INTO providers (name, provider_type, base_url, api_key, models, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(['test-provider', 'openai', 'https://api.test.com', 'sk-test', '["gpt-4","gpt-3.5-turbo"]', 1])

      const models = service.getAllModels()
      expect(models).toHaveLength(2)
      expect(models[0]).toEqual({
        id: 'test-provider/gpt-4',
        provider: 'test-provider',
        providerType: 'openai',
      })
      expect(models[1]).toEqual({
        id: 'test-provider/gpt-3.5-turbo',
        provider: 'test-provider',
        providerType: 'openai',
      })

      // 清理 provider 数据
      db.exec('DELETE FROM providers')
    })

    it('不活跃的 provider 应被排除', () => {
      const db = getDb()
      db.prepare(`
        INSERT INTO providers (name, provider_type, base_url, api_key, models, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(['inactive-provider', 'openai', 'https://api.test.com', 'sk-test', '["gpt-4"]', 0])

      const models = service.getAllModels()
      expect(models).toHaveLength(0)

      // 清理 provider 数据
      db.exec('DELETE FROM providers')
    })
  })

  describe('findModelMapping', () => {
    it('未找到映射时应返回 null', () => {
      const result = service.findModelMapping('nonexistent/model')
      expect(result).toBeNull()
    })

    it('应返回匹配的活跃映射', () => {
      service.createModelMapping({
        sourceModel: 'claude-3-opus',
        targetModel: 'claude-3-opus-20240229',
      })

      const result = service.findModelMapping('claude-3-opus')
      expect(result).not.toBeNull()
      expect(result!.sourceModel).toBe('claude-3-opus')
      expect(result!.targetModel).toBe('claude-3-opus-20240229')
    })

    it('非活跃映射不应被查到', () => {
      const created = service.createModelMapping({
        sourceModel: 'gpt-4',
        targetModel: 'gpt-4-turbo',
      })
      // 手动将映射设为非活跃
      const db = getDb()
      db.prepare('UPDATE model_mappings SET is_active = 0 WHERE id = ?').run([created.id])

      const result = service.findModelMapping('gpt-4')
      expect(result).toBeNull()
    })
  })

  describe('CRUD', () => {
    it('应能创建、查询、更新、删除映射', () => {
      // 创建
      const created = service.createModelMapping({
        sourceModel: 'test/source',
        targetModel: 'test/target',
      })
      expect(created.id).toBeDefined()
      expect(created.sourceModel).toBe('test/source')
      expect(created.targetModel).toBe('test/target')
      expect(created.isActive).toBe(1)

      // 列表查询
      const mappings = service.listModelMappings()
      expect(mappings.length).toBeGreaterThan(0)
      expect(mappings.find(m => m.id === created.id)).toBeDefined()

      // 更新
      const updated = service.updateModelMapping(created.id, {
        targetModel: 'test/updated',
      })
      expect(updated.targetModel).toBe('test/updated')
      expect(updated.sourceModel).toBe('test/source') // 未更新的字段保持不变

      // 删除
      service.deleteModelMapping(created.id)
      const afterDelete = service.listModelMappings()
      expect(afterDelete.find(m => m.id === created.id)).toBeUndefined()
    })

    it('更新应支持修改多个字段', () => {
      const created = service.createModelMapping({
        sourceModel: 'old/source',
        targetModel: 'old/target',
      })

      const updated = service.updateModelMapping(created.id, {
        sourceModel: 'new/source',
        targetModel: 'new/target',
      })
      expect(updated.sourceModel).toBe('new/source')
      expect(updated.targetModel).toBe('new/target')
    })

    it('listModelMappings 应按 id 降序排列', () => {
      service.createModelMapping({
        sourceModel: 'model-a',
        targetModel: 'target-a',
      })
      service.createModelMapping({
        sourceModel: 'model-b',
        targetModel: 'target-b',
      })

      const mappings = service.listModelMappings()
      expect(mappings.length).toBeGreaterThanOrEqual(2)
      // 最新创建的排在前面
      expect(mappings[0].id).toBeGreaterThan(mappings[1].id)
    })
  })
})
