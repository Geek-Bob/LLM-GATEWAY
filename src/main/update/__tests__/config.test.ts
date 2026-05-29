import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron app before importing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData')
  }
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

import { UpdateConfigManager } from '../config'

describe('UpdateConfigManager', () => {
  let configManager: UpdateConfigManager

  beforeEach(() => {
    vi.clearAllMocks()
    configManager = new UpdateConfigManager()
  })

  it('应该返回默认配置', () => {
    const config = configManager.getConfig()
    expect(config).toEqual({
      autoCheck: true,
      checkInterval: 4 * 60 * 60 * 1000,
      allowPrerelease: false,
      skipVersion: null
    })
  })

  it('应该更新配置', () => {
    configManager.updateConfig({ autoCheck: false })
    const config = configManager.getConfig()
    expect(config.autoCheck).toBe(false)
  })

  it('应该设置跳过版本', () => {
    configManager.setSkipVersion('1.2.0')
    const config = configManager.getConfig()
    expect(config.skipVersion).toBe('1.2.0')
  })

  it('应该清除跳过版本', () => {
    configManager.setSkipVersion('1.2.0')
    configManager.setSkipVersion(null)
    const config = configManager.getConfig()
    expect(config.skipVersion).toBeNull()
  })

  it('应该检查是否跳过指定版本', () => {
    configManager.setSkipVersion('1.2.0')
    expect(configManager.shouldSkipVersion('1.2.0')).toBe(true)
    expect(configManager.shouldSkipVersion('1.3.0')).toBe(false)
  })
})
