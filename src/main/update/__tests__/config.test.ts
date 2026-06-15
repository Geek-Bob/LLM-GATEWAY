import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as configMigration from '../../core/config-migration'

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
      isAutoCheckEnabled: true,
      checkInterval: 4 * 60 * 60 * 1000,
      isPrereleaseAllowed: false,
      skipVersion: null
    })
  })

  it('应该更新配置', () => {
    configManager.updateConfig({ isAutoCheckEnabled: false })
    const config = configManager.getConfig()
    expect(config.isAutoCheckEnabled).toBe(false)
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
    readFileSyncMock.mockReturnValue(JSON.stringify({ isAutoCheckEnabled: false, skipVersion: '2.0.0' }))

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    // 自定义字段覆盖默认值
    expect(config.isAutoCheckEnabled).toBe(false)
    expect(config.skipVersion).toBe('2.0.0')
    // 未指定字段保留默认值
    expect(config.checkInterval).toBe(4 * 60 * 60 * 1000)
    expect(config.isPrereleaseAllowed).toBe(false)
  })

  it('应该处理配置文件中只有部分字段的场景', () => {
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ isPrereleaseAllowed: true }))

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    expect(config.isPrereleaseAllowed).toBe(true)
    // 其余字段保持默认
    expect(config.isAutoCheckEnabled).toBe(true)
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
      isAutoCheckEnabled: true,
      checkInterval: 4 * 60 * 60 * 1000,
      isPrereleaseAllowed: false,
      skipVersion: null
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[.+?\] \[WARN\] \[update-config\] Failed to load update config /)
    )

    warnSpy.mockRestore()
  })

  it('应该延迟读取配置文件（构造时不触发 fs.existsSync）', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ isAutoCheckEnabled: false }))

    // 构造时不应触发任何 fs 调用
    const mgr = new UpdateConfigManager()
    expect(existsSyncMock).not.toHaveBeenCalled()
    expect(readFileSyncMock).not.toHaveBeenCalled()

    // 首次 getConfig() 才触发读取
    const config = mgr.getConfig()
    expect(existsSyncMock).toHaveBeenCalled()
    expect(config.isAutoCheckEnabled).toBe(false)
  })

  it('应该缓存首次读取的结果，后续调用不重复 I/O', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ isAutoCheckEnabled: false }))

    const mgr = new UpdateConfigManager()
    mgr.getConfig() // 首次 — 触发 I/O
    expect(readFileSyncMock).toHaveBeenCalledTimes(1)

    mgr.getConfig() // 第二次 — 命中缓存
    expect(readFileSyncMock).toHaveBeenCalledTimes(1) // 仍为 1
  })

  it('应该缓存 fallback 默认值，不重复读取损坏文件', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue('{ invalid json !!!')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mgr = new UpdateConfigManager()

    mgr.getConfig() // 首次 — 损坏，fallback
    expect(warnSpy).toHaveBeenCalledTimes(1)

    mgr.getConfig() // 第二次 — 缓存命中，不重复读取
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })

  // ====== 字段迁移测试（v1.0.2 → v1.0.4 字段重命名修复） ======

  it('应该迁移旧字段全集 autoCheck=false + allowPrerelease=true', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ autoCheck: false, allowPrerelease: true, skipVersion: '1.0.0' })
    )

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    expect(config.isAutoCheckEnabled).toBe(false)
    expect(config.isPrereleaseAllowed).toBe(true)
    expect(config.skipVersion).toBe('1.0.0')
  })

  it('应该迁移仅 autoCheck 字段，isPrereleaseAllowed 取默认值', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false }))

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    expect(config.isAutoCheckEnabled).toBe(false)
    // 未指定旧/新字段，取默认 false
    expect(config.isPrereleaseAllowed).toBe(false)
  })

  it('新字段直读时应保留原值不迁移', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ isAutoCheckEnabled: false, isPrereleaseAllowed: true })
    )

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    expect(config.isAutoCheckEnabled).toBe(false)
    expect(config.isPrereleaseAllowed).toBe(true)
    // 未发生迁移 → 不应触发 saveConfig 回写
    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('新旧字段共存时应优先使用新字段', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ autoCheck: false, isAutoCheckEnabled: true })
    )

    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    // 新字段已存在 → 不迁移，新字段优先
    expect(config.isAutoCheckEnabled).toBe(true)
  })

  it('迁移触发后应立即回写新 schema 到磁盘', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false, allowPrerelease: true }))

    const mgr = new UpdateConfigManager()
    mgr.getConfig()

    // 应触发 saveConfig
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1)
    const writtenContent = writeFileSyncMock.mock.calls[0][1] as string
    const parsed = JSON.parse(writtenContent)
    // 写盘内容应包含新字段
    expect(parsed.isAutoCheckEnabled).toBe(false)
    expect(parsed.isPrereleaseAllowed).toBe(true)
  })

  it('已迁移文件不应重复触发回写（幂等）', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ isAutoCheckEnabled: false, isPrereleaseAllowed: true })
    )

    const mgr = new UpdateConfigManager()
    mgr.getConfig() // 首次：无迁移，无回写
    mgr.getConfig() // 第二次：缓存命中，仍无回写

    expect(writeFileSyncMock).not.toHaveBeenCalled()
  })

  it('migrator 抛异常时应 logger.warn 并 fallback，不阻塞主流程', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false }))

    // 用 spyOn 替代 vi.doMock + vi.resetModules：不依赖 module registry，
    // 测试顺序无关，且通过 mockRestore 自动还原。
    const applyMigratorsSpy = vi
      .spyOn(configMigration, 'applyMigrators')
      .mockImplementation(() => {
        throw new Error('migrator boom')
      })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const mgr = new UpdateConfigManager()
      // 不应抛异常，fallback 到默认 + raw 合并（不含迁移结果）
      const config = mgr.getConfig()
      expect(config.isAutoCheckEnabled).toBe(true) // 未迁移，取默认值

      // logger.warn 被调用（logger 把 message + data 拼成单字符串后传给 console.warn）
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to migrate update config/)
      )
    } finally {
      applyMigratorsSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('saveConfig 写盘失败时应 logger.warn 但不阻塞主流程', () => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false }))
    writeFileSyncMock.mockImplementation(() => {
      throw new Error('disk full')
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // 不应抛异常
    const mgr = new UpdateConfigManager()
    const config = mgr.getConfig()

    // 主流程仍返回正确结果
    expect(config.isAutoCheckEnabled).toBe(false)
    // logger.warn 被调用（来自 saveConfig 失败）
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to save update config/)
    )

    warnSpy.mockRestore()
  })
})
