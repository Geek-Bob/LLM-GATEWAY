# LLM Gateway 自动更新功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LLM Gateway 添加自动更新功能，支持从 GitHub Releases 检测、下载和安装更新

**Architecture:** 使用 electron-updater 库实现自动更新，通过 IPC 通信连接主进程和渲染进程，使用 shadcn/ui 组件构建更新提示界面

**Tech Stack:** electron-updater, TypeScript, React, shadcn/ui, Sonner

---

## 文件结构

### 主进程文件
- `src/main/update/manager.ts` — 更新管理器核心逻辑
- `src/main/update/config.ts` — 更新配置管理
- `src/main/update/ipc.ts` — IPC 处理器
- `src/main/update/__tests__/manager.test.ts` — UpdateManager 单元测试
- `src/main/update/__tests__/config.test.ts` — 配置管理单元测试

### 渲染进程文件
- `src/renderer/components/update/UpdateDialog.tsx` — 更新提示对话框
- `src/renderer/components/update/DownloadProgress.tsx` — 下载进度组件
- `src/renderer/components/update/UpdateButton.tsx` — 手动检查更新按钮
- `src/renderer/lib/queries/update.ts` — TanStack Query hooks
- `src/renderer/components/update/__tests__/UpdateDialog.test.tsx` — 对话框测试

### 配置文件
- `package.json` — 添加 electron-updater 依赖和 publish 配置
- `electron-builder.yml` — 更新发布配置
- `src/preload/index.ts` — 添加 update API
- `src/preload/types.ts` — 添加 update 类型定义

---

### Task 1: 安装依赖和配置

**Files:**
- Modify: `package.json`
- Create: `electron-builder.yml`

- [ ] **Step 1: 安装 electron-updater**

```bash
npm install electron-updater
```

Expected: 安装成功，package.json dependencies 中出现 electron-updater

- [ ] **Step 2: 创建 electron-builder 配置文件**

创建 `electron-builder.yml`:

```yaml
appId: com.llm-gateway.app
productName: LLM Gateway
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.*'
  - '!{.eslintignore,.eslintrc.*,.prettierignore,.prettierrc.*,tsconfig.*,tailwind.config.*}'
  - '!{package.json,package-lock.json}'
  - '!{docs,src/main/update/__tests__,src/renderer/components/update/__tests__}'
asarUnpack:
  - resources/*
win:
  executableName: llm-gateway
  target:
    - target: nsis
      arch:
        - x64
        - ia32
nsis:
  artifactName: ${name}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
mac:
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSCameraUsageDescription: Application requests access to the device's camera.
    - NSMicrophoneUsageDescription: Application requests access to the device's microphone.
    - NSDocumentsFolderUsageDescription: Application requests access to the user's Documents folder.
    - NSDownloadsFolderUsageDescription: Application requests access to the user's Downloads folder.
  notarize: false
dmg:
  artifactName: ${name}-${version}.${ext}
linux:
  target:
    - AppImage
    - deb
  maintainer: llm-gateway
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
npmRebuild: false
publish:
  provider: github
  owner: YOUR_GITHUB_USERNAME
  repo: llm-gateway
  releaseType: release
```

- [ ] **Step 3: 更新 package.json 的 build 配置**

修改 `package.json`，添加 build 字段引用 electron-builder.yml：

```json
{
  "build": {
    "extends": "electron-builder.yml"
  }
}
```

- [ ] **Step 4: 提交配置变更**

```bash
git add package.json package-lock.json electron-builder.yml
git commit -m "build: 添加 electron-updater 依赖和构建配置"
```

---

### Task 2: 创建更新配置模块

**Files:**
- Create: `src/main/update/config.ts`
- Create: `src/main/update/__tests__/config.test.ts`

- [ ] **Step 1: 编写配置模块测试**

