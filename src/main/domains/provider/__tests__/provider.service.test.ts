// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../../../db/connection'
import { createTables } from '../../../db/schema'
import { createProviderService } from '../provider.service'

describe('createProviderService', () => {
  beforeAll(async () => {
    await initDatabase(':memory:')
    createTables()
  })

  afterAll(() => {
    closeDatabase()
  })

  it('list 返回空数组当无 provider', async () => {
    const service = createProviderService(getDb())
    const result = await service.list()
    expect(result).toEqual([])
  })

  it('create 创建新 provider 并返回 id', async () => {
    const service = createProviderService(getDb())
    const id = await service.create({
      name: 'Test Provider',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: ['gpt-4']
    })
    expect(typeof id).toBe('number')
  })

  it('list 返回创建的 provider', async () => {
    const service = createProviderService(getDb())
    const items = await service.list()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Test Provider')
    expect(items[0].models).toEqual(['gpt-4'])
  })
})
