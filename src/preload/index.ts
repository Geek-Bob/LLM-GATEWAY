/**
 * preload 脚本（contextBridge）
 *
 * 安全职责：
 * - 渲染进程（不可信）通过 window.electronAPI 调用受限的主进程能力
 * - 不暴露 ipcRenderer 本身，只暴露经过白名单的方法
 * - 所有 invoke 调用是请求-响应模式（返回 Promise），send 调用是单向通知
 *
 * IPC 通道命名约定：{domain}:{action}
 *   例：provider:list, conversation:create, proxy:status
 *
 * 更新事件监听：
 *   使用 ipcRenderer.on() 监听主进程推送的事件（update:available 等），
 *   返回 removeListener 清理函数，由调用方在组件卸载时取消订阅。
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 调试日志通道：渲染进程通过此通道将日志发送到主进程统一处理
  debug: {
    log: (...args: unknown[]) => ipcRenderer.send('renderer:log', args),
  },
  /** 后端就绪事件监听，用于启动 loading 状态管理 */
  backend: {
    /** 主动查询后端是否已就绪（解决事件监听注册晚于事件发送的时序问题） */
    isReady: () => ipcRenderer.invoke('backend:isReady'),
    onReady: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('backend:ready', handler)
      return () => ipcRenderer.removeListener('backend:ready', handler)
    },
  },
  /**
   * 供应商 CRUD
   * 管理 LLM 供应商配置（名称、类型、地址、密钥、模型列表）
   */
  providers: {
    list: () => ipcRenderer.invoke('provider:list'),
    create: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) =>
      ipcRenderer.invoke('provider:create', data),
    update: (id: number, data: Record<string, unknown>) =>
      ipcRenderer.invoke('provider:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('provider:delete', id),
  },
  /**
   * API Key CRUD
   * 管理网关自身的 API Key（用于外部客户端调用代理时的身份认证）
   */
  apiKeys: {
    list: () => ipcRenderer.invoke('apikey:list'),
    create: (data: { name: string; rateLimit?: number }) =>
      ipcRenderer.invoke('apikey:create', data),
    delete: (id: number) => ipcRenderer.invoke('apikey:delete', id)
  },
  /**
   * 日志与统计
   * list: 按条件查询日志条目（支持分页、过滤）
   * stats: 聚合统计概览数据
   * statsDetailed: 按供应商/模型维度的明细统计数据
   */
  logs: {
    query: (params: Record<string, unknown>) => ipcRenderer.invoke('logs:list', params),
    stats: (range: string) => ipcRenderer.invoke('logs:stats', range),
    statsDetailed: (range: '24h' | '30d') => ipcRenderer.invoke('logs:statsDetailed', range),
  },
  /**
   * 对话 CRUD + 消息管理
   * 对话记录保存在本地 SQLite 数据库中
   * listMessages: 获取指定对话的所有消息
   * createMessage: 添加消息并记录思考过程（thinking 字段用于 Anthropic 扩展思维）
   */
  conversations: {
    list: () => ipcRenderer.invoke('conversation:list'),
    create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) =>
      ipcRenderer.invoke('conversation:create', data),
    update: (id: number, data: Record<string, unknown>) =>
      ipcRenderer.invoke('conversation:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('conversation:delete', id),
    get: (id: number) => ipcRenderer.invoke('conversation:getById', id),
    messages: (conversationId: number) => ipcRenderer.invoke('conversation:listMessages', conversationId),
    addMessage: (data: { conversationId: number; role: 'user' | 'assistant'; content: string; thinking?: string }) =>
      ipcRenderer.invoke('conversation:createMessage', data),
  },
  /**
   * 代理服务器生命周期管理
   * 控制 Hono HTTP 代理的启动/停止，查询状态和调试模式
   */
  proxy: {
    status: () => ipcRenderer.invoke('proxy:get'),
    start: (port?: number) => ipcRenderer.invoke('proxy:start', port),
    stop: () => ipcRenderer.invoke('proxy:stop'),
    setPort: (port: number) => ipcRenderer.invoke('proxy:updatePort', port),
    getDebugMode: () => ipcRenderer.invoke('proxy:get'),
    setDebugMode: (enabled: boolean) => ipcRenderer.invoke('proxy:update', enabled)
  },
  /**
   * 窗口控制（Electron 窗口最小化/最大化/关闭）
   * 使用 ipcRenderer.send（单向通知），不需要等待主进程响应
   */
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  /**
   * 自动更新
   * check/download/install：手动触发更新流程
   * skipVersion：跳过特定版本
   * onAvailable/onProgress/onDownloaded/onError：事件监听器，返回值是取消订阅函数
   */
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    skipVersion: (version: string) => ipcRenderer.invoke('update:skipVersion', version),
    getConfig: () => ipcRenderer.invoke('update:getConfig'),
    setConfig: (config: unknown) => ipcRenderer.invoke('update:setConfig', config),
    getCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
    onAvailable: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:download-progress', handler)
      return () => ipcRenderer.removeListener('update:download-progress', handler)
    },
    onDownloaded: (callback: (info: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onError: (callback: (error: { message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    }
  },
  /**
   * 模型映射
   * list: 获取所有已配置供应商的模型列表
   * mapping: 模型映射 CRUD（sourceModel → targetModel 的转换规则）
   */
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    mapping: {
      find: (sourceModel: string) =>
        ipcRenderer.invoke('models:mapping:find', sourceModel),
      list: () => ipcRenderer.invoke('models:mapping:list'),
      create: (input: { sourceModel: string; targetModel: string }) =>
        ipcRenderer.invoke('models:mapping:create', input),
      update: (id: number, updates: { sourceModel?: string; targetModel?: string }) =>
        ipcRenderer.invoke('models:mapping:update', { id, updates }),
      delete: (id: number) => ipcRenderer.invoke('models:mapping:delete', id),
    }
  },
  /**
   * Agent 配置管理
   * CRUD 操作 Agent 和 AgentConfig（配置版本管理）
   * switchConfig: 原子切换当前激活配置并写入 Agent 配置文件
   */
  agents: {
    list: () => ipcRenderer.invoke('agent:list'),
    get: (id: number) => ipcRenderer.invoke('agent:getById', id),
    create: (data: unknown) => ipcRenderer.invoke('agent:create', data),
    update: (id: number, data: unknown) => ipcRenderer.invoke('agent:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('agent:delete', id),
    listConfigs: (agentId: number) => ipcRenderer.invoke('agent:listConfigs', agentId),
    getConfig: (id: number) => ipcRenderer.invoke('agent:getConfig', id),
    createConfig: (data: unknown) => ipcRenderer.invoke('agent:createConfig', data),
    updateConfig: (id: number, data: unknown) => ipcRenderer.invoke('agent:updateConfig', id, data),
    deleteConfig: (id: number) => ipcRenderer.invoke('agent:deleteConfig', id),
    readConfigFile: (agentId: number) => ipcRenderer.invoke('agent:readConfigFile', agentId),
    switchConfig: (data: unknown) => ipcRenderer.invoke('agent:switchConfig', data),
  },
  /**
   * 数据管理
   * clear: 按模块清空本地数据（business=业务数据，operational=运行数据），
   * 主进程在事务中完成清空并返回各类完成报告
   */
  dataManagement: {
    clear: (input: { business: boolean; operational: boolean }) =>
      ipcRenderer.invoke('datamanagement:clear', input),
  },
})
