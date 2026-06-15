import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { createLogger } from '../core/logger'
import { applyMigrators, type ConfigMigrator } from '../core/config-migration'
import type { UpdateConfig } from '../../shared/types'

const logger = createLogger('update-config')

/** 默认配置：每 4 小时自动检查，仅稳定版 */
const defaultConfig: UpdateConfig = {
  isAutoCheckEnabled: true,
  checkInterval: 4 * 60 * 60 * 1000, // 4 小时
  isPrereleaseAllowed: false,
  skipVersion: null
}

/**
 * 旧字段 autoCheck → 新字段 isAutoCheckEnabled
 * 仅当旧字段存在、新字段不存在、且类型匹配时迁移；否则返回 {}（幂等）
 */
const migrateAutoCheckField: ConfigMigrator<UpdateConfig> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  if ('autoCheck' in r && !('isAutoCheckEnabled' in r) && typeof r.autoCheck === 'boolean') {
    return { isAutoCheckEnabled: r.autoCheck }
  }
  return {}
}

/**
 * 旧字段 allowPrerelease → 新字段 isPrereleaseAllowed
 * 仅当旧字段存在、新字段不存在、且类型匹配时迁移；否则返回 {}（幂等）
 */
const migrateAllowPrereleaseField: ConfigMigrator<UpdateConfig> = (raw) => {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  if (
    'allowPrerelease' in r &&
    !('isPrereleaseAllowed' in r) &&
    typeof r.allowPrerelease === 'boolean'
  ) {
    return { isPrereleaseAllowed: r.allowPrerelease }
  }
  return {}
}

/** 注册的字段迁移器（顺序应用，后者覆盖前者） */
const MIGRATORS: ConfigMigrator<UpdateConfig>[] = [
  migrateAutoCheckField,
  migrateAllowPrereleaseField,
]

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

  /** 从磁盘加载配置，如果文件不存在或损坏则使用默认值；自动迁移历史字段名 */
  private loadConfig(): UpdateConfig {
    if (this.config) return this.config

    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        const raw = JSON.parse(data)
        let migrated: Partial<UpdateConfig> = {}
        try {
          migrated = applyMigrators<UpdateConfig>(raw, MIGRATORS)
        } catch (err) {
          logger.warn('Failed to migrate update config', {
            error: err instanceof Error ? err.message : String(err)
          })
        }
        this.config = { ...defaultConfig, ...raw, ...migrated }
        // 有迁移发生 → 立即回写新 schema（幂等：再次读入时无字段可迁移）
        if (Object.keys(migrated).length > 0) {
          this.saveConfig()
          logger.info('Migrated update config schema', { fields: Object.keys(migrated) })
        }
        // 局部 const 触发 TS narrowing：line 85 已保证 this.config 非 null
        return this.config ?? defaultConfig
      }
    } catch (err) {
      logger.warn('Failed to load update config', {
        error: err instanceof Error ? err.message : String(err)
      })
    }
    this.config = { ...defaultConfig }
    return this.config
  }

  /** 将当前配置写入磁盘（JSON 格式化） */
  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (err) {
      logger.warn('Failed to save update config', {
        error: err instanceof Error ? err.message : String(err)
      })
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
