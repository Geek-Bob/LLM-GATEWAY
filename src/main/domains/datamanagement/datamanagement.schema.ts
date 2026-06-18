import { z } from 'zod'

/**
 * 清空数据请求的输入校验 schema。
 *
 * - `business`：是否清空业务数据（providers/agents/conversations 等）
 * - `operational`：是否清空运行数据（logs/stats 等）
 *
 * 业务规则：至少勾选一类数据（两者不可同时为 false）。
 * 通过 `superRefine` 在 `business` 字段路径上抛错，便于 IPC 入口定位具体字段。
 */
export const clearDataSchema = z
  .object({
    business: z.boolean(),
    operational: z.boolean()
  })
  .superRefine((data, ctx) => {
    if (data.business === false && data.operational === false) {
      ctx.addIssue({
        code: 'custom',
        path: ['business'],
        message: '至少一个清空选项必须为 true（business 或 operational）'
      })
    }
  })

/** 经 schema 解析后的输入类型，供 service / IPC handler 复用 */
export type ClearDataInputParsed = z.infer<typeof clearDataSchema>
