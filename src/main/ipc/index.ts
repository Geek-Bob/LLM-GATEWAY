import { ipcMain, BrowserWindow } from 'electron'
import { createLogger } from '../core/logger'
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider
} from '../db/providers'
import {
  listApiKeys,
  createApiKey,
  deleteApiKey
} from '../db/api-keys'
import { queryLogs, getLogStats, getDetailedStats } from '../db/logs'
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getConversation,
  listMessages,
  addMessage
} from '../db/conversations'
import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'
import { UpdateManager } from '../update/manager'
import { setupUpdateIpcHandlers } from '../update/ipc'

const logger = createLogger('ipc')

export function setupIpcHandlers(updateManager: UpdateManager): void {
  // --- Provider handlers ---
  ipcMain.handle('provider:list', async () => {
    return listProviders()
  })

  ipcMain.handle('provider:create', async (_event, data) => {
    return createProvider({
      name: data.name,
      providerType: data.providerType,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      models: data.models
    })
  })

  ipcMain.handle('provider:update', async (_event, id: number, data) => {
    return updateProvider(id, data)
  })

  ipcMain.handle('provider:delete', async (_event, id: number) => {
    return deleteProvider(id)
  })

  // --- API Key handlers ---
  ipcMain.handle('apikey:list', async () => {
    return listApiKeys()
  })

  ipcMain.handle(
    'apikey:create',
    async (_event, name: string, rateLimit?: number) => {
      return createApiKey(name, rateLimit)
    }
  )

  ipcMain.handle('apikey:delete', async (_event, id: number) => {
    return deleteApiKey(id)
  })

  // --- Log handlers ---
  ipcMain.handle('logs:query', async (_event, params) => {
    return queryLogs(params)
  })

  ipcMain.handle('logs:stats', async (_event, range: string) => {
    return getLogStats({ range })
  })

  ipcMain.handle('logs:statsDetailed', async (_event, range: '24h' | '30d') => {
    const rows = getDetailedStats(range)
    const providers = listProviders()

    const providerMap = new Map<number, {
      providerId: number
      providerName: string
      models: Map<string, {
        model: string
        totalRequests: number
        totalTokensIn: number
        totalTokensOut: number
        totalErrors: number
        dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[]
      }>
    }>()

    for (const row of rows) {
      const pid = row.provider_id as number
      const model = row.model as string
      if (!providerMap.has(pid)) {
        const p = providers.find((pr) => pr.id === pid)
        providerMap.set(pid, {
          providerId: pid,
          providerName: p?.name ?? `Provider #${pid}`,
          models: new Map()
        })
      }
      const pm = providerMap.get(pid)!
      if (!pm.models.has(model)) {
        pm.models.set(model, {
          model,
          totalRequests: 0,
          totalTokensIn: 0,
          totalTokensOut: 0,
          totalErrors: 0,
          dataPoints: []
        })
      }
      const mm = pm.models.get(model)!
      mm.totalRequests += row.total_requests as number
      mm.totalTokensIn += row.total_tokens_in as number
      mm.totalTokensOut += row.total_tokens_out as number
      mm.totalErrors += row.total_errors as number
      mm.dataPoints.push({
        period: row.period as number | string,
        requests: row.total_requests as number,
        tokensIn: row.total_tokens_in as number,
        tokensOut: row.total_tokens_out as number
      })
    }

    return Array.from(providerMap.values()).map((p) => ({
      providerId: p.providerId,
      providerName: p.providerName,
      models: Array.from(p.models.values()).map((m) => ({
        model: m.model,
        totalRequests: m.totalRequests,
        totalTokensIn: m.totalTokensIn,
        totalTokensOut: m.totalTokensOut,
        totalErrors: m.totalErrors,
        dataPoints: m.dataPoints
      }))
    }))
  })

  // --- Window control handlers ---
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // --- Proxy control handlers ---
  ipcMain.handle('proxy:status', async () => {
    return getProxyConfig()
  })

  ipcMain.handle('proxy:start', async (_event, port?: number) => {
    return startProxy(port)
  })

  ipcMain.handle('proxy:stop', async () => {
    stopProxy()
  })

  ipcMain.handle('proxy:restart', async (_event, port?: number) => {
    return restartProxy(port)
  })

  ipcMain.handle('proxy:setPort', async (_event, port: number) => {
    setProxyPort(port)
  })

  ipcMain.handle('proxy:getDebugMode', async () => {
    return getDebugMode()
  })

  ipcMain.handle('proxy:setDebugMode', async (_event, enabled: boolean) => {
    setDebugMode(enabled)
  })

  // --- Renderer debug log handler ---
  ipcMain.on('renderer:log', (_event, args: unknown[]) => {
    logger.debug('renderer', { args })
  })

  // --- Conversation handlers ---
  ipcMain.handle('conversation:list', async () => {
    return listConversations()
  })

  ipcMain.handle('conversation:create', async (_event, data: {
    title: string
    model: string
    providerId?: number | null
    apiKeyId?: number | null
  }) => {
    return createConversation(data.title, data.model, data.providerId, data.apiKeyId)
  })

  ipcMain.handle('conversation:update', async (_event, id: number, data: {
    title?: string
    providerId?: number | null
    model?: string
    apiKeyId?: number | null
  }) => {
    return updateConversation(id, {
      title: data.title,
      provider_id: data.providerId,
      model: data.model,
      api_key_id: data.apiKeyId
    })
  })

  ipcMain.handle('conversation:delete', async (_event, id: number) => {
    return deleteConversation(id)
  })

  ipcMain.handle('conversation:get', async (_event, id: number) => {
    return getConversation(id) || null
  })

  // --- Message handlers ---
  ipcMain.handle('conversation:messages', async (_event, conversationId: number) => {
    return listMessages(conversationId)
  })

  ipcMain.handle('conversation:addMessage', async (_event, conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => {
    return addMessage(conversationId, role, content, thinking)
  })

  // --- Update handlers ---
  setupUpdateIpcHandlers(updateManager)
}
