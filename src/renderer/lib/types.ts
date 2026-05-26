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

import type { LogDebugInfo } from '../../shared/types'

export type { LogDebugInfo }

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
  debug?: LogDebugInfo
}

export interface DashboardStats {
  total_requests: number
  total_tokens_in: number
  total_tokens_out: number
  avg_duration_ms: number
  total_errors: number
}

export interface Conversation {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

export interface ProxyStatus {
  running: boolean
  port: number
  url: string | null
}

declare global {
  interface Window {
    electronAPI: {
      providers: {
        list: () => Promise<Provider[]>
        create: (data: any) => Promise<number>
        update: (id: number, data: any) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      apiKeys: {
        list: () => Promise<ApiKey[]>
        create: (name: string, rateLimit?: number) => Promise<{ plaintextKey: string; key: ApiKey }>
        delete: (id: number) => Promise<void>
      }
      logs: {
        query: (params: any) => Promise<{ logs: LogEntry[]; total: number }>
        stats: (range: string) => Promise<DashboardStats>
        statsDetailed: (range: '24h' | '30d') => Promise<ProviderStatsGroup[]>
      }
      proxy: {
        status: () => Promise<ProxyStatus>
        start: (port?: number) => Promise<boolean>
        stop: () => Promise<void>
        restart: (port?: number) => Promise<boolean>
        setPort: (port: number) => Promise<void>
        getDebugMode: () => Promise<boolean>
        setDebugMode: (enabled: boolean) => Promise<void>
      }
      debug: {
        log: (...args: any[]) => void
      }
      chat: {
        send: (data: { requestId: string; apiKeyId: number; model: string; messages: { role: string; content: string }[]; apiFormat: 'anthropic' | 'openai' }) => void
        abort: (requestId: string) => void
        onChunk: (callback: (data: { requestId: string; text: string; chunkType?: 'thinking' | 'text'; done: boolean; error?: string }) => void) => () => void
      }
      conversations: {
        list: () => Promise<Conversation[]>
        create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) => Promise<number>
        update: (id: number, data: { title?: string; providerId?: number | null; model?: string; apiKeyId?: number | null }) => Promise<void>
        delete: (id: number) => Promise<void>
        get: (id: number) => Promise<Conversation | null>
        messages: (conversationId: number) => Promise<ConversationMessage[]>
        addMessage: (conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => Promise<number>
      }
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
    }
  }
}

export interface StatsDataPoint {
  period: number | string  // hour (0-23) for 24h, date string for 30d
  requests: number
  tokensIn: number
  tokensOut: number
}

export interface ProviderStatsModel {
  model: string
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  totalErrors: number
  dataPoints: StatsDataPoint[]
}

export interface ProviderStatsGroup {
  providerId: number
  providerName: string
  models: ProviderStatsModel[]
}

export {}
