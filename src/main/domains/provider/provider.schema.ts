import { z } from 'zod'

/**
 * 创建供应商的输入校验 schema
 * name 必填 1-100 字符，providerType 仅限 anthropic/openai，
 * baseUrl 必须是合法 URL，apiKey 必填，models 至少一个模型名
 */
export const createProviderSchema = z.object({
  name: z.string().min(1).max(100),
  providerType: z.enum(['anthropic', 'openai']),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string()).min(1)
})

/** 更新供应商的输入校验 schema — 所有字段可选 */
export const updateProviderSchema = createProviderSchema.partial()
