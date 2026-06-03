# 启动性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除应用启动时的 5 个阻塞瓶颈，将安装后首次冷启动窗口出现时间降低到 <500ms

**Architecture:** 5 个独立模块，按依赖关系排序实施：先主进程低风险项（日志元数据、配置懒加载、更新器延迟导入），再渲染进程改动（Mermaid 动态导入、路由分割）。每个模块严格遵循 Red → Green → Refactor 循环。

**Tech Stack:** TypeScript 6, Electron 42, Vitest, React 19, Vite 6

---

## 文件变更清单

| 文件 | 操作 | 模块 |
|------|------|------|
| `src/main/db/logs.ts` | 修改 | 模块 1：新增 `loadMeta()`/`saveMeta()`，改 `initLogsDir()`/`rollFile()` |
| `src/main/db/__tests__/logs.test.ts` | 修改 | 模块 1：新增元数据持久化测试 |
| `src/main/update/config.ts` | 修改 | 模块 2：构造函数懒加载，`this.config` 可空 |
| `src/main/update/__tests__/config.test.ts` | 修改 | 模块 2：验证懒加载行为 |
| `src/main/update/manager.ts` | 修改 | 模块 5：`autoUpdater` 静态 import → 动态 import，新增 `ensureAutoUpdater()` |
| `src/main/update/ipc.ts` | 修改 | 模块 5：`installUpdate()` 加 `await` |
| `src/main/update/__tests__/manager.test.ts` | 修改 | 模块 5：适配延迟导入（触发 `ensureAutoUpdater` 后搜索 handler） |
| `src/renderer/components/ui/mermaid.tsx` | 修改 | 模块 3：静态 import → `useEffect` 内动态 import |
| `src/renderer/App.tsx` | 修改 | 模块 4：6 个页面 → `React.lazy()` + `Suspense` |

---

### Task 1: 日志系统元数据持久化（logs-meta.json）

**Files:**
- Modify: `src/main/db/logs.ts`
- Modify: `src/main/db/__tests__/logs.test.ts`

**设计摘要**：
- 新增 `LogsMeta` 接口：`{ entryCounter: number; currentFileNumber: number; currentFileLines: number }`
- 新增 `getMetaPath()` — 返回 `{logsDir}/logs-meta.json` 路径
- 新增 `loadMeta()` — 读 JSON 文件恢复状态（不存在时返回零值），兼容旧版本回退到全量扫描
- 新增 `saveMeta()` — `fs.writeFileSync` 写入当前状态
- 修改 `initLogsDir()` — 优先从 `loadMeta()` 恢复，元数据存在时跳过 `countLines()` 全量扫描
- 修改 `rollFile()` — 轮转后调用 `saveMeta()`

- [ ] **Step 1: 写元数据持久化的失败测试**

```typescript
// 在 src/main/db/__tests__/logs.test.ts 的 NDJSON Log Sharding describe 块末尾新增

describe('logs-meta persistence', () => {
  let logDir: string

  beforeEach(() => {
    logDir = tmpLogDir()
    initLogsDir(logDir)
  })

  afterEach(() => {
    rmDir(logDir)
  })

  it('should create logs-meta.json after first entry is written', () => {
    createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

    const metaPath = path.join(logDir, 'logs-meta.json')
    expect(fs.existsSync(metaPath)).toBe(true)

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    expect(meta.entryCounter).toBe(1)
    expect(meta.currentFileNumber).toBe(1)
    expect(typeof meta.currentFileLines).toBe('number')
  })

  it('should restore counter state from logs-meta.json on re-init', () => {
    // 写入 50 条日志
    for (let i = 0; i < 50; i++) {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })
    }

    // 重新初始化（模拟进程重启）
    initLogsDir(logDir)

    // 再写 1 条，ID 应该从 51 开始
    createLogEntry({ model: 'claude-3', apiFormat: 'anthropic' })

    const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
    const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
    const lines = content.trim().split('\n')
    // 总共应该有 51 行
    expect(lines.length).toBe(51)
    // 最后一条的 ID 应该是 51
    const lastEntry = JSON.parse(lines[lines.length - 1])
    expect(lastEntry.id).toBe(51)
  })

  it('should fall back to full scan when logs-meta.json is missing', () => {
    // 手动创建 NDJSON 文件（模拟旧版本升级）
    const line = JSON.stringify({ model: 'gpt-4', apiFormat: 'openai', created_at: new Date().toISOString() }) + '\n'
    const content = line.repeat(100)
    fs.writeFileSync(path.join(logDir, 'logs-0001.ndjson'), content, 'utf-8')

    // 删除元数据文件（如果存在）
    const metaPath = path.join(logDir, 'logs-meta.json')
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath)

    // 重新初始化应该通过扫描恢复状态
    initLogsDir(logDir)

    // 写入 1 条，ID 应该从 101 开始
    createLogEntry({ model: 'claude-3', apiFormat: 'anthropic' })

    const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
    const content2 = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
    const lines2 = content2.trim().split('\n')
    const lastEntry = JSON.parse(lines2[lines2.length - 1])
    expect(lastEntry.id).toBe(101)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run src/main/db/__tests__/logs.test.ts -t "logs-meta persistence"
```

