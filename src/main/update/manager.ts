import { autoUpdater, UpdateInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { type UpdateConfig, UpdateConfigManager } from './config'

export interface UpdateCheckResult {
  available: boolean
  version?: string
  error?: string
}

export class UpdateManager {
  private configManager: UpdateConfigManager

  constructor() {
    this.configManager = new UpdateConfigManager()
    this.setupAutoUpdater()
  }

  private setupAutoUpdater(): void {
    autoUpdater.logger = null
    autoUpdater.autoDownload = false

    // 开发模式下允许检查更新
    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
    }

    const config = this.configManager.getConfig()
    autoUpdater.allowPrerelease = config.allowPrerelease

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.notifyRenderer('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('download-progress', (progress) => {
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
  }

  private notifyRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  getCurrentVersion(): string {
    return app.getVersion()
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      console.log('[UpdateManager] Checking for updates...')
      console.log('[UpdateManager] Current version:', this.getCurrentVersion())
      console.log('[UpdateManager] isPackaged:', app.isPackaged)
      console.log('[UpdateManager] forceDevUpdateConfig:', autoUpdater.forceDevUpdateConfig)

      const result = await autoUpdater.checkForUpdates()
      console.log('[UpdateManager] checkForUpdates result:', result)

      if (!result) {
        console.log('[UpdateManager] No result from checkForUpdates')
        return { available: false }
      }

      const currentVersion = this.getCurrentVersion()
      const newVersion = result.updateInfo.version
      console.log('[UpdateManager] Current:', currentVersion, 'New:', newVersion)

      if (this.configManager.shouldSkipVersion(newVersion)) {
        console.log('[UpdateManager] Version skipped:', newVersion)
        return { available: false, version: newVersion }
      }

      if (newVersion === currentVersion) {
        console.log('[UpdateManager] Same version, no update')
        return { available: false, version: newVersion }
      }

      console.log('[UpdateManager] Update available:', newVersion)
      return { available: true, version: newVersion }
    } catch (error) {
      console.error('[UpdateManager] Error checking for updates:', error)
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate()
  }

  installUpdate(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  setAllowPrerelease(allow: boolean): void {
    autoUpdater.allowPrerelease = allow
    this.configManager.updateConfig({ allowPrerelease: allow })
  }

  skipVersion(version: string): void {
    this.configManager.setSkipVersion(version)
  }

  getConfig(): UpdateConfig {
    return this.configManager.getConfig()
  }

  updateConfig(updates: Partial<UpdateConfig>) {
    this.configManager.updateConfig(updates)
  }
}
