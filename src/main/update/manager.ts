import type { UpdateInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { createLogger } from '../core/logger'
import { getDebugLogPath } from '../core/debug-log'
import { isNewerVersion } from '../core/version'
import { UpdateConfigManager } from './config'
import type { UpdateConfig, UpdateCheckResult } from '../../shared/types'

/**
 * 自动更新管理器
 * 封装 electron-updater 的生命周期，负责检查更新、下载、安装
 * 通过 IPC 向渲染进程推送更新进度事件，并在多窗口场景下广播到所有窗口
 */
export class UpdateManager {
  private configManager: UpdateConfigManager
  private _autoUpdater: any = null          // 懒加载的 autoUpdater 实例
  private logger: ReturnType<typeof createLogger>

  constructor() {
    this.configManager = new UpdateConfigManager()
    // logger 必须在 constructor 内创建（app.getPath() 需 app ready 后才能调用）
    // 写入文件以便 packaged 用户能查看更新日志（stdout 在 packaged 下被丢弃）
    // 路径走统一调试日志策略：dev=项目根、正式包=安装目录 logs/（见 core/debug-log.ts）
    this.logger = createLogger('update-manager', {
      file: getDebugLogPath('update.log'),
      truncate: false,  // 保留历史诊断信息
    })
    // autoUpdater 的初始化延迟到首次调用 ensureAutoUpdater() 时执行
  }

  /**
   * 首次调用时动态导入 electron-updater 并注册事件监听。
   * 后续调用直接返回缓存的 autoUpdater 实例。
   *
   * electron-updater 通过 Object.defineProperty(exports, "autoUpdater", { get }) 导出，
   * Node 运行时 await import() 的 cjs-module-lexer 无法静态识别该 getter 形式的命名导出，
   * 故不能写 const { autoUpdater } = await import(...)（会解构为 undefined，
   * 导致 autoUpdater.logger = null 抛 "Cannot set properties of undefined"）。
   * 正确做法：经 import() 返回的 default（即 module.exports）走 getter 取实例。
   */
  private async ensureAutoUpdater(): Promise<any> {
    if (this._autoUpdater) return this._autoUpdater

    const mod = await import('electron-updater') as any
    // default 优先（Node 运行时 cjs interop）；?? 兼容仅命名导出的形态（如 vitest mock）
    // 注意：vitest 的 ESM mock 在未声明 default 时访问 mod.default 会抛错，
    // 故先用 'default' in mod 探测，避免触发守卫异常
    const ns = mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod
    const autoUpdater = ns?.autoUpdater ?? mod?.autoUpdater
    if (!autoUpdater) {
      throw new Error('Failed to load electron-updater: autoUpdater is undefined')
    }
    this._autoUpdater = autoUpdater

    // 初始化配置
    autoUpdater.logger = null
    autoUpdater.autoDownload = false

    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
    }

    const config = this.configManager.getConfig()
    autoUpdater.allowPrerelease = config.isPrereleaseAllowed

    // 注册事件监听
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.notifyRenderer('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('download-progress', (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => {
      this.notifyRenderer('update:download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.notifyRenderer('update:downloaded', {
        version: info.version
      })
    })

    autoUpdater.on('error', (error: Error) => {
      this.notifyRenderer('update:error', {
        message: error.message
      })
    })

    return autoUpdater
  }

  /** 向所有未销毁的窗口广播事件 */
  private notifyRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  /** 获取当前应用的版本号 */
  getCurrentVersion(): string {
    return app.getVersion()
  }

  /**
   * 执行更新检查
   * 在确认有可用更新后会进一步验证：跳过列表检查、版本号比对
   * 返回结构化的检查结果，而非直接触发更新流程
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      const a = await this.ensureAutoUpdater()
      this.logger.info('Checking for updates', {
        currentVersion: this.getCurrentVersion(),
        isPackaged: app.isPackaged,
        forceDevUpdateConfig: a.forceDevUpdateConfig,
      })

      const result = await a.checkForUpdates()
      this.logger.debug('checkForUpdates result', { result })

      if (!result) {
        this.logger.info('No result from checkForUpdates')
        return { isAvailable: false }
      }

      const currentVersion = this.getCurrentVersion()
      const newVersion = result.updateInfo.version
      this.logger.info('Version comparison', { currentVersion, newVersion })

      // 跳过用户明确忽略的版本
      if (this.configManager.shouldSkipVersion(newVersion)) {
        this.logger.info('Version skipped', { version: newVersion })
        return { isAvailable: false, version: newVersion }
      }

      // 语义版本比较：远程不比本地更新（相同或更旧）则不提示更新，
      // 防止远程回退发布时误报"有更新"导致用户降级
      if (!isNewerVersion(newVersion, currentVersion)) {
        this.logger.info('No newer version available', { currentVersion, newVersion })
        return { isAvailable: false, version: newVersion }
      }

      this.logger.info('Update available', { version: newVersion })
      return { isAvailable: true, version: newVersion }
    } catch (error) {
      this.logger.error('Error checking for updates', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return {
        isAvailable: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /** 开始下载更新（需在 checkForUpdates 确认可用后调用） */
  async downloadUpdate(): Promise<void> {
    const a = await this.ensureAutoUpdater()
    await a.downloadUpdate()
  }

  /** 安装更新并重启应用 */
  async installUpdate(): Promise<void> {
    const a = await this.ensureAutoUpdater()
    a.quitAndInstall(false, true)
  }

  /** 设置是否允许预发布版本，并持久化配置 */
  async setAllowPrerelease(allow: boolean): Promise<void> {
    const a = await this.ensureAutoUpdater()
    a.allowPrerelease = allow
    this.configManager.updateConfig({ isPrereleaseAllowed: allow })
  }

  /** 将指定版本加入跳过列表 */
  skipVersion(version: string): void {
    this.configManager.setSkipVersion(version)
  }

  /** 获取当前更新配置 */
  getConfig(): UpdateConfig {
    return this.configManager.getConfig()
  }

  /** 合并更新部分配置 */
  updateConfig(updates: Partial<UpdateConfig>) {
    this.configManager.updateConfig(updates)
  }
}
