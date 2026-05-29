import { contextBridge, ipcRenderer } from 'electron'
import type { UpdateConfig, UpdateInfo, UpdateProgress } from './types'

contextBridge.exposeInMainWorld('electronAPI', {
  debug: {
    log: (...args: any[]) => ipcRenderer.send('renderer:log', args),
  },
  providers: {
    list: () => ipcRenderer.invoke('provider:list'),
    create: (data: any) => ipcRenderer.invoke('provider:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('provider:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('provider:delete', id)
  },
  apiKeys: {
    list: () => ipcRenderer.invoke('apikey:list'),
    create: (name: string, rateLimit?: number) =>
      ipcRenderer.invoke('apikey:create', name, rateLimit),
    delete: (id: number) => ipcRenderer.invoke('apikey:delete', id)
  },
  conversations: {
    list: () => ipcRenderer.invoke('conversation:list'),
    create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) =>
      ipcRenderer.invoke('conversation:create', data),
    update: (id: number, data: { title?: string; providerId?: number | null; model?: string; apiKeyId?: number | null }) =>
      ipcRenderer.invoke('conversation:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('conversation:delete', id),
    get: (id: number) => ipcRenderer.invoke('conversation:get', id),
    messages: (conversationId: number) => ipcRenderer.invoke('conversation:messages', conversationId),
    addMessage: (conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) =>
      ipcRenderer.invoke('conversation:addMessage', conversationId, role, content, thinking),
  },
  logs: {
    query: (params: any) => ipcRenderer.invoke('logs:query', params),
    stats: (range: string) => ipcRenderer.invoke('logs:stats', range),
    statsDetailed: (range: '24h' | '30d') => ipcRenderer.invoke('logs:statsDetailed', range)
  },
  proxy: {
    status: () => ipcRenderer.invoke('proxy:status'),
    start: (port?: number) => ipcRenderer.invoke('proxy:start', port),
    stop: () => ipcRenderer.invoke('proxy:stop'),
    restart: (port?: number) => ipcRenderer.invoke('proxy:restart', port),
    setPort: (port: number) => ipcRenderer.invoke('proxy:setPort', port),
    getDebugMode: () => ipcRenderer.invoke('proxy:getDebugMode'),
    setDebugMode: (enabled: boolean) => ipcRenderer.invoke('proxy:setDebugMode', enabled)
  },
  chat: {
    send: (data: { requestId: string; apiKeyId: number; model: string; messages: { role: string; content: string }[]; apiFormat: 'anthropic' | 'openai' }) => {
      ipcRenderer.send('chat:send', data)
    },
    abort: (requestId: string) => {
      ipcRenderer.send('chat:abort', requestId)
    },
    onChunk: (callback: (data: { requestId: string; text: string; chunkType?: 'thinking' | 'text'; done: boolean; error?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('chat:chunk', handler)
      return () => ipcRenderer.removeListener('chat:chunk', handler)
    }
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    skipVersion: (version: string) => ipcRenderer.invoke('update:skip-version', version),
    getConfig: () => ipcRenderer.invoke('update:get-config'),
    setConfig: (config: Partial<UpdateConfig>) => ipcRenderer.invoke('update:set-config', config),
    getCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
    onAvailable: (callback: (info: UpdateInfo) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: UpdateInfo) => callback(data)
      ipcRenderer.on('update:available', handler)
      return () => ipcRenderer.removeListener('update:available', handler)
    },
    onProgress: (callback: (progress: UpdateProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: UpdateProgress) => callback(data)
      ipcRenderer.on('update:download-progress', handler)
      return () => ipcRenderer.removeListener('update:download-progress', handler)
    },
    onDownloaded: (callback: (info: UpdateInfo) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: UpdateInfo) => callback(data)
      ipcRenderer.on('update:downloaded', handler)
      return () => ipcRenderer.removeListener('update:downloaded', handler)
    },
    onError: (callback: (error: { message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { message: string }) => callback(data)
      ipcRenderer.on('update:error', handler)
      return () => ipcRenderer.removeListener('update:error', handler)
    }
  }
})