预期：3 个测试 FAIL — `loadMeta`/`saveMeta` 不存在

- [ ] **Step 3: 实现元数据持久化函数**

在 `src/main/db/logs.ts` 中，`entryCounter` 声明之后（第 28 行后）添加：

```typescript
/** 日志系统元数据结构 */
interface LogsMeta {
  entryCounter: number
  currentFileNumber: number
  currentFileLines: number
}

/** 获取元数据文件路径 */
function getMetaPath(): string {
  return path.join(logsDir!, 'logs-meta.json')
}

/** 从元数据文件恢复计数器状态 */
function loadMeta(): LogsMeta {
  try {
    if (fs.existsSync(getMetaPath())) {
      const data = fs.readFileSync(getMetaPath(), 'utf-8')
      return JSON.parse(data) as LogsMeta
    }
  } catch {
    // 文件损坏时忽略
  }
  return { entryCounter: 0, currentFileNumber: 0, currentFileLines: 0 }
}

/** 将当前计数器状态持久化到元数据文件 */
function saveMeta(): void {
  try {
    fs.writeFileSync(
      getMetaPath(),
      JSON.stringify({ entryCounter, currentFileNumber, currentFileLines }),
      'utf-8'
    )
  } catch {
    // 写入失败时静默忽略（不影响日志记录功能）
  }
}
```

- [ ] **Step 4: 修改 `initLogsDir()` 优先使用元数据**

替换 `initLogsDir()` 函数体（第 52-70 行）：

```typescript
export function initLogsDir(dir: string): void {
  logsDir = dir
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // 优先从元数据文件恢复状态
  const meta = loadMeta()
  if (meta.entryCounter > 0 || meta.currentFileNumber > 0) {
    currentFileNumber = meta.currentFileNumber
    entryCounter = meta.entryCounter
    currentFileLines = meta.currentFileLines
    return
  }

  // 回退：元数据文件不存在时（首次运行/旧版本升级），全量扫描现有文件
  const files = getFileList()
  if (files.length > 0) {
    const lastFile = files[files.length - 1]
    currentFileNumber = extractFileNumber(lastFile)
    currentFileLines = countLines(lastFile)
    entryCounter = files.reduce((sum, f) => sum + countLines(f), 0)
    // 扫描完成后立即写入元数据，下次启动直接使用
    saveMeta()
  } else {
    currentFileNumber = 0
    currentFileLines = 0
    entryCounter = 0
  }
}
```

- [ ] **Step 5: 修改 `rollFile()` 在轮转后持久化**

在 `rollFile()` 函数末尾（第 136 行 `ensureFile(currentFileNumber)` 之后）添加：

```typescript
saveMeta()
```

- [ ] **Step 6: 在 `createLogEntry()` 中定期持久化**

在 `createLogEntry()` 函数中，`entryCounter++` 之后（第 160 行后）添加定期写入逻辑：

```typescript
// 每写入 100 条日志持久化一次元数据（防止崩溃丢失太多计数）
if (entryCounter % 100 === 0) {
  saveMeta()
}
```

- [ ] **Step 7: 运行测试验证通过**

```bash
npx vitest run src/main/db/__tests__/logs.test.ts
```

