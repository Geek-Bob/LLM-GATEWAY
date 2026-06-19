import type { ProviderEntity, ApiKeyEntity, AgentEntity, AgentConfigEntity, UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig, CreateAgentInput, UpdateAgentInput, CreateAgentConfigInput, UpdateAgentConfigInput, SwitchConfigInput, ClearDataInput, ClearDataResult, PricingEntity, RangeSummary, ConversationEntity, ThinkingType, ReasoningEffort } from '../shared/types'
export type { UpdateInfo, UpdateProgress, UpdateCheckResult, UpdateConfig, CreateAgentInput, UpdateAgentInput, CreateAgentConfigInput, UpdateAgentConfigInput, SwitchConfigInput, ClearDataInput, ClearDataResult, PricingEntity, RangeSummary }

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
  cache_tokens?: number
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
  /** 缓存命中输入 Token 数（费用核算扩展字段，向后兼容可选） */
  cacheTokens?: number
  /** 总费用（元）（费用核算扩展字段，向后兼容可选） */
  totalCost?: number
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
    /** 24h / 30d 全局汇总统计（Token + 费用维度，对应 logs:rangeSummary 通道） */
    rangeSummary: (range: '24h' | '30d') => Promise<RangeSummary>
  }
  /**
   * 对话 CRUD + 消息管理
   * 思考参数 thinkingType/reasoningEffort 随对话持久化（可选，向后兼容）
   * create 返回 ConversationEntity（含思考字段），update 返回 void
   */
  conversations: {
    list: () => Promise<ConversationEntity[]>
    create: (data: {
      title: string
      model: string
      providerId?: number | null
      apiKeyId?: number | null
      /** 思考执行方式（disabled/enabled/adaptive），可选，向后兼容 */
      thinkingType?: ThinkingType
      /** 思考强度偏好（minimal…max），可选，向后兼容 */
      reasoningEffort?: ReasoningEffort
    }) => Promise<ConversationEntity>
    update: (
      id: number,
      data: {
        title?: string
        model?: string
        providerId?: number | null
        apiKeyId?: number | null
        /** 思考执行方式（disabled/enabled/adaptive），可选 */
        thinkingType?: ThinkingType
        /** 思考强度偏好（minimal…max），可选 */
        reasoningEffort?: ReasoningEffort
      }
    ) => Promise<void>
    delete: (id: number) => Promise<void>
    get: (id: number) => Promise<ConversationEntity | null>
    /** 消息列表（Message 类型未在 shared 定义，返回 unknown[] 由调用方断言） */
    messages: (conversationId: number) => Promise<unknown[]>
    /** 添加消息，返回新增消息 ID */
    addMessage: (data: { conversationId: number; role: 'user' | 'assistant'; content: string; thinking?: string }) => Promise<number>
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
   * 单价管理
   * 管理各模型在各供应商下的 Token 单价（元/百万tokens），用于费用核算和仪表盘统计
   */
  pricing: {
    list: () => Promise<PricingEntity[]>
    getByProvider: (providerId: number) => Promise<PricingEntity[]>
    upsert: (data: PricingEntity) => Promise<PricingEntity>
    delete: (data: { providerId: number; model: string }) => Promise<void>
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
