/**
 * 渲染进程类型定义
 *
 * 本文件包含渲染进程专用的业务类型和 Window 全局声明。
 * 与主进程共享的类型放在 src/shared/types.ts 中。
 */

import type { ProviderEntity, ApiKeyEntity, LogDebugInfo, UpdateCheckResult, UpdateConfig, UpdateInfo, UpdateProgress } from '../../shared/types'
import type { ModelMapping, ModelInfo } from '../../main/domains/models/models.types'

export type { LogDebugInfo }

/** UI 层 Provider 类型 */
export type Provider = ProviderEntity

/** UI 层 ApiKey 类型 */
export type ApiKey = ApiKeyEntity

/** 请求日志条目（记录了每次代理请求的详细信息） */
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

/** 仪表盘概览统计数据 */
export interface DashboardStats {
  total_requests: number
  total_tokens_in: number
  total_tokens_out: number
  avg_duration_ms: number
  total_errors: number
}

/** 本地对话记录（包含关联的供应商、模型和 API Key） */
export interface Conversation {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

/** 单条对话消息（包括用户消息和 AI 回复，thinking 字段记录扩展思维过程） */
export interface ConversationMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

/** 代理服务器运行状态 */
export interface ProxyStatus {
  running: boolean
  port: number
  url: string | null
}

/**
 * Window 全局类型声明
 * 声明 window.electronAPI 的完整接口，确保渲染进程中使用 api.* 时有正确的类型推导。
 * 实际实现在 preload/index.ts 中通过 contextBridge.exposeInMainWorld 注入。
 */
declare global {
  interface Window {
    electronAPI: {
      debug: {
        log: (...args: any[]) => void
      }
      backend: {
        isReady: () => Promise<boolean>
        onReady: (callback: () => void) => () => void
      }
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
        query: (params: Record<string, unknown>) => Promise<{ logs: LogEntry[]; total: number }>
        stats: (range: string) => Promise<DashboardStats>
        statsDetailed: (range: '24h' | '30d') => Promise<ProviderStatsGroup[]>
      }
      conversations: {
        list: () => Promise<Conversation[]>
        create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) => Promise<Conversation>
        update: (id: number, data: Record<string, unknown>) => Promise<void>
        delete: (id: number) => Promise<void>
        get: (id: number) => Promise<Conversation | null>
        messages: (conversationId: number) => Promise<ConversationMessage[]>
        addMessage: (conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => Promise<ConversationMessage>
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
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
      update: {
        check: () => Promise<UpdateCheckResult>
        download: () => Promise<void>
        install: () => Promise<void>
        skipVersion: (version: string) => Promise<void>
        getConfig: () => Promise<UpdateConfig>
        setConfig: (config: Partial<UpdateConfig>) => Promise<void>
        getCurrentVersion: () => Promise<string>
        onAvailable: (callback: (info: UpdateInfo) => void) => () => void
        onProgress: (callback: (progress: UpdateProgress) => void) => () => void
        onDownloaded: (callback: (info: UpdateInfo) => void) => () => void
        onError: (callback: (error: { message: string }) => void) => () => void
      }
      /** 模型列表与映射 CRUD */
      models: {
        list: () => Promise<ModelInfo[]>
        mapping: {
          find: (sourceModel: string) => Promise<ModelMapping | null>
          list: () => Promise<ModelMapping[]>
          create: (input: { sourceModel: string; targetModel: string }) => Promise<ModelMapping>
          update: (id: number, updates: { sourceModel?: string; targetModel?: string }) => Promise<ModelMapping>
          delete: (id: number) => Promise<void>
        }
      }
    }
  }
}

/** 统计时序数据点（period 在 24h 范围内为小时 0-23，在 30d 范围内为日期字符串） */
export interface StatsDataPoint {
  period: number | string  // hour (0-23) for 24h, date string for 30d
  requests: number
  tokensIn: number
  tokensOut: number
}

/** 单个模型维度的统计数据（含时序数据点） */
export interface ProviderStatsModel {
  model: string
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  totalErrors: number
  dataPoints: StatsDataPoint[]
}

/** 供应商维度的统计分组（包含该供应商下所有模型的统计数据） */
export interface ProviderStatsGroup {
  providerId: number
  providerName: string
  models: ProviderStatsModel[]
}

export {}
