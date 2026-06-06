/**
 * Agent Domain 类型定义
 * Agent 配置管理相关的类型
 */

/** 配置文件格式 */
export type ConfigFormat = 'json' | 'toml' | 'env'

/** Agent 响应类型 */
export interface AgentResponse {
  id: number
  name: string
  displayName: string
  configPath: string
  configFormat: ConfigFormat
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

/** Agent 配置响应类型 */
export interface AgentConfigResponse {
  id: number
  agentId: number
  name: string
  content: string
  isCurrent: number
  createdAt: string
  updatedAt: string
}

/** 创建 Agent 输入 */
export interface CreateAgentInput {
  name: string
  displayName: string
  configPath: string
  configFormat: ConfigFormat
}

/** 更新 Agent 输入 */
export interface UpdateAgentInput {
  displayName?: string
  configPath?: string
  configFormat?: ConfigFormat
}

/** 创建 Agent 配置输入 */
export interface CreateAgentConfigInput {
  agentId: number
  name: string
  content: string
}

/** 更新 Agent 配置输入 */
export interface UpdateAgentConfigInput {
  content: string
}

/** 切换配置输入 */
export interface SwitchConfigInput {
  agentId: number
  configId: number
}
