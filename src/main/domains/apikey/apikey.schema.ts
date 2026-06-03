import { z } from 'zod'

/**
 * 创建 API Key 的输入校验 schema
 * name 必填 1-100 字符，rateLimit 可选，最小 1，最大 10000
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  rateLimit: z.number().int().min(1).max(10000).optional()
})
