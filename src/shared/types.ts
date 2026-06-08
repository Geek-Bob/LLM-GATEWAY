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
  error?: string
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

/** 更新检查结果：isAvailable=是否有新版本, version=版本号(如有), error=错误信息(如有) */
export interface UpdateCheckResult {
  isAvailable: boolean
  version?: string
  error?: string
}

/** 更新配置：isAutoCheckEnabled=自动检查, checkInterval=检查间隔(ms), isPrereleaseAllowed=允许预发布, skipVersion=跳过的版本 */
export interface UpdateConfig {
  isAutoCheckEnabled: boolean
  checkInterval: number
  isPrereleaseAllowed: boolean
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

/**
 * 供应商类型别名，各层通过此别名引用共享基础定义。
 * 由 ProviderEntity 派生，禁止在 db/ 或 domains/ 中重新定义同名 interface。
 */
export type Provider = ProviderEntity

/** Gateway API Key 实体 */
export interface ApiKeyEntity {
  id: number
  name: string
  keyPrefix: string
  keyPlaintext: string
  isActive: number
  rateLimit: number
  createdAt: string
}

/** 对话实体 */
export interface ConversationEntity {
  id: number
  title: string
  providerId: number | null
  model: string
  apiKeyId: number | null
  createdAt: string
  updatedAt: string
}


// ====== Agent 配置管理实体类型（主进程/渲染进程共享） ======

/** 配置文件格式 */
export type ConfigFormat = 'json' | 'toml' | 'env'

/** Agent 实体 */
export interface AgentEntity {
  id: number
  name: string
  displayName: string
  configPath: string
  configFormat: ConfigFormat
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

/** Agent 配置实体 */
export interface AgentConfigEntity {
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

// ====== 模型映射类型（主进程/渲染进程共享） ======

/** 模型映射实体 */
export interface ModelMapping {
  id: number
  sourceModel: string       // 客户端请求的模型名
  targetModel: string       // 完整模型 ID，如 "deepseek/deepseek-v4-pro"
  isActive: number
  createdAt: string
}

/** 创建映射输入 */
export interface CreateModelMappingInput {
  sourceModel: string
  targetModel: string
}

/** 更新映射输入 */
export interface UpdateModelMappingInput {
  sourceModel?: string
  targetModel?: string
}

/** 模型信息（用于 /v1/models 端点和配置 UI） */
export interface ModelInfo {
  id: string                // 完整模型 ID，如 "anthropic/claude-sonnet-4"
  provider: string          // provider name
  providerType: string      // 'anthropic' | 'openai'
}

// ====== SSE 事件类型（主进程/渲染进程共享） ======

/** 解析后的 SSE 行结构 */
export interface ParsedSSELine {
  /** SSE 事件类型（event: 字段），如 'message_start'、'content_block_delta' 等 */
  event: string | null
  /** SSE 数据体（data: 字段的 JSON 字符串值） */
  data: string | null
}
