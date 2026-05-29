import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface UpdateConfig {
  autoCheck: boolean
  checkInterval: number
  allowPrerelease: boolean
  skipVersion: string | null
}

const defaultConfig: UpdateConfig = {
  autoCheck: true,
  checkInterval: 4 * 60 * 60 * 1000,
  allowPrerelease: false,
  skipVersion: null
}

export class UpdateConfigManager {
  private config: UpdateConfig
  private configPath: string

  constructor() {
    const userData = app.getPath('userData')
    this.configPath = path.join(userData, 'update-config.json')
    this.config = this.loadConfig()
  }

  private loadConfig(): UpdateConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        return { ...defaultConfig, ...JSON.parse(data) }
      }
    } catch {
      // 忽略加载错误，使用默认配置
    }
    return { ...defaultConfig }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch {
      // 忽略保存错误
    }
  }

  getConfig(): UpdateConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()
  }

  setSkipVersion(version: string | null): void {
    this.config.skipVersion = version
    this.saveConfig()
  }

  shouldSkipVersion(version: string): boolean {
    return this.config.skipVersion === version
  }
}
