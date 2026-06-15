import { z } from 'zod'

/**
 * 更新配置（部分）输入校验 schema
 *
 * 与 src/shared/types.ts 中 UpdateConfig 接口字段一一对应，
 * 所有字段均为 optional（partial 模式）：
 * - isAutoCheckEnabled: 是否启用自动检查更新
 * - checkInterval: 检查间隔（毫秒），正整数
 * - isPrereleaseAllowed: 是否允许预发布版本
 * - skipVersion: 用户跳过的版本号，允许 null 表示清空
 *
 * `.strict()` 拒绝未知字段，避免渲染进程透传脏数据落盘。
 *
 * @example
 * updateConfigPartialSchema.parse({ isAutoCheckEnabled: true })
 * updateConfigPartialSchema.parse({ checkInterval: 3600000, skipVersion: null })
 */
export const updateConfigPartialSchema = z
  .object({
    isAutoCheckEnabled: z.boolean().optional(),
    checkInterval: z.number().int().positive().optional(),
    isPrereleaseAllowed: z.boolean().optional(),
    skipVersion: z.string().nullable().optional(),
  })
  .strict()

export type UpdateConfigPartialInput = z.infer<typeof updateConfigPartialSchema>