预期：所有 NDJSON Log Sharding 测试 PASS（包括原有测试 + 3 个新测试）

- [ ] **Step 8: 提交**

```bash
git add src/main/db/logs.ts src/main/db/__tests__/logs.test.ts
git commit -m "perf: 日志系统使用 logs-meta.json 替代全量文件扫描的启动计数器恢复"
```

---

### Task 2: UpdateConfigManager 构造时延迟配置读取

**Files:**
- Modify: `src/main/update/config.ts`
- Modify: `src/main/update/__tests__/config.test.ts`

**设计摘要**：
- `this.config` 类型改为 `UpdateConfig | null`，初始 `null`
- 构造函数不再调用 `loadConfig()`
- `loadConfig()` 改为私有，带缓存逻辑（`this.config` 非 null 则直接返回）
- 所有公共方法调用 `this.loadConfig()` 替代对 `this.config` 的直接访问

- [ ] **Step 1: 写懒加载行为的失败测试**

在 `src/main/update/__tests__/config.test.ts` 末尾 describe 块内新增：

```typescript
it('应该延迟读取配置文件（构造时不触发 fs.existsSync）', () => {
  vi.clearAllMocks()
  existsSyncMock.mockReturnValue(true)
  readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false }))

  // 构造时不应触发任何 fs 调用
  const mgr = new UpdateConfigManager()
  expect(existsSyncMock).not.toHaveBeenCalled()
  expect(readFileSyncMock).not.toHaveBeenCalled()

  // 首次 getConfig() 才触发读取
  const config = mgr.getConfig()
  expect(existsSyncMock).toHaveBeenCalled()
  expect(config.autoCheck).toBe(false)
})

it('应该缓存首次读取的结果，后续调用不重复 I/O', () => {
  vi.clearAllMocks()
  existsSyncMock.mockReturnValue(true)
  readFileSyncMock.mockReturnValue(JSON.stringify({ autoCheck: false }))

  const mgr = new UpdateConfigManager()
  mgr.getConfig() // 首次 — 触发 I/O
  expect(readFileSyncMock).toHaveBeenCalledTimes(1)

  mgr.getConfig() // 第二次 — 命中缓存
  expect(readFileSyncMock).toHaveBeenCalledTimes(1) // 仍为 1
})

it('应该缓存 fallback 默认值，不重复读取损坏文件', () => {
  vi.clearAllMocks()
  existsSyncMock.mockReturnValue(true)
  readFileSyncMock.mockReturnValue('{ invalid json !!!')

  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const mgr = new UpdateConfigManager()

  mgr.getConfig() // 首次 — 损坏，fallback
  expect(warnSpy).toHaveBeenCalledTimes(1)

  mgr.getConfig() // 第二次 — 缓存命中，不重复读取
  expect(warnSpy).toHaveBeenCalledTimes(1)

  warnSpy.mockRestore()
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run src/main/update/__tests__/config.test.ts -t "延迟读取|缓存首次读取|缓存 fallback"
```

预期：3 个新测试 FAIL

- [ ] **Step 3: 实现懒加载**

修改 `src/main/update/config.ts`：

```typescript
// 第 31 行：类型改为可空
private config: UpdateConfig | null = null

// 第 34-38 行：构造函数不读文件
constructor() {
  const userData = app.getPath('userData')
  this.configPath = path.join(userData, 'update-config.json')
}

// 第 41-51 行：loadConfig 改为私有 + 缓存
private loadConfig(): UpdateConfig {
  if (this.config) return this.config

  try {
    if (fs.existsSync(this.configPath)) {
      const data = fs.readFileSync(this.configPath, 'utf-8')
      this.config = { ...defaultConfig, ...JSON.parse(data) }
      return this.config
    }
  } catch (err) {
    console.warn('[UpdateConfig] loadConfig failed:', err)
  }
  this.config = { ...defaultConfig }
  return this.config
}

// 第 63-65 行：getConfig 调用 loadConfig()
getConfig(): UpdateConfig {
  return { ...this.loadConfig() }
}

// 第 68-71 行：updateConfig 调用 loadConfig()
updateConfig(updates: Partial<UpdateConfig>): void {
  this.config = { ...this.loadConfig(), ...updates }
  this.saveConfig()
}

// setSkipVersion 和 shouldSkipVersion 中的 this.config 改为 this.loadConfig()
setSkipVersion(version: string | null): void {
  this.config = { ...this.loadConfig(), skipVersion: version }
  this.saveConfig()
}

shouldSkipVersion(version: string): boolean {
  return this.loadConfig().skipVersion === version
}
```

