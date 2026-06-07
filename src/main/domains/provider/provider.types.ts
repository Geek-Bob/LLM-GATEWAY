/** 对外返回的供应商信息，将下划线字段转为驼峰命名（camelCase） */
export interface ProviderResponse {
  id: number
  name: string
  providerType: string
  baseUrl: string
  apiKey: string
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
