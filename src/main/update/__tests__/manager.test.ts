import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    logger: null,
    autoDownload: false,
    allowPrerelease: false
  }
}))

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userData'),
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: true
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

// Mock fs for UpdateConfigManager
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

describe('UpdateManager', () => {
  let updateManager: InstanceType<typeof import('../manager').UpdateManager>

  beforeEach(async () => {
    vi.clearAllMocks()
    const { UpdateManager } = await import('../manager')
    updateManager = new UpdateManager()
  })

  it('应该创建 UpdateManager 实例', () => {
    expect(updateManager).toBeDefined()
  })

  it('应该获取当前版本', () => {
    const version = updateManager.getCurrentVersion()
    expect(version).toBe('1.0.0')
  })

  it('应该检查更新', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '1.1.0' },
      downloadPromise: Promise.resolve()
    } as any)

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      available: true,
      version: '1.1.0'
    })
  })

  it('应该处理无更新情况', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '1.0.0' },
      downloadPromise: Promise.resolve()
    } as any)

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      available: false,
      version: '1.0.0'
    })
  })

  it('应该处理检查更新错误', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('Network error'))

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      available: false,
      error: 'Network error'
    })
  })

  it('应该下载更新', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue([])

    await updateManager.downloadUpdate()
    expect(autoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('应该安装更新', async () => {
    const { autoUpdater } = await import('electron-updater')
    updateManager.installUpdate()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('应该设置允许预发布版本', async () => {
    const { autoUpdater } = await import('electron-updater')
    updateManager.setAllowPrerelease(true)
    expect(autoUpdater.allowPrerelease).toBe(true)
  })
})