- [ ] **Step 4: 运行测试验证全部通过**

```bash
npx vitest run src/main/update/__tests__/config.test.ts
```

预期：所有测试 PASS（8 个原有 + 3 个新增）

- [ ] **Step 5: 提交**

```bash
git add src/main/update/config.ts src/main/update/__tests__/config.test.ts
git commit -m "perf: UpdateConfigManager 延迟配置文件读取到首次访问，减少启动阻塞"
```

---

### Task 3: Mermaid 静态导入改为动态导入

**Files:**
- Modify: `src/renderer/components/ui/mermaid.tsx`

**设计摘要**：
- 删除模块顶层的 `import mermaid from 'mermaid'` 和 `mermaid.initialize(...)` 调用
- 改为在 `useEffect` 中 `await import('mermaid')` 动态加载
- `serializedRender` 和 `mermaidLock` 保持不变（它们只依赖 `mermaid.render` 返回值，不依赖模块级 mermaid 实例）
- 需处理 `mermaid` 实例类型：用 `any` 或 `typeof import('mermaid').default`

- [ ] **Step 1: 运行现有测试确认基线**

```bash
npx vitest run src/renderer/components/ui/__tests__/markdown.test.tsx
```

预期：现有 Mermaid 相关测试 PASS（确认改动不会破坏现有功能）

- [ ] **Step 2: 修改 mermaid.tsx — 动态导入**

替换 `src/renderer/components/ui/mermaid.tsx` 第 19-34 行：

```typescript
// 之前（第 19-20 行）
import { useEffect, useRef, useState, memo } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

// 之前（第 29-34 行）
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  suppressErrorRendering: true,
})
```

改为：

```typescript
import { useEffect, useRef, useState, memo } from 'react'
import { cn } from '@/lib/utils'

/** mermaid 模块的懒加载引用，首次渲染 Mermaid 图表时初始化 */
let mermaidModule: typeof import('mermaid').default | null = null
let mermaidInitialized = false
```

- [ ] **Step 3: 添加 `ensureMermaid()` 辅助函数**

在 `serializedRender` 函数之前（第 43 行前）新增：

```typescript
async function ensureMermaid(): Promise<typeof import('mermaid').default> {
  if (mermaidModule && mermaidInitialized) return mermaidModule

  const mod = await import('mermaid')
  mermaidModule = mod.default

  if (!mermaidInitialized) {
    mermaidModule.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      suppressErrorRendering: true,
    })
    mermaidInitialized = true
  }

  return mermaidModule
}
```

- [ ] **Step 4: 修改 `Mermaid` 组件调用 `ensureMermaid()`**

在 `useEffect` 的 `renderChart` 函数中（第 83 行后），`mermaid.parse(content)` 之前插入：

```typescript
const renderChart = async () => {
  try {
    setState('loading')
    setErrorMsg(null)
    setSvgContent(null)

    // 动态加载 mermaid（首次渲染时初始化）
    await ensureMermaid()
    if (cancelled) return

    // 语法检查
    await mermaidModule!.parse(content)
    if (cancelled) return

    // 生成唯一 ID 后串行渲染
    const id = `m-${Math.random().toString(36).substring(2, 11)}`
    const { svg } = await serializedRender(id, content)
    if (cancelled) return

    setSvgContent(svg)
    setState('ready')
  } catch (err) {
    if (cancelled) return
    setErrorMsg(err instanceof Error ? err.message : '图表渲染失败')
    setState('error')
  }
}
```

- [ ] **Step 5: 修改 `serializedRender` 适配**

`serializedRender` 函数内部调用 `mermaid.render(id, content)`。需要改为通过模块引用传递：

```typescript
// 修改 serializedRender 签名，接受 mermaid 实例
async function serializedRender(
  mermaid: typeof import('mermaid').default,
  id: string,
  content: string
) {
  const prev = mermaidLock
  let release!: () => void
  mermaidLock = new Promise<void>((r) => { release = r })
  try {
    await prev
    return await mermaid.render(id, content)
  } finally {
    release()
  }
}
```

