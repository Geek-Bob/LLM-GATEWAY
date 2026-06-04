/**
 * Electron 主进程入口
 *
 * 负责应用生命周期管理：创建窗口、系统托盘、初始化数据库、
 * 启动 HTTP 代理服务器、注册 IPC 处理器和自动更新管理器。
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase } from './db/connection'
import { createTables } from './db/schema'
import { initLogsDir } from './db/logs'
import { startProxy, setProxyPort } from './proxy/manager'
import { setupIpcHandlers } from './ipc'
import { UpdateManager } from './update/manager'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/**
 * 代理服务器端口号（仅监听 localhost，供 Chat 对话流使用）
 */
export const PROXY_PORT = 8080
const isDev = !app.isPackaged
/** 后端服务（数据库 + 代理）是否已初始化完成 */
let backendReady = false
;(globalThis as any).appIsQuitting = false

/**
 * 获取应用图标路径
 * 开发模式从项目资源目录读取，生产模式从打包后的 resources 目录读取
 */
function getIconPath(): string {
  const iconName = 'icon.png'
  if (isDev) {
    return path.join(app.getAppPath(), 'resources', iconName)
  }
  return path.join(process.resourcesPath, iconName)
}

/**
 * 加载系统托盘图标
 * 图标加载失败时返回空图标，避免应用崩溃
 */
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

/**
 * 创建主窗口
 *
 * - 无边框窗口 + 自定义标题栏（titleBarStyle: 'hidden'）
 * - 关闭按钮默认隐藏窗口而非退出（minimize to tray）
 * - 开发模式自动打开 DevTools
 * - 渲染进程控制台日志转发到主进程输出
 */
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

    // 如果后端已经初始化完成（极快启动场景），立即通知渲染进程
    if (backendReady) {
      mainWindow?.webContents.send('backend:ready')
    }

    // 窗口加载完成后再延迟检查更新，避免阻塞启动
    if (!isDev) {
      setTimeout(() => {
        updateManager.checkForUpdates()
      }, 3000)
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

/**
 * 创建系统托盘
 * 提供打开管理面板和退出的快捷菜单，点击托盘图标切换窗口显示
 */
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

/**
 * 启动后端服务
 *
 * 按顺序初始化：数据库连接 → 建表 → 日志目录 → HTTP 代理服务器
 * 数据目录使用 Electron 的 userData 路径，确保跨平台兼容
 */
async function startServer(): Promise<void> {
  // 修复 dev 模式路径：npx electron 启动时 userData 默认为 %APPDATA%/Electron
  // 强制使用 %APPDATA%/llm-gateway，确保 dev 和 production 共享同一个数据库
  let dataDir: string
  if (app.isPackaged) {
    dataDir = app.getPath('userData')
  } else {
    const appData = process.env.APPDATA || path.join(process.env.HOME || '', '.config')
    dataDir = path.join(appData, 'llm-gateway')
    console.log('[DEV] Using data dir:', dataDir)
  }
  await initDatabase(path.join(dataDir, 'config.db'))
  createTables()

  // Initialize NDJSON log sharding
  const logsDir = path.join(dataDir, 'logs')
  initLogsDir(logsDir)

  // Start unified server (proxy + admin API on single port)
  setProxyPort(PROXY_PORT)
  startProxy()
}

let updateManager: UpdateManager

/** 通知渲染进程后端已就绪，如窗口未加载完毕则等待 did-finish-load 后再发 */
function notifyBackendReady(): void {
  backendReady = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('backend:ready')
  }
}

// 注册 backend:isReady 查询 handler（解决渲染进程挂载晚于 notifyBackendReady 的时序问题）
ipcMain.handle('backend:isReady', () => backendReady)

/**
 * 应用就绪后的启动流程
 *
 * 优化策略：立即创建窗口让用户看到界面，后端初始化异步执行。
 * 旧流程：init DB → start proxy → create window（用户等待 100-500ms+）❌
 * 新流程：create window → init DB/Proxy（后台，渲染进程显示 loading）✅
 */
app.whenReady().then(async () => {
  // 阶段 1: 同步初始化（不依赖数据库/代理）
  updateManager = new UpdateManager()

  // 阶段 2: 立即显示窗口（用户感知延迟降低到 0）
  createWindow()
  createTray()

  // 阶段 3: 先初始化后端服务（数据库 + 代理），再注册 IPC handler
  // setupIpcHandlers 内部会访问数据库，必须在 startServer() 之后
  try {
    await startServer()
    setupIpcHandlers(updateManager)
    notifyBackendReady()
  } catch (err) {
    console.error('[STARTUP] Failed to initialize backend:', err)
  }
})

app.on('window-all-closed', () => {
  // Keep running in tray
})

app.on('before-quit', () => {
  closeDatabase()
})
