export interface ProviderRow {
  id: number
  name: string
  provider_type: 'anthropic' | 'openai'
  base_url: string
  api_key: string
  models: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface ProviderResponse {
  id: number
  name: string
  providerType: string
  baseUrl: string
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

export interface CreateProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface UpdateProviderInput {
  name?: string
  providerType?: 'anthropic' | 'openai'
  baseUrl?: string
  apiKey?: string
  models?: string[]
  isActive?: number
}