然后在 `renderChart` 中将调用改为：

```typescript
const { svg } = await serializedRender(mermaidModule!, id, content)
```

- [ ] **Step 6: 构建验证**

```bash
npm run build
```

检查 `out/renderer/assets/` 中 mermaid 相关 chunk 是否已从主 bundle (`index-*.js`) 中分离为独立文件。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/ui/mermaid.tsx
git commit -m "perf: Mermaid 从静态导入改为动态导入，移除主 bundle ~4MB 依赖"
```

---

### Task 4: 路由级代码分割（React.lazy + Suspense）

**Files:**
- Modify: `src/renderer/App.tsx`

**设计摘要**：
- 6 个页面组件全部改为 `React.lazy(() => import('./pages/...'))`
- 路由外层包裹 `<Suspense fallback={<PageLoading />}>`
- `PageLoading` 为内联简单组件（纯文字 "加载中..."，不加额外依赖）

- [ ] **Step 1: 修改 App.tsx**

替换 `src/renderer/App.tsx` 的 import 部分（第 1-13 行）和路由结构：

```typescript
import { useEffect, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Sonner } from './components/ui/sonner'
import { UpdateDialog } from './components/update/UpdateDialog'
import { useSkipVersion } from './lib/queries/update'
import { toast } from 'sonner'

// 路由级代码分割：每个页面独立 chunk，按需加载
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProvidersPage = lazy(() => import('./pages/Providers'))
const ApiKeysPage = lazy(() => import('./pages/ApiKeys'))
const LogsPage = lazy(() => import('./pages/Logs'))
const ChatPage = lazy(() => import('./pages/Chat'))
const SettingsPage = lazy(() => import('./pages/Settings'))

/** 路由切换时的轻量 fallback，避免引入额外依赖 */
function PageLoading() {
  return <div className="flex items-center justify-center h-full text-muted-foreground">加载中...</div>
}
```

- [ ] **Step 2: 包裹 Suspense**

将路由部分改为（替换原第 127-138 行）：

```tsx
<HashRouter>
  <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  </Suspense>
