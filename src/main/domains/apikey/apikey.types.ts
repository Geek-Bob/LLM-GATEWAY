/** API Key 的对外响应结构，包含完整信息用于展示 */
export interface ApiKeyResponse {
  id: number
  name: string
  /** 密钥前缀，用于界面识别（如 "sk-abc..."） */
  keyPrefix: string
  /** 创建时返回的明文密钥，仅展示一次 */
  keyPlaintext: string
  isActive: number
  /** 每分钟请求数限制 */
  rateLimit: number
  createdAt: string
}

/** 创建 API Key 的输入参数 */
export interface CreateApiKeyInput {
  name: string
  /** 可选，默认 60 次/分钟 */
  rateLimit?: number
}