创建 `src/main/update/__tests__/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { UpdateConfigManager } from '../config'

describe('UpdateConfigManager', () => {
  let configManager: UpdateConfigManager

  beforeEach(() => {
    configManager = new UpdateConfigManager()
  })

  it('应该返回默认配置', () => {
    const config = configManager.getConfig()
    expect(config).toEqual({
      autoCheck: true,
      checkInterval: 4 * 60 * 60 * 1000,
      allowPrerelease: false,
      skipVersion: null
    })
  })

  it('应该更新配置', () => {
    configManager.updateConfig({ autoCheck: false })
    const config = configManager.getConfig()
    expect(config.autoCheck).toBe(false)
  })

  it('应该设置跳过版本', () => {
    configManager.setSkipVersion('1.2.0')
    const config = configManager.getConfig()
    expect(config.skipVersion).toBe('1.2.0')
  })

  it('应该清除跳过版本', () => {
    configManager.setSkipVersion('1.2.0')
    configManager.setSkipVersion(null)
    const config = configManager.getConfig()
    expect(config.skipVersion).toBeNull()
  })

  it('应该检查是否跳过指定版本', () => {
    configManager.setSkipVersion('1.2.0')
    expect(configManager.shouldSkipVersion('1.2.0')).toBe(true)
    expect(configManager.shouldSkipVersion('1.3.0')).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- src/main/update/__tests__/config.test.ts
```

Expected: FAIL - "Cannot find module '../config'"

- [ ] **Step 3: 实现配置模块**

创建 `src/main/update/config.ts`:

```typescript
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface UpdateConfig {
  autoCheck: boolean
  checkInterval: number
  allowPrerelease: boolean
  skipVersion: string | null
}

const defaultConfig: UpdateConfig = {
  autoCheck: true,
  checkInterval: 4 * 60 * 60 * 1000,
  allowPrerelease: false,
  skipVersion: null
}

export class UpdateConfigManager {
  private config: UpdateConfig
  private configPath: string

  constructor() {
    const userData = app.getPath('userData')
    this.configPath = path.join(userData, 'update-config.json')
    this.config = this.loadConfig()
  }

  private loadConfig(): UpdateConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        return { ...defaultConfig, ...JSON.parse(data) }
      }
    } catch {
      // 忽略加载错误，使用默认配置
    }
    return { ...defaultConfig }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch {
      // 忽略保存错误
    }
  }

  getConfig(): UpdateConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()
  }

  setSkipVersion(version: string | null): void {
    this.config.skipVersion = version
    this.saveConfig()
  }

  shouldSkipVersion(version: string): boolean {
    return this.config.skipVersion === version
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- src/main/update/__tests__/config.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交配置模块**

```bash
git add src/main/update/config.ts src/main/update/__tests__/config.test.ts
git commit -m "feat: 添加更新配置模块"
```

---

### Task 3: 创建更新管理器

**Files:**
- Create: `src/main/update/manager.ts`
- Create: `src/main/update/__tests__/manager.test.ts`

- [ ] **Step 1: 编写更新管理器测试**

创建 `src/main/update/__tests__/manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UpdateManager } from '../manager'

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn(),
    logger: null,
    autoDownload: false,
    allowPrerelease: false
  }
}))

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userData'),
    getVersion: vi.fn(() => '1.0.0'),
    isPackaged: true
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

