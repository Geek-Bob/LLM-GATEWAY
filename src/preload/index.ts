import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  debug: {
    log: (...args: unknown[]) => ipcRenderer.send('renderer:log', args),
  },
  apiKeys: {
    list: () => ipcRenderer.invoke('apikey:list'),
    create: (name: string, rateLimit?: number) =>
      ipcRenderer.invoke('apikey:create', name, rateLimit),
    delete: (id: number) => ipcRenderer.invoke('apikey:delete', id)
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
    setConfig: (config: unknown) => ipcRenderer.invoke('update:set-config', config),
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
  }
})
