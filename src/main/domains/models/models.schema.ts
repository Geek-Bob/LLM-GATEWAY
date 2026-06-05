/**
 * 模型映射 Zod 校验
 */
import { z } from 'zod'

/**
 * 创建映射输入校验 schema
 * sourceModel 和 targetModel 必填非空
 */
export const createModelMappingSchema = z.object({
  sourceModel: z.string().min(1, 'sourceModel 不能为空'),
  targetModel: z.string().min(1, 'targetModel 不能为空'),
})

/**
 * 更新映射输入校验 schema
 * 所有字段可选
 */
export const updateModelMappingSchema = z.object({
  sourceModel: z.string().min(1, 'sourceModel 不能为空').optional(),
  targetModel: z.string().min(1, 'targetModel 不能为空').optional(),
})
