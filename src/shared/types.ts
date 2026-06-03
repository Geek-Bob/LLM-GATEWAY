/**
 * 代理请求调试信息结构体
 * 当调试模式开启时，记录请求从客户端到上游再到响应的完整链路信息，
 * 用于排查协议转换、路由解析等问题。非调试模式下为 null。
 */
export interface LogDebugInfo {
  client: {
    body: string
    apiFormat: string
  }
  route: {
    providerName: string
    providerType: string
    baseUrl: string
    modelName: string
  }
  conversion?: {
    from: string
    to: string
    originalPath: string
    convertedPath: string
    originalModel: string
    convertedModel: string
  }
  upstream: {
    url: string
    body: string
    statusCode: number
    responseBody: string
  }
}

/** 应用更新信息：版本号和发布说明 */
export interface UpdateInfo {
  version: string
  releaseNotes?: string | null
}

/** 更新下载进度（bytesPerSecond=字节/秒, transferred/total=已传/总大小） */
export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

/** 更新检查结果：available=是否有新版本, version=版本号(如有), error=错误信息(如有) */
export interface UpdateCheckResult {
  available: boolean
  version?: string
  error?: string
}

/** 更新配置：autoCheck=自动检查, checkInterval=检查间隔(ms), allowPrerelease=允许预发布, skipVersion=跳过的版本 */
export interface UpdateConfig {
  autoCheck: boolean
  checkInterval: number
  allowPrerelease: boolean
  skipVersion: string | null
}

// ====== 核心实体类型（各层共享基础定义） ======

/** LLM 供应商实体（内部完整字段，含 apiKey） */
export interface ProviderEntity {
  id: number
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

/** Gateway API Key 实体 */
export interface ApiKeyEntity {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string
  is_active: number
  rate_limit: number
  created_at: string
}

/** 对话实体 */
export interface ConversationEntity {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

/** 对话消息实体 */
export interface ConversationMessageEntity {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}
