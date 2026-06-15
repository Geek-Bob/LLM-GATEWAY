import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'path'

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
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFile: vi.fn((_p: string, _data: string, cb: (err: Error | null) => void) => cb(null))
}))

// Mock logger 模块以便 spy createLogger 调用参数
vi.mock('../../core/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
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

  it('logger 创建时应使用正确的 file transport 路径', async () => {
    const { createLogger } = await import('../../core/logger')
    expect(createLogger).toHaveBeenCalledWith(
      'update-manager',
      expect.objectContaining({
        file: path.join('/tmp/test-userData', 'logs', 'update.log'),
        truncate: false
      })
    )
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
      isAvailable: true,
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
      isAvailable: false,
      version: '1.0.0'
    })
  })

  it('应该处理检查更新错误', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('Network error'))

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      isAvailable: false,
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
    await updateManager.installUpdate()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('应该设置允许预发布版本', async () => {
    const { autoUpdater } = await import('electron-updater')
    await updateManager.setAllowPrerelease(true)
    expect(autoUpdater.allowPrerelease).toBe(true)
  })

  it('应该通过 notifyRenderer 向所有窗口发送事件', async () => {
    const { BrowserWindow } = await import('electron')
    const mockSend = vi.fn()
    const mockWin = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: mockSend }
    }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

    const { autoUpdater } = await import('electron-updater')
    // 先触发 ensureAutoUpdater（注册事件监听）
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '2.0.0' },
      downloadPromise: Promise.resolve()
    } as any)
    await updateManager.checkForUpdates()

    // 触发 update-available 事件回调来间接测试 notifyRenderer
    const updateAvailableHandler = vi.mocked(autoUpdater.on).mock.calls.find(
      (call) => call[0] === 'update-available'
    )?.[1] as ((info: any) => void) | undefined

    expect(updateAvailableHandler).toBeDefined()
    updateAvailableHandler!({ version: '2.0.0', releaseNotes: 'test' })

    expect(mockSend).toHaveBeenCalledWith('update:available', {
      version: '2.0.0',
      releaseNotes: 'test'
    })
  })

  it('应该跳过已销毁的窗口', async () => {
    const { BrowserWindow } = await import('electron')
    const mockSend = vi.fn()
    const destroyedWin = {
      isDestroyed: vi.fn(() => true),
      webContents: { send: mockSend }
    }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([destroyedWin as any])

    const { autoUpdater } = await import('electron-updater')
    // 先触发 ensureAutoUpdater（注册事件监听）
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '2.0.0' },
      downloadPromise: Promise.resolve()
    } as any)
    await updateManager.checkForUpdates()

    const updateAvailableHandler = vi.mocked(autoUpdater.on).mock.calls.find(
      (call) => call[0] === 'update-available'
    )?.[1] as ((info: any) => void) | undefined

    updateAvailableHandler!({ version: '2.0.0', releaseNotes: 'test' })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('应该跳过已标记跳过的版本', async () => {
    const { autoUpdater } = await import('electron-updater')

    // 先标记 1.1.0 为跳过版本
    updateManager.skipVersion('1.1.0')

    // 模拟检查到 1.1.0 更新
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '1.1.0' },
      downloadPromise: Promise.resolve()
    } as any)

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      isAvailable: false,
      version: '1.1.0'
    })
  })
})