</HashRouter>
```

- [ ] **Step 3: TypeScript 编译检查**

```bash
npx tsc --noEmit
```

预期：零错误

- [ ] **Step 4: 构建验证**

```bash
npm run build
```

检查：
- `out/renderer/assets/` 中是否有按页面拆分的 chunk 文件（如 `Dashboard-*.js`、`Chat-*.js` 等）
- 主 bundle `index-*.js` 体积是否显著减小

- [ ] **Step 5: 提交**

```bash
git add src/renderer/App.tsx
git commit -m "perf: 路由级代码分割 — React.lazy + Suspense 按页面拆分 bundle"
```

---

### Task 5: electron-updater 延迟导入

**Files:**
- Modify: `src/main/update/manager.ts`
- Modify: `src/main/update/ipc.ts`
- Modify: `src/main/update/__tests__/manager.test.ts`

**设计摘要**：
- `import { autoUpdater, UpdateInfo }` → `import type { UpdateInfo }`（类型擦除，零运行时开销）
- 新增私有字段 `_autoUpdater: any = null`
- 新增私有方法 `ensureAutoUpdater(): Promise<any>`，首次调用时 `await import('electron-updater')` + 注册事件监听
- 所有访问 `autoUpdater` 的方法先 `await this.ensureAutoUpdater()`
- `installUpdate()` 和 `setAllowPrerelease()` 同步 → async
- `update/ipc.ts` 中 `installUpdate()` 调用加 `await`

- [ ] **Step 1: 修改 manager.ts — 类型安全的延迟导入**

```typescript
// 第 1 行：改为 type-only import
import type { UpdateInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { type UpdateConfig, UpdateConfigManager } from './config'

// 第 20 行：新增私有字段
export class UpdateManager {
  private configManager: UpdateConfigManager
  private _autoUpdater: any = null      // 懒加载引用
  private _autoUpdaterReady = false     // 事件监听是否已注册

  // 第 23-26 行：构造函数不再调用 setupAutoUpdater()
  constructor() {
    this.configManager = new UpdateConfigManager()
  }

  // 第 28-73 行：setupAutoUpdater 替换为 ensureAutoUpdater
  /** 首次调用时动态导入 electron-updater 并注册事件监听 */
  private async ensureAutoUpdater(): Promise<any> {
    if (this._autoUpdater) return this._autoUpdater

    const { autoUpdater } = await import('electron-updater')
    this._autoUpdater = autoUpdater

    // 初始化配置和事件监听（原 setupAutoUpdater 逻辑）
    autoUpdater.logger = null
    autoUpdater.autoDownload = false

    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
    }

    const config = this.configManager.getConfig()
    autoUpdater.allowPrerelease = config.allowPrerelease

    autoUpdater.on('update-available', (info: UpdateInfo) => {
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

    return autoUpdater
  }

  // 删除 setupAutoUpdater() 方法（逻辑已移入 ensureAutoUpdater）
```

- [ ] **Step 2: 修改所有访问 autoUpdater 的方法**

```typescript
// checkForUpdates() — 第 95-135 行
async checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const a = await this.ensureAutoUpdater()              // ← 新增
    console.log('[UpdateManager] Checking for updates...')
    console.log('[UpdateManager] Current version:', this.getCurrentVersion())
    console.log('[UpdateManager] isPackaged:', app.isPackaged)
    console.log('[UpdateManager] forceDevUpdateConfig:', a.forceDevUpdateConfig)

    const result = await a.checkForUpdates()               // ← autoUpdater → a
    // ... 其余逻辑中 autoUpdater 替换为 a
```

完整替换 `checkForUpdates()` 方法：

```typescript
async checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const a = await this.ensureAutoUpdater()
    console.log('[UpdateManager] Checking for updates...')
    console.log('[UpdateManager] Current version:', this.getCurrentVersion())
    console.log('[UpdateManager] isPackaged:', app.isPackaged)
    console.log('[UpdateManager] forceDevUpdateConfig:', a.forceDevUpdateConfig)

    const result = await a.checkForUpdates()
    console.log('[UpdateManager] checkForUpdates result:', result)

    if (!result) {
      console.log('[UpdateManager] No result from checkForUpdates')
      return { available: false }
    }

    const currentVersion = this.getCurrentVersion()
    const newVersion = result.updateInfo.version
    console.log('[UpdateManager] Current:', currentVersion, 'New:', newVersion)

    if (this.configManager.shouldSkipVersion(newVersion)) {
      console.log('[UpdateManager] Version skipped:', newVersion)
      return { available: false, version: newVersion }
    }

    if (newVersion === currentVersion) {
      console.log('[UpdateManager] Same version, no update')
      return { available: false, version: newVersion }
    }

    console.log('[UpdateManager] Update available:', newVersion)
    return { available: true, version: newVersion }
  } catch (error) {
    console.error('[UpdateManager] Error checking for updates:', error)
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// downloadUpdate() — 同步 → async
async downloadUpdate(): Promise<void> {
  const a = await this.ensureAutoUpdater()
  await a.downloadUpdate()
}

// installUpdate() — 同步 → async
async installUpdate(): Promise<void> {
  const a = await this.ensureAutoUpdater()
  a.quitAndInstall(false, true)
}

// setAllowPrerelease() — 同步 → async
async setAllowPrerelease(allow: boolean): Promise<void> {
  const a = await this.ensureAutoUpdater()
  a.allowPrerelease = allow
  this.configManager.updateConfig({ allowPrerelease: allow })
}
```

- [ ] **Step 3: 修改 update/ipc.ts 适配 async 方法**

```typescript
// 第 22-24 行：installUpdate 现在是 async
ipcMain.handle('update:install', async () => {
  await updateManager.installUpdate()          // ← 加 await
})
```

- [ ] **Step 4: 修改测试适配延迟导入**

`src/main/update/__tests__/manager.test.ts` 中需要适配的测试：

**测试 "应该通过 notifyRenderer 向所有窗口发送事件"（第 112-134 行）**：
需要在查找 handler 前先触发 `ensureAutoUpdater()`：

```typescript
it('应该通过 notifyRenderer 向所有窗口发送事件', async () => {
  const { BrowserWindow } = await import('electron')
  const mockSend = vi.fn()
  const mockWin = {
    isDestroyed: vi.fn(() => false),
    webContents: { send: mockSend }
  }
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

  // 先触发 ensureAutoUpdater（注册事件监听）
  const { autoUpdater } = await import('electron-updater')
  vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
    updateInfo: { version: '2.0.0' },
    downloadPromise: Promise.resolve()
  } as any)
  await updateManager.checkForUpdates()       // ← 新增：触发延迟导入

  // 现在查找 handler
  const updateAvailableHandler = vi.mocked(autoUpdater.on).mock.calls.find(
    (call) => call[0] === 'update-available'
  )?.[1] as ((info: any) => void) | undefined

  expect(updateAvailableHandler).toBeDefined()
  updateAvailableHandler!({ version: '2.0.0', releaseNotes: 'test' })

  expect(mockSend).toHaveBeenCalledWith('update:available', {
    version: '2.0.0',
    releaseNotes: 'test'
  })
})
```

**测试 "应该跳过已销毁的窗口"（第 136-153 行）** — 同样加 `await updateManager.checkForUpdates()` 前置：

```typescript
it('应该跳过已销毁的窗口', async () => {
  const { BrowserWindow } = await import('electron')
  const mockSend = vi.fn()
  const destroyedWin = {
    isDestroyed: vi.fn(() => true),
    webContents: { send: mockSend }
  }
  vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([destroyedWin as any])

  // 先触发 ensureAutoUpdater
  const { autoUpdater } = await import('electron-updater')
  vi.mocked(autoUpdater.checkForUpdates).mockResolvedValue({
    updateInfo: { version: '2.0.0' },
    downloadPromise: Promise.resolve()
  } as any)
  await updateManager.checkForUpdates()

  const updateAvailableHandler = vi.mocked(autoUpdater.on).mock.calls.find(
    (call) => call[0] === 'update-available'
  )?.[1] as ((info: any) => void) | undefined

  updateAvailableHandler!({ version: '2.0.0', releaseNotes: 'test' })

  expect(mockSend).not.toHaveBeenCalled()
})
```

**测试 "应该安装更新"（第 100-104 行）** — `installUpdate()` 现在是 async：

```typescript
it('应该安装更新', async () => {
  const { autoUpdater } = await import('electron-updater')
  await updateManager.installUpdate()              // ← 加 await
  expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true)
})
```

**测试 "应该设置允许预发布版本"（第 106-110 行）** — `setAllowPrerelease()` 现在是 async：

```typescript
it('应该设置允许预发布版本', async () => {
  const { autoUpdater } = await import('electron-updater')
  await updateManager.setAllowPrerelease(true)    // ← 加 await
  expect(autoUpdater.allowPrerelease).toBe(true)
})
```

- [ ] **Step 5: 运行 update 测试**

```bash
npx vitest run src/main/update/__tests__/manager.test.ts
```

预期：所有测试 PASS

- [ ] **Step 6: 运行全部测试**

```bash
npx vitest run
```

预期：所有已有测试 PASS（除已有的无关失败：`new-api-main` 目录和日志轮转超时）

- [ ] **Step 7: 提交**

```bash
git add src/main/update/manager.ts src/main/update/ipc.ts src/main/update/__tests__/manager.test.ts
git commit -m "perf: electron-updater 从静态导入改为延迟动态导入，减少主进程启动时的模块解析"
```

---

### Task 6: 最终验证

- [ ] **Step 1: TypeScript 编译**

```bash
npx tsc --noEmit
```

预期：零错误

- [ ] **Step 2: 全量测试**

```bash
npm test
```

预期：所有测试 PASS，无新增失败

- [ ] **Step 3: 构建**

```bash
npm run build
```

验证要点：
- 构建无错误
- `out/main/index.js` 中启动顺序为先 `createWindow()` 后 `await startServer()`（第一轮已修复）
- `out/renderer/assets/` 中有按路由拆分的 chunk 文件
- 主 bundle 体积显著小于之前的 4.4MB
- Mermaid 相关的 chunk 从主 bundle 中分离

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: 最终验证 — 全量测试 + 构建通过"
```
