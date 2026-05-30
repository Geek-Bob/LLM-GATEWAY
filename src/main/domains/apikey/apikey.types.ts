export interface ApiKeyResponse {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface CreateApiKeyInput {
  name: string
  rateLimit?: number
}
