import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** 自动更新的用户配置项 */
export interface UpdateConfig {
  /** 是否自动检查更新 */
  autoCheck: boolean
  /** 检查更新的时间间隔（毫秒），默认 4 小时 */
  checkInterval: number
  /** 是否允许预发布版本 */
  allowPrerelease: boolean
  /** 要跳过的版本号，用户可选择忽略某个版本 */
  skipVersion: string | null
}

/** 默认配置：每 4 小时自动检查，仅稳定版 */
const defaultConfig: UpdateConfig = {
  autoCheck: true,
  checkInterval: 4 * 60 * 60 * 1000, // 4 小时
  allowPrerelease: false,
  skipVersion: null
}

/**
 * 更新配置管理器
 * 将更新相关的用户偏好持久化到 userData 目录下的 update-config.json 文件中
 * 支持版本跳过、预发布通道开关等功能
 */
export class UpdateConfigManager {
  private config: UpdateConfig | null = null
  private configPath: string

  constructor() {
    const userData = app.getPath('userData')
    this.configPath = path.join(userData, 'update-config.json')
    // 不在此处调用 loadConfig()，延迟到首次访问以减小启动阻塞
  }

  /** 从磁盘加载配置，如果文件不存在或损坏则使用默认值 */
  private loadConfig(): UpdateConfig {
    if (this.config) return this.config

    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        this.config = { ...defaultConfig, ...JSON.parse(data) }
        return this.config
      }
    } catch (err) {
      console.warn('[UpdateConfig] loadConfig failed:', err)
    }
    this.config = { ...defaultConfig }
    return this.config
  }

  /** 将当前配置写入磁盘（JSON 格式化） */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (err) {
      console.warn('[UpdateConfig] saveConfig failed:', err)
    }
  }

  /** 获取当前配置的副本（避免外部直接修改内部状态） */
  getConfig(): UpdateConfig {
    return { ...this.loadConfig() }
  }

  /** 合并更新部分配置并持久化 */
  updateConfig(updates: Partial<UpdateConfig>): void {
    this.config = { ...this.loadConfig(), ...updates }
    this.saveConfig()
  }

  /** 设置要跳过的版本号 */
  setSkipVersion(version: string | null): void {
    this.config = { ...this.loadConfig(), skipVersion: version }
    this.saveConfig()
  }

  /** 判断指定版本是否在用户的跳过列表中 */
  shouldSkipVersion(version: string): boolean {
    return this.loadConfig().skipVersion === version
  }
}
