import { z } from 'zod'

/**
 * 创建会话的输入校验 schema
 * title 和 model 必填，providerId/apiKeyId 可选可为 null
 */
export const createConversationSchema = z.object({
  title: z.string().min(1).max(200),
  model: z.string().min(1),
  providerId: z.number().int().positive().nullable().optional(),
  apiKeyId: z.number().int().positive().nullable().optional(),
  thinkingType: z.enum(['disabled', 'enabled', 'adaptive']).optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional()
})

/** 更新会话的输入校验 schema — 所有字段可选 */
export const updateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().min(1).optional(),
  providerId: z.number().int().positive().nullable().optional(),
  apiKeyId: z.number().int().positive().nullable().optional(),
  thinkingType: z.enum(['disabled', 'enabled', 'adaptive']).optional(),
  reasoningEffort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional()
})

/** 添加消息的输入校验 schema */
export const addMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  thinking: z.string().optional()
})
