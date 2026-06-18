import { z } from 'zod'

/**
 * 创建/更新单价的输入校验 schema
 *
 * - providerId 必须为整数（联合主键之一）
 * - model 必填非空字符串（联合主键之一）
 * - 三单价（缓存命中/未命中/输出）必须为非负数，单位"美分/1M tokens"
 *   （0 表示免费模型，允许）
 *
 * Zod 4.x：z.record() 已要求双参数（此处未使用，仅备注约定）。
 */
export const createPricingSchema = z.object({
  providerId: z.number().int(),
  model: z.string().min(1),
  priceInCached: z.number().nonnegative(),
  priceInUncached: z.number().nonnegative(),
  priceOut: z.number().nonnegative()
})

/** 经 createPricingSchema 校验后的输入类型 */
export type CreatePricingInput = z.infer<typeof createPricingSchema>
