import type { ProviderEntity, ApiKeyEntity, UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig } from '../shared/types'
export type { UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig }

/** Agent 响应类型（对应 db/agents.ts 中的 Agent 接口） */
export interface AgentResponse {
  id: number
  name: string
  displayName: string
  configPath: string
  configFormat: 'json' | 'toml' | 'env'
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

/** Agent 配置响应类型（对应 db/agent-configs.ts 中的 AgentConfig 接口） */
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
  configFormat: 'json' | 'toml' | 'env'
}

/** 更新 Agent 输入 */
export interface UpdateAgentInput {
  displayName?: string
  configPath?: string
  configFormat?: 'json' | 'toml' | 'env'
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

/** Provider 对外类型（preload 层与 db 层结构一致） */
export type Provider = ProviderEntity

/** API Key 对外类型 */
export type ApiKey = ApiKeyEntity

export interface LogEntry {
  id: number
  api_key_id: number | null
  provider_id: number | null
  model: string
  api_format: string
  status_code: number
  tokens_in: number
  tokens_out: number
  duration_ms: number
  error: string | null
  created_at: string
}

export interface DashboardStats {
  total_requests: number
  total_tokens_in: number
  total_tokens_out: number
  avg_duration_ms: number
  total_errors: number
}

export interface ElectronAPI {
  providers: {
    list: () => Promise<Provider[]>
    create: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) => Promise<number>
    update: (id: number, data: Record<string, unknown>) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  apiKeys: {
    list: () => Promise<ApiKey[]>
    create: (name: string, rateLimit?: number) => Promise<{ plaintextKey: string; key: ApiKey }>
    delete: (id: number) => Promise<void>
  }
  logs: {
    query: (params: { page: number; limit: number }) => Promise<{ logs: LogEntry[]; total: number }>
    stats: (range: string) => Promise<DashboardStats>
    statsDetailed: (range: '24h' | '30d') => Promise<{ providerId: number; providerName: string; models: { model: string; totalRequests: number; totalTokensIn: number; totalTokensOut: number; totalErrors: number; dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[] }[] }[]>
  }
  proxy: {
    status: () => Promise<{ port: number; running: boolean; url: string | null }>
    start: (port?: number) => Promise<boolean>
    stop: () => Promise<void>
    restart: (port?: number) => Promise<boolean>
    setPort: (port: number) => Promise<void>
    getDebugMode: () => Promise<boolean>
    setDebugMode: (enabled: boolean) => Promise<void>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  update: {
    check: () => Promise<UpdateCheckResult>
    download: () => Promise<void>
    install: () => Promise<void>
    skipVersion: (version: string) => Promise<void>
    getConfig: () => Promise<UpdateConfig>
    setConfig: (config: Partial<UpdateConfig>) => Promise<void>
    getCurrentVersion: () => Promise<string>
    onAvailable: (callback: (info: UpdateInfo) => void) => () => void
    onProgress: (callback: (progress: UpdateProgress) => void) => () => void
    onDownloaded: (callback: (info: UpdateInfo) => void) => () => void
    onError: (callback: (error: { message: string }) => void) => () => void
  }
  agents: {
    list: () => Promise<AgentResponse[]>
    get: (id: number) => Promise<AgentResponse | null>
    create: (data: CreateAgentInput) => Promise<AgentResponse>
    update: (id: number, data: UpdateAgentInput) => Promise<AgentResponse>
    delete: (id: number) => Promise<void>
    listConfigs: (agentId: number) => Promise<AgentConfigResponse[]>
    getConfig: (id: number) => Promise<AgentConfigResponse | null>
    createConfig: (data: CreateAgentConfigInput) => Promise<AgentConfigResponse>
    updateConfig: (id: number, data: UpdateAgentConfigInput) => Promise<AgentConfigResponse>
    deleteConfig: (id: number) => Promise<void>
    switchConfig: (data: SwitchConfigInput) => Promise<void>
  }
}
