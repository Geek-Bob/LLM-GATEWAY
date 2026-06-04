/**
 * IPC 处理器注册模块
 *
 * 注册主进程所有 IPC handler，连接渲染进程请求与后端数据层。
 * 遵循 domain 模式：IPC handler 委托到 domain service，不直接调用 db/ 层。
 *
 * 分类：
 * - Provider / API Key CRUD
 * - Conversation / Message CRUD
 * - 日志查询与统计
 * - 代理控制
 * - 窗口控制
 * - 自动更新
 */

import { ipcMain, BrowserWindow } from 'electron'
import { getDb } from '../db/connection'
import { createLogger } from '../core/logger'
import { createProviderService } from '../domains/provider/provider.service'
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createLogsService } from '../domains/logs/logs.service'
import { createStatsService } from '../domains/stats/stats.service'
import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'
import { createProviderSchema, updateProviderSchema } from '../domains/provider/provider.schema'
import { createApiKeySchema } from '../domains/apikey/apikey.schema'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../domains/conversation/conversation.schema'
import { UpdateManager } from '../update/manager'
import { setupUpdateIpcHandlers } from '../update/ipc'
import { createModelsService } from '../domains/models/models.service'
import { createModelMappingSchema, updateModelMappingSchema } from '../domains/models/models.schema'

const logger = createLogger('ipc')

/**
 * 注册所有 IPC handler，连接渲染进程请求与 domain service 层
 *
 * 遵循 domain 模式：每个 handler 委托到对应 domain service，
 * 不直接调用 db/ 数据访问层。domain service 通过 getDb() 注入数据库实例。
 *
 * @param updateManager - 自动更新管理器实例，用于注册更新相关 IPC handler
 */
export function setupIpcHandlers(updateManager: UpdateManager): void {
  // 通过 getDb() 注入数据库实例，创建所有 domain service
  const db = getDb()
  const providerService = createProviderService(db)
  const apiKeyService = createApiKeyService()
  const conversationService = createConversationService(db)
  const logsService = createLogsService()
  const statsService = createStatsService()

  // ====== 供应商 CRUD ======
  ipcMain.handle('provider:list', async () => {
    return providerService.list()
  })

  ipcMain.handle('provider:create', async (_event, data: {
    name: string
    providerType: 'anthropic' | 'openai'
    baseUrl: string
    apiKey: string
    models: string[]
  }) => {
    const input = createProviderSchema.parse(data)
    return providerService.create(input)
  })

  ipcMain.handle('provider:update', async (_event, id: number, data: Record<string, unknown>) => {
    const input = updateProviderSchema.parse(data)
    return providerService.update(id, input)
  })

  ipcMain.handle('provider:delete', async (_event, id: number) => {
    return providerService.remove(id)
  })

  // ====== API 密钥 CRUD ======
  ipcMain.handle('apikey:list', async () => {
    return apiKeyService.list()
  })

  ipcMain.handle('apikey:create', async (_event, name: string, rateLimit?: number) => {
    const input = createApiKeySchema.parse({ name, rateLimit })
    return apiKeyService.create(input)
  })

  ipcMain.handle('apikey:delete', async (_event, id: number) => {
    return apiKeyService.remove(id)
  })

  // ====== 日志查询与统计 ======
  ipcMain.handle('logs:query', async (_event, params: Record<string, unknown>) => {
    return logsService.query(params)
  })

  ipcMain.handle('logs:stats', async (_event, range: string) => {
    return statsService.summary(range)
  })

  ipcMain.handle('logs:statsDetailed', async (_event, range: '24h' | '30d') => {
    return logsService.detailedStats(range)
  })

  // ====== 窗口控制 ======
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

  // ====== 代理控制 ======
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

  // ====== 渲染进程调试日志转发 ======
  ipcMain.on('renderer:log', (_event, args: unknown[]) => {
    logger.debug('renderer', { args })
  })

  // ====== 对话 CRUD ======
  ipcMain.handle('conversation:list', async () => {
    return conversationService.list()
  })

  ipcMain.handle('conversation:create', async (_event, data: {
    title: string
    model: string
    providerId?: number | null
    apiKeyId?: number | null
  }) => {
    const input = createConversationSchema.parse(data)
    const id = await conversationService.create(input)
    const conv = await conversationService.getById(id)
    // 防御性检查：极端的并发/WAL 延迟场景下刚插入的记录可能查不到
    if (!conv) {
      throw new Error(`Created conversation ${id} not found`)
    }
    return conv
  })

  ipcMain.handle('conversation:update', async (_event, id: number, data: {
    title?: string
    providerId?: number | null
    model?: string
    apiKeyId?: number | null
  }) => {
    const input = updateConversationSchema.parse(data)
    return conversationService.update(id, input)
  })

  ipcMain.handle('conversation:delete', async (_event, id: number) => {
    return conversationService.remove(id)
  })

  ipcMain.handle('conversation:get', async (_event, id: number) => {
    return conversationService.getById(id) || null
  })

  ipcMain.handle('conversation:messages', async (_event, conversationId: number) => {
    return conversationService.messages(conversationId)
  })

  ipcMain.handle('conversation:addMessage', async (_event, conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => {
    const input = addMessageSchema.parse({ conversationId, role, content, thinking })
    return conversationService.addMessage(input)
  })

  // ====== 模型映射 ======
  const modelsService = createModelsService()

  ipcMain.handle('models:list', async () => modelsService.getAllModels())

  ipcMain.handle('models:mapping:find', async (_event, { providerType, sourceModel }: { providerType: string; sourceModel: string }) =>
    modelsService.findModelMapping(providerType, sourceModel)
  )

  ipcMain.handle('models:mapping:list', async () => modelsService.listModelMappings())

  ipcMain.handle('models:mapping:create', async (_event, data) => {
    const input = createModelMappingSchema.parse(data)
    return modelsService.createModelMapping(input)
  })

  ipcMain.handle('models:mapping:update', async (_event, id: number, data) => {
    const input = updateModelMappingSchema.parse(data)
    return modelsService.updateModelMapping(id, input)
  })

  ipcMain.handle('models:mapping:delete', async (_event, id: number) =>
    modelsService.deleteModelMapping(id)
  )

  // ====== 自动更新 ======
  setupUpdateIpcHandlers(updateManager)
}
