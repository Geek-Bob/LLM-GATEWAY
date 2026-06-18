import type { ProviderEntity, ApiKeyEntity, AgentEntity, AgentConfigEntity, UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig, CreateAgentInput, UpdateAgentInput, CreateAgentConfigInput, UpdateAgentConfigInput, SwitchConfigInput, ClearDataInput, ClearDataResult } from '../shared/types'
export type { UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig, CreateAgentInput, UpdateAgentInput, CreateAgentConfigInput, UpdateAgentConfigInput, SwitchConfigInput, ClearDataInput, ClearDataResult }

/** Agent 响应类型（与 shared/types.ts 的 AgentEntity 同义，向后兼容旧名） */
export type AgentResponse = AgentEntity
/** Agent 配置响应类型（与 shared/types.ts 的 AgentConfigEntity 同义，向后兼容旧名） */
export type AgentConfigResponse = AgentConfigEntity

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
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  avgDurationMs: number
  totalErrors: number
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
    status: () => Promise<{ port: number; running: boolean; url: string | null; debugMode: boolean }>
    start: (port?: number) => Promise<boolean>
    stop: () => Promise<{ success: true }>
    setPort: (port: number) => Promise<{ success: true }>
    getDebugMode: () => Promise<{ port: number; running: boolean; url: string | null; debugMode: boolean }>
    setDebugMode: (enabled: boolean) => Promise<{ success: true }>
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  update: {
    check: () => Promise<UpdateCheckResult>
    download: () => Promise<void>
    install: () => Promise<{ success: true }>
    skipVersion: (version: string) => Promise<{ success: true }>
    getConfig: () => Promise<UpdateConfig>
    setConfig: (config: Partial<UpdateConfig>) => Promise<{ success: true }>
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
    readConfigFile: (agentId: number) => Promise<string>
    switchConfig: (data: SwitchConfigInput) => Promise<void>
  }
  /**
   * 数据管理
   * clear: 按模块清空本地数据（business=业务数据，operational=运行数据），
   * 返回各类清空是否完成的报告
   */
  dataManagement: {
    clear: (input: ClearDataInput) => Promise<ClearDataResult>
  }
}
