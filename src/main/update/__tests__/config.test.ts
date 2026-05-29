import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron app before importing
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData')
  }
}))

// Mock fs — use vi.hoisted so the mock variables are available before hoisted vi.mock calls
const { existsSyncMock, readFileSyncMock, writeFileSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(() => false),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn()
}))

vi.mock('fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock
}))

import { UpdateConfigManager } from '../config'

describe('UpdateConfigManager', () => {
  let configManager: UpdateConfigManager

  beforeEach(() => {
    vi.clearAllMocks()
    // 默认：配置文件不存在
    existsSyncMock.mockReturnValue(false)
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

  it('应该从已有配置文件加载并 merge 到默认配置', () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false, skipVersion: '2.0.0' }))

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    // 自定义字段覆盖默认值
    expect(config.autoCheck).toBe(false)
    expect(config.skipVersion).toBe('2.0.0')
    // 未指定字段保留默认值
    expect(config.checkInterval).toBe(4 * 60 * 60 * 1000)
    expect(config.allowPrerelease).toBe(false)
  })

  it('应该处理配置文件中只有部分字段的场景', () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ allowPrerelease: true }))

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    expect(config.allowPrerelease).toBe(true)
    // 其余字段保持默认
    expect(config.autoCheck).toBe(true)
    expect(config.checkInterval).toBe(4 * 60 * 60 * 1000)
    expect(config.skipVersion).toBeNull()
  })

  it('应该在 JSON 格式损坏时 fallback 到默认配置', () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue('{ invalid json !!!')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    expect(config).toEqual({
      autoCheck: true,
      checkInterval: 4 * 60 * 60 * 1000,
      allowPrerelease: false,
      skipVersion: null
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[UpdateConfig] loadConfig failed:',
      expect.any(SyntaxError)
    )

    warnSpy.mockRestore()
  })
})
