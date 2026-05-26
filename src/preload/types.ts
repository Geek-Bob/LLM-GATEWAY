export interface Provider {
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

export interface ApiKey {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string
  is_active: number
  rate_limit: number
  created_at: string
}

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
}
