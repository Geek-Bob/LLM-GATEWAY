import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase } from './db/connection'
import { createTables } from './db/schema'
import { initLogsDir } from './db/logs'
import { startProxy, setProxyPort } from './proxy/manager'
import { setupIpcHandlers } from './ipc'
import { UpdateManager } from './update/manager'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
export const PROXY_PORT = 8080
const isDev = !app.isPackaged
;(globalThis as any).appIsQuitting = false

function getIconPath(): string {
  const iconName = 'icon.png'
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', iconName)
  }
  return path.join(process.resourcesPath, iconName)
}

function loadIcon(): Electron.NativeImage {
  try {
    const iconPath = getIconPath()
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) return img
  } catch {
    // Fall through to empty icon
  }
  return nativeImage.createEmpty()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: !isDev,
    backgroundColor: '#0f172a'
  })

  // Log renderer console messages to main process for debugging
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = ['verbose', 'info', 'warning', 'error'][level] || 'unknown'
    const logFn = [console.log, console.info, console.warn, console.error][level] || console.log
    logFn(`[renderer:${levelName}] ${message} (${sourceId}:${line})`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer did-finish-load')
    if (isDev) {
      mainWindow?.show()
      mainWindow?.webContents.openDevTools()
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('Loading dev URL:', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Renderer load failed: ${errorCode} ${errorDescription}`)
  })

  mainWindow.on('close', (event) => {
    if (!(globalThis as any).appIsQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

function createTray(): void {
  const icon = loadIcon()
  tray = new Tray(icon)
  tray.setToolTip('LLM Gateway')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Admin Panel',
      click: () => mainWindow?.show()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        ;(globalThis as any).appIsQuitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', () =>
    mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show()
  )
}

function cleanupDebugLogs(): void {
  const debugFiles = [
    'llm-gateway-chat-debug.log',
    'llm-gateway-auth-debug.log',
    'llm-gateway-proxy-debug.log'
  ]
  for (const file of debugFiles) {
    try {
      const fp = path.join(process.cwd(), file)
      if (fs.existsSync(fp)) fs.unlinkSync(fp)
    } catch { /* ignore */ }
  }
}

async function startServer(): Promise<void> {
  cleanupDebugLogs()

  const dataDir = app.getPath('userData')
  await initDatabase(path.join(dataDir, 'config.db'))
  createTables()

  // Initialize NDJSON log sharding
  const logsDir = path.join(dataDir, 'logs')
  initLogsDir(logsDir)

  // Start proxy via manager
  setProxyPort(PROXY_PORT)
  startProxy()
}

let updateManager: UpdateManager

app.whenReady().then(async () => {
  await startServer()
  createWindow()
  createTray()

  // 初始化更新管理器
  updateManager = new UpdateManager()
  setupIpcHandlers(updateManager)

  // 延迟检查更新（等待窗口加载完成）
  setTimeout(() => {
    updateManager.checkForUpdates()
  }, 5000)
})

app.on('window-all-closed', () => {
  // Keep running in tray
})

app.on('before-quit', () => {
  closeDatabase()
})
