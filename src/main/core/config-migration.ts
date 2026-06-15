/**
 * JSON 配置迁移框架
 *
 * 提供与业务无关的轻量 JSON 配置字段迁移机制，避免字段重命名时旧字段被
 * `{...defaultConfig, ...raw}` 直接合并丢弃。框架仅负责"应用迁移器并合并结果"
 * 的纯函数职责，业务专用 migrator 由调用方在自己的模块中定义。
 */

/**
 * JSON 配置迁移器：将旧字段映射为新字段，幂等。
 * 约定返回值仅包含被迁移的字段；未触发迁移返回 {}。
 *
 * @param raw - JSON.parse 后的原始对象（已知为 unknown，由 migrator 自行守卫）
 * @returns 仅包含被迁移字段的部分对象，未触发迁移返回 {}
 */
export type ConfigMigrator<T> = (raw: unknown) => Partial<T>

/**
 * 顺序应用一组迁移器，结果合并；后者覆盖前者。
 * 单个 migrator 抛异常不在此处捕获，由调用方决定如何处理。
 *
 * @param raw - 原始配置对象（JSON.parse 后的 unknown）
 * @param migrators - 迁移器数组
 * @returns 合并后的迁移结果（Partial<T>）
 * @example
 * const result = applyMigrators<UpdateConfig>(raw, [migrateAutoCheck, migrateAllowPrerelease])
 */
export function applyMigrators<T>(
  raw: unknown,
  migrators: ConfigMigrator<T>[]
): Partial<T> {
  // 防御性处理：仅对象类型的 raw 才有迁移意义
  if (typeof raw !== 'object' || raw === null) return {}
  const partials = migrators.map((m) => m(raw))
  // 后者覆盖前者
  return Object.assign({}, ...partials) as Partial<T>
}