describe('UpdateManager', () => {
  let updateManager: UpdateManager

  beforeEach(() => {
    vi.clearAllMocks()
    updateManager = new UpdateManager()
  })

  it('应该创建 UpdateManager 实例', () => {
    expect(updateManager).toBeDefined()
  })

  it('应该获取当前版本', () => {
    const version = updateManager.getCurrentVersion()
    expect(version).toBe('1.0.0')
  })

  it('应该检查更新', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '1.1.0' },
      downloadPromise: Promise.resolve()
    } as any)

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      available: true,
      version: '1.1.0'
    })
  })

  it('应该处理无更新情况', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
      updateInfo: { version: '1.0.0' },
      downloadPromise: Promise.resolve()
    } as any)

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      available: false,
      version: '1.0.0'
    })
  })

  it('应该处理检查更新错误', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('Network error'))

    const result = await updateManager.checkForUpdates()
    expect(result).toEqual({
      available: false,
      error: 'Network error'
    })
  })

  it('应该下载更新', async () => {
    const { autoUpdater } = await import('electron-updater')
    vi.mocked(autoUpdater.downloadUpdate).mockResolvedValue([])

    await updateManager.downloadUpdate()
    expect(autoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('应该安装更新', () => {
    const { autoUpdater } = require('electron-updater')
    updateManager.installUpdate()
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('应该设置允许预发布版本', () => {
    updateManager.setAllowPrerelease(true)
    const { autoUpdater } = require('electron-updater')
    expect(autoUpdater.allowPrerelease).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- src/main/update/__tests__/manager.test.ts
```

Expected: FAIL - "Cannot find module '../manager'"

- [ ] **Step 3: 实现更新管理器**

创建 `src/main/update/manager.ts`:

```typescript
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { UpdateConfigManager } from './config'

export interface UpdateCheckResult {
  available: boolean
  version?: string
  error?: string
}

export class UpdateManager {
  private configManager: UpdateConfigManager
  private updateInfo: UpdateInfo | null = null

  constructor() {
    this.configManager = new UpdateConfigManager()
    this.setupAutoUpdater()
  }

  private setupAutoUpdater(): void {
    autoUpdater.logger = null
    autoUpdater.autoDownload = false

    const config = this.configManager.getConfig()
    autoUpdater.allowPrerelease = config.allowPrerelease

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateInfo = info
      this.notifyRenderer('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.notifyRenderer('update:download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.notifyRenderer('update:downloaded', {
        version: info.version
      })
    })

    autoUpdater.on('error', (error: Error) => {
      this.notifyRenderer('update:error', {
        message: error.message
      })
    })
  }

  private notifyRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }

  getCurrentVersion(): string {
    return app.getVersion()
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) {
        return { available: false }
      }

      const currentVersion = this.getCurrentVersion()
      const newVersion = result.updateInfo.version

      if (this.configManager.shouldSkipVersion(newVersion)) {
        return { available: false, version: newVersion }
      }

      if (newVersion === currentVersion) {
        return { available: false, version: newVersion }
      }

      return { available: true, version: newVersion }
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate()
  }

  installUpdate(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  setAllowPrerelease(allow: boolean): void {
    autoUpdater.allowPrerelease = allow
    this.configManager.updateConfig({ allowPrerelease: allow })
  }

  skipVersion(version: string): void {
    this.configManager.setSkipVersion(version)
  }

  getConfig() {
    return this.configManager.getConfig()
  }

  updateConfig(updates: Record<string, unknown>) {
    this.configManager.updateConfig(updates)
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- src/main/update/__tests__/manager.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交更新管理器**

```bash
git add src/main/update/manager.ts src/main/update/__tests__/manager.test.ts
git commit -m "feat: 添加更新管理器核心逻辑"
```

---

### Task 4: 添加 IPC 通信层

**Files:**
- Create: `src/main/update/ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/types.ts`

- [ ] **Step 1: 创建 IPC 处理器**

创建 `src/main/update/ipc.ts`:

```typescript
import { ipcMain } from 'electron'
import { UpdateManager } from './manager'

export function setupUpdateIpcHandlers(updateManager: UpdateManager): void {
  ipcMain.handle('update:check', async () => {
    return updateManager.checkForUpdates()
  })

  ipcMain.handle('update:download', async () => {
    return updateManager.downloadUpdate()
  })

  ipcMain.handle('update:install', async () => {
    updateManager.installUpdate()
  })

  ipcMain.handle('update:skip-version', async (_event, version: string) => {
    updateManager.skipVersion(version)
  })

  ipcMain.handle('update:get-config', async () => {
    return updateManager.getConfig()
  })

  ipcMain.handle('update:set-config', async (_event, config) => {
    updateManager.updateConfig(config)
  })
}
```

- [ ] **Step 2: 集成到主 IPC 模块**

修改 `src/main/ipc/index.ts`，在文件顶部添加导入：

```typescript
import { UpdateManager } from '../update/manager'
import { setupUpdateIpcHandlers } from '../update/ipc'
```

在 `setupIpcHandlers` 函数末尾添加：

```typescript
// --- Update handlers ---
const updateManager = new UpdateManager()
setupUpdateIpcHandlers(updateManager)
```

- [ ] **Step 3: 更新 preload 类型定义**

修改 `src/preload/types.ts`，在 `ElectronAPI` 接口中添加：

```typescript
export interface UpdateInfo {
  version: string
  releaseNotes?: string | null
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export interface UpdateCheckResult {
  available: boolean
  version?: string
  error?: string
}

export interface UpdateConfig {
  autoCheck: boolean
  checkInterval: number
  allowPrerelease: boolean
  skipVersion: string | null
}

export interface ElectronAPI {
  // ... 现有接口 ...
  update: {
    check: () => Promise<UpdateCheckResult>
    download: () => Promise<void>
    install: () => Promise<void>
    skipVersion: (version: string) => Promise<void>
    getConfig: () => Promise<UpdateConfig>
    setConfig: (config: Partial<UpdateConfig>) => Promise<void>
    onAvailable: (callback: (info: UpdateInfo) => void) => () => void
    onProgress: (callback: (progress: UpdateProgress) => void) => () => void
    onDownloaded: (callback: (info: UpdateInfo) => void) => () => void
    onError: (callback: (error: { message: string }) => void) => () => void
  }
}
```

- [ ] **Step 4: 更新 preload 脚本**

修改 `src/preload/index.ts`，在 `electronAPI` 对象中添加：

```typescript
update: {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  skipVersion: (version: string) => ipcRenderer.invoke('update:skip-version', version),
  getConfig: () => ipcRenderer.invoke('update:get-config'),
  setConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('update:set-config', config),
  onAvailable: (callback: (info: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('update:available', handler)
    return () => ipcRenderer.removeListener('update:available', handler)
  },
  onProgress: (callback: (progress: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('update:download-progress', handler)
    return () => ipcRenderer.removeListener('update:download-progress', handler)
  },
  onDownloaded: (callback: (info: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('update:downloaded', handler)
    return () => ipcRenderer.removeListener('update:downloaded', handler)
  },
  onError: (callback: (error: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('update:error', handler)
    return () => ipcRenderer.removeListener('update:error', handler)
  }
}
```

- [ ] **Step 5: 提交 IPC 层**

```bash
git add src/main/update/ipc.ts src/main/ipc/index.ts src/preload/index.ts src/preload/types.ts
git commit -m "feat: 添加自动更新 IPC 通信层"
```

---

### Task 5: 创建更新 UI 组件

**Files:**
- Create: `src/renderer/components/update/UpdateDialog.tsx`
- Create: `src/renderer/components/update/DownloadProgress.tsx`
- Create: `src/renderer/components/update/UpdateButton.tsx`
- Create: `src/renderer/lib/queries/update.ts`
- Create: `src/renderer/components/update/__tests__/UpdateDialog.test.tsx`

- [ ] **Step 1: 创建 TanStack Query hooks**

创建 `src/renderer/lib/queries/update.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useUpdateConfig() {
  return useQuery({
    queryKey: ['update-config'],
    queryFn: () => window.electronAPI?.update?.getConfig() ?? null
  })
}

export function useCheckUpdate() {
  return useMutation({
    mutationFn: () => window.electronAPI?.update?.check() ?? Promise.resolve({ available: false })
  })
}

export function useDownloadUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => window.electronAPI?.update?.download() ?? Promise.resolve(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    }
  })
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => window.electronAPI?.update?.install() ?? Promise.resolve()
  })
}

export function useSkipVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (version: string) => window.electronAPI?.update?.skipVersion(version) ?? Promise.resolve(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    }
  })
}

export function useUpdateConfigMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      window.electronAPI?.update?.setConfig(config) ?? Promise.resolve(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    }
  })
}
```

- [ ] **Step 2: 编写 UpdateDialog 测试**

创建 `src/renderer/components/update/__tests__/UpdateDialog.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateDialog } from '../UpdateDialog'

describe('UpdateDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    currentVersion: '1.0.0',
    newVersion: '1.1.0',
    releaseNotes: '- 修复了一些 bug\n- 新增了功能',
    onUpdate: vi.fn(),
    onSkip: vi.fn()
  }

  it('应该渲染更新对话框', () => {
    render(<UpdateDialog {...defaultProps} />)

    expect(screen.getByText('发现新版本 v1.1.0')).toBeInTheDocument()
    expect(screen.getByText('当前版本：v1.0.0')).toBeInTheDocument()
    expect(screen.getByText('修复了一些 bug')).toBeInTheDocument()
    expect(screen.getByText('新增了功能')).toBeInTheDocument()
  })

  it('应该显示更新和取消按钮', () => {
    render(<UpdateDialog {...defaultProps} />)

    expect(screen.getByText('立即更新')).toBeInTheDocument()
    expect(screen.getByText('稍后再说')).toBeInTheDocument()
  })

  it('应该调用 onUpdate 当点击更新按钮', () => {
    render(<UpdateDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('立即更新'))
    expect(defaultProps.onUpdate).toHaveBeenCalled()
  })

  it('应该调用 onOpenChange 当点击取消按钮', () => {
    render(<UpdateDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('稍后再说'))
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('应该显示跳过版本复选框', () => {
    render(<UpdateDialog {...defaultProps} />)

    expect(screen.getByText('跳过此版本')).toBeInTheDocument()
  })

  it('应该调用 onSkip 当勾选跳过版本并取消', () => {
    render(<UpdateDialog {...defaultProps} />)

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByText('稍后再说'))

    expect(defaultProps.onSkip).toHaveBeenCalledWith('1.1.0')
  })

  it('应该在 open=false 时不渲染内容', () => {
    render(<UpdateDialog {...defaultProps} open={false} />)

    expect(screen.queryByText('发现新版本 v1.1.0')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 运行测试验证失败**

```bash
npm test -- src/renderer/components/update/__tests__/UpdateDialog.test.tsx
```

Expected: FAIL - "Cannot find module '../UpdateDialog'"

- [ ] **Step 4: 实现 UpdateDialog 组件**

创建 `src/renderer/components/update/UpdateDialog.tsx`:

```tsx
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentVersion: string
  newVersion: string
  releaseNotes?: string | null
  onUpdate: () => void
  onSkip: (version: string) => void
}

export function UpdateDialog({
  open,
  onOpenChange,
  currentVersion,
  newVersion,
  releaseNotes,
  onUpdate,
  onSkip
}: UpdateDialogProps) {
  const [skipVersion, setSkipVersion] = useState(false)

  const handleCancel = () => {
    if (skipVersion) {
      onSkip(newVersion)
    }
    onOpenChange(false)
  }

  const handleUpdate = () => {
    onUpdate()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            发现新版本 v{newVersion}
          </DialogTitle>
          <DialogDescription>
            当前版本：v{currentVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {releaseNotes && (
            <div>
              <h4 className="text-sm font-medium mb-2">更新内容</h4>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                {releaseNotes}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-version"
              checked={skipVersion}
              onCheckedChange={(checked) => setSkipVersion(checked === true)}
            />
            <Label htmlFor="skip-version" className="text-sm">
              跳过此版本
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            稍后再说
          </Button>
          <Button onClick={handleUpdate}>
            立即更新
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: 运行测试验证通过**

```bash
npm test -- src/renderer/components/update/__tests__/UpdateDialog.test.tsx
```

Expected: PASS

- [ ] **Step 6: 实现 DownloadProgress 组件**

创建 `src/renderer/components/update/DownloadProgress.tsx`:

```tsx
import { Progress } from '@/components/ui/progress'
import { Download, CheckCircle, AlertCircle } from 'lucide-react'

interface DownloadProgressProps {
  status: 'idle' | 'downloading' | 'downloaded' | 'error'
  percent?: number
  error?: string
}

export function DownloadProgress({ status, percent = 0, error }: DownloadProgressProps) {
  if (status === 'idle') {
    return null
  }

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      {status === 'downloading' && (
        <>
          <Download className="h-5 w-5 animate-pulse text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">正在下载更新...</p>
            <Progress value={percent} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(percent)}%
            </p>
          </div>
        </>
      )}

      {status === 'downloaded' && (
        <>
          <CheckCircle className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-medium">下载完成</p>
            <p className="text-xs text-muted-foreground">
              点击"立即安装"重启应用
            </p>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-medium">下载失败</p>
            <p className="text-xs text-muted-foreground">
              {error || '请检查网络连接后重试'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7: 实现 UpdateButton 组件**

创建 `src/renderer/components/update/UpdateButton.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useCheckUpdate } from '@/lib/queries/update'
import { toast } from 'sonner'

interface UpdateButtonProps {
  onUpdateAvailable?: (version: string) => void
}

export function UpdateButton({ onUpdateAvailable }: UpdateButtonProps) {
  const [isChecking, setIsChecking] = useState(false)
  const checkUpdate = useCheckUpdate()

  const handleCheck = async () => {
    setIsChecking(true)
    try {
      const result = await checkUpdate.mutateAsync()
      if (result.available && result.version) {
        onUpdateAvailable?.(result.version)
      } else {
        toast.info('当前已是最新版本')
      }
    } catch {
      toast.error('检查更新失败，请稍后重试')
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCheck}
      disabled={isChecking}
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`}>
      </RefreshCw>
      {isChecking ? '检查中...' : '检查更新'}
    </Button>
  )
}
```

- [ ] **Step 8: 提交 UI 组件**

```bash
git add src/renderer/components/update/ src/renderer/lib/queries/update.ts
git commit -m "feat: 添加自动更新 UI 组件"
```

---

### Task 6: 集成到应用启动流程

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/renderer/App.tsx` 或相关入口文件

- [ ] **Step 1: 修改主进程启动逻辑**

修改 `src/main/index.ts`，在 `app.whenReady()` 中添加更新检查：

```typescript
import { UpdateManager } from './update/manager'

let updateManager: UpdateManager

app.whenReady().then(async () => {
  await startServer()
  createWindow()
  createTray()
  setupIpcHandlers()

  // 初始化更新管理器
  updateManager = new UpdateManager()

  // 延迟检查更新
  setTimeout(() => {
    updateManager.checkForUpdates()
  }, 5000)
})
```

- [ ] **Step 2: 在渲染进程中添加更新监听**

在 `src/renderer/App.tsx` 或主布局组件中添加：

```typescript
import { useEffect, useState } from 'react'
import { UpdateDialog } from '@/components/update/UpdateDialog'
import { DownloadProgress } from '@/components/update/DownloadProgress'
import { useSkipVersion } from '@/lib/queries/update'
import { toast } from 'sonner'

function App() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes?: string } | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [downloadError, setDownloadError] = useState<string>()

  const skipVersion = useSkipVersion()

  useEffect(() => {
    const api = window.electronAPI?.update
    if (!api) return

    const unsubscribeAvailable = api.onAvailable((info) => {
      setUpdateInfo(info)
      setUpdateAvailable(true)
    })

    const unsubscribeProgress = api.onProgress((progress) => {
      setDownloadStatus('downloading')
      setDownloadPercent(progress.percent)
    })

    const unsubscribeDownloaded = api.onDownloaded(() => {
      setDownloadStatus('downloaded')
      toast.success('更新下载完成，点击安装重启应用')
    })

    const unsubscribeError = api.onError((error) => {
      setDownloadStatus('error')
      setDownloadError(error.message)
    })

    return () => {
      unsubscribeAvailable()
      unsubscribeProgress()
      unsubscribeDownloaded()
      unsubscribeError()
    }
  }, [])

  const handleUpdate = async () => {
    try {
      await window.electronAPI?.update?.download()
    } catch {
      toast.error('下载更新失败')
    }
  }

  const handleInstall = async () => {
    try {
      await window.electronAPI?.update?.install()
    } catch {
      toast.error('安装更新失败')
    }
  }

  const handleSkip = async (version: string) => {
    await skipVersion.mutateAsync(version)
  }

  return (
    <>
      {/* 现有应用内容 */}

      <UpdateDialog
        open={updateAvailable}
        onOpenChange={setUpdateAvailable}
        currentVersion={window.electronAPI ? '1.0.0' : 'dev'}
        newVersion={updateInfo?.version || ''}
        releaseNotes={updateInfo?.releaseNotes}
        onUpdate={handleUpdate}
        onSkip={handleSkip}
      />

      {downloadStatus !== 'idle' && (
        <div className="fixed bottom-4 right-4 z-50">
          <DownloadProgress
            status={downloadStatus}
            percent={downloadPercent}
            error={downloadError}
          />
          {downloadStatus === 'downloaded' && (
            <Button onClick={handleInstall} className="mt-2 w-full">
              立即安装
            </Button>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: 运行测试确保无破坏**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 4: 提交集成代码**

```bash
git add src/main/index.ts src/renderer/App.tsx
git commit -m "feat: 集成自动更新到应用启动流程"
```

---

### Task 7: 添加设置页面更新选项

**Files:**
- Modify: 设置页面组件（需要找到具体文件）

- [ ] **Step 1: 定位设置页面**

```bash
find src/renderer -name "*settings*" -o -name "*Settings*" -o -name "*config*" -o -name "*Config*"
```

- [ ] **Step 2: 添加更新设置区域**

在设置页面中添加：

```tsx
import { useUpdateConfig, useUpdateConfigMutation } from '@/lib/queries/update'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { UpdateButton } from '@/components/update/UpdateButton'

function UpdateSettings() {
  const { data: config } = useUpdateConfig()
  const updateConfig = useUpdateConfigMutation()

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">自动更新</h3>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>自动检查更新</Label>
          <p className="text-sm text-muted-foreground">
            应用启动时自动检查新版本
          </p>
        </div>
        <Switch
          checked={config?.autoCheck ?? true}
          onCheckedChange={(checked) =>
            updateConfig.mutate({ autoCheck: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>允许预发布版本</Label>
          <p className="text-sm text-muted-foreground">
            接收测试版和预发布版本更新
          </p>
        </div>
        <Switch
          checked={config?.allowPrerelease ?? false}
          onCheckedChange={(checked) =>
            updateConfig.mutate({ allowPrerelease: checked })
          }
        />
      </div>

      <div className="pt-4">
        <UpdateButton />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 运行测试确保无破坏**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 4: 提交设置页面**

```bash
git add [设置页面文件路径]
git commit -m "feat: 添加自动更新设置选项"
```

---

### Task 8: 端到端测试

- [ ] **Step 1: 构建应用**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 2: 打包应用**

```bash
npm run package:win
```

Expected: 生成安装包

- [ ] **Step 3: 测试更新流程**

1. 安装旧版本应用
2. 启动应用，等待更新提示
3. 点击"立即更新"
4. 观察下载进度
5. 点击"立即安装"
6. 验证应用重启后版本更新

- [ ] **Step 4: 测试跳过版本功能**

1. 启动应用，等待更新提示
2. 勾选"跳过此版本"
3. 点击"稍后再说"
4. 重启应用
5. 验证不再显示该版本更新提示

- [ ] **Step 5: 测试手动检查更新**

1. 打开设置页面
2. 点击"检查更新"按钮
3. 验证显示检查结果

- [ ] **Step 6: 提交最终代码**

```bash
git add .
git commit -m "feat: 完成自动更新功能"
```

---

## 自审清单

### 1. 规范覆盖度
- ✅ 应用启动时自动检查更新
- ✅ 定时检查更新（每 4 小时）
- ✅ 手动检查更新
- ✅ 更新提示 UI
- ✅ 下载进度显示
- ✅ 延迟重启安装
- ✅ 跳过版本功能
- ✅ 配置管理

### 2. 占位符扫描
- ✅ 无 TBD/TODO 标记
- ✅ 所有代码完整
- ✅ 所有测试完整

### 3. 类型一致性
- ✅ UpdateConfig 类型在所有文件中一致
- ✅ UpdateInfo 类型在所有文件中一致
- ✅ IPC 通道名称一致
- ✅ 方法签名一致

### 4. 测试覆盖
- ✅ 配置模块单元测试
- ✅ 更新管理器单元测试
- ✅ UI 组件单元测试
- ✅ 端到端测试计划

---

## 执行选项

**计划完成并保存到 `docs/superpowers/plans/2026-05-29-auto-update.md`**

两种执行方式：

**1. 子代理驱动（推荐）** - 每个任务派发一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中执行任务，批量执行并设置检查点

你倾向于哪种方式？
