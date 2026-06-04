/**
 * 模型映射 Zod 校验
 */
import { z } from 'zod'

/**
 * 创建映射输入校验 schema
 * providerType 仅限 anthropic/openai，sourceModel 和 targetModel 必填非空
 */
export const createModelMappingSchema = z.object({
  providerType: z.enum(['anthropic', 'openai']),
  sourceModel: z.string().min(1, 'sourceModel 不能为空'),
  targetModel: z.string().min(1, 'targetModel 不能为空'),
})

/**
 * 更新映射输入校验 schema
 * 所有字段可选
 */
export const updateModelMappingSchema = z.object({
  providerType: z.enum(['anthropic', 'openai']).optional(),
  sourceModel: z.string().min(1, 'sourceModel 不能为空').optional(),
  targetModel: z.string().min(1, 'targetModel 不能为空').optional(),
})
