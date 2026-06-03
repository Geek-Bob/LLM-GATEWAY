/** 数据库 providers 表的原始行记录，列名使用下划线命名（snake_case） */
export interface ProviderRow {
  id: number
  name: string
  provider_type: 'anthropic' | 'openai'
  base_url: string
  api_key: string
  /** JSON 序列化的模型名数组，如 '["gpt-4","gpt-3.5-turbo"]' */
  models: string
  is_active: number
  created_at: string
  updated_at: string
}

/** 对外返回的供应商信息，将下划线字段转为驼峰命名（camelCase） */
export interface ProviderResponse {
  id: number
  name: string
  providerType: string
  baseUrl: string
  /** 已解析为数组的模型列表 */
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

/** 创建供应商所需的参数 */
export interface CreateProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

/** 更新供应商的可选参数，所有字段均可选 */
export interface UpdateProviderInput {
  name?: string
  providerType?: 'anthropic' | 'openai'
  baseUrl?: string
  apiKey?: string
  models?: string[]
  isActive?: number
}
