/**
 * Agent Domain Zod 验证 Schema
 * 用于 IPC handler 入口验证
 */

import { z } from 'zod'

/** 配置文件格式枚举 */
export const configFormatSchema = z.enum(['json', 'toml', 'env'])

/** 创建 Agent 验证 Schema */
export const createAgentSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
  displayName: z.string().min(1).max(100),
  configPath: z.string().min(1),
  configFormat: configFormatSchema,
})

/** 更新 Agent 验证 Schema */
export const updateAgentSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  configPath: z.string().min(1).optional(),
  configFormat: configFormatSchema.optional(),
})

/** 创建 Agent 配置验证 Schema */
export const createAgentConfigSchema = z.object({
  agentId: z.number().int().positive(),
  name: z.string().min(1).max(50),
  content: z.string(),
})

/** 更新 Agent 配置验证 Schema */
export const updateAgentConfigSchema = z.object({
  content: z.string(),
})

/** 切换配置验证 Schema */
export const switchConfigSchema = z.object({
  agentId: z.number().int().positive(),
  configId: z.number().int().positive(),
})
