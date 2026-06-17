/**
 * 回归测试：electron-updater 运行时动态导入的 cjs interop
 *
 * electron-updater 通过 Object.defineProperty(exports, "autoUpdater", { get }) 导出,
 * Node 运行时 await import() 经 cjs-module-lexer 无法静态识别该命名导出,
 * 实际拿到的是 { default: module.exports } 形态（default.autoUpdater 经 getter 取实例）。
 *
 * 本测试用 default-only mock 锁死 manager.ensureAutoUpdater 必须经 default 取实例,
 * 防止未来回退为 const { autoUpdater } = await import(...) 导致
 * "Cannot set properties of undefined (setting 'logger')" 复发。
 */
import { describe, it, expect, vi } from 'vitest'

// default-only 形态：模拟 Node 运行时 cjs interop 的真实结构
// （命名导出 autoUpdater 不存在，只能经 default 取）
const mockAutoUpdater = {
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  on: vi.fn(),
  logger: null,
  autoDownload: false,
  allowPrerelease: false,
}

vi.mock('electron-updater', () => ({
  default: { autoUpdater: mockAutoUpdater },
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userData'),
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: true,
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFile: vi.fn((_p: string, _d: string, cb: (err: Error | null) => void) => cb(null)),
}))

vi.mock('../../core/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

describe('UpdateManager cjs interop 回归', () => {
  it('default-only 导出形态下应经 default 取到 autoUpdater（不抛 setting logger）', async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: { version: '1.0.0' },
      downloadPromise: Promise.resolve(),
    } as any)

    const { UpdateManager } = await import('../manager')
    const manager = new UpdateManager()

    // 若回退为命名解构，autoUpdater 为 undefined，
    // checkForUpdates 内 autoUpdater.logger = null 会抛 "Cannot set properties of undefined"
    const result = await manager.checkForUpdates()
    expect(result).toEqual({ isAvailable: false, version: '1.0.0' })
    expect(mockAutoUpdater.logger).toBeNull()
    expect(mockAutoUpdater.on).toHaveBeenCalled()
  })
})
