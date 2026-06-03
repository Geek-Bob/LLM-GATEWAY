# 应用启动性能优化 — 设计文档

**日期**: 2026-06-03  
**状态**: 设计完成，待实施

---

## 问题描述

用户安装后点击打开应用，长时间无响应，过半响窗体才出现。排查发现多个启动阻塞点叠加。

## 已完成的修复（第一轮）

| 优化项 | 文件 | 改动 |
|--------|------|------|
| 窗口创建顺序重排 | `src/main/index.ts` | `createWindow()` 移到 `await startServer()` 之前，窗口立即显示 |
| 渲染进程 loading 界面 | `src/renderer/App.tsx` | `backend:ready` IPC 事件门控，后端未就绪时显示 "正在初始化服务..." |
| 删除 Google Fonts 引用 | `src/renderer/index.html` | 移除 3 行 `fonts.googleapis.com` 链接（国内被墙，阻塞渲染 5-30 秒） |

## 本轮优化目标（第二轮，5 个模块）

---

### 模块 1：日志系统计数器持久化（logs-meta.json）

**文件**: `src/main/db/logs.ts`

**当前问题**: `initLogsDir()` 启动时对每个 NDJSON 文件调用 `countLines()`，后者使用 `fs.readFileSync()` 读取整个文件仅为了 `.split('\n').length`。最坏情况 10 文件 × 10000 行 = ~5-10MB 同步 I/O。

**架构澄清**: 仪表盘统计数据（`useDashboardStats`、`useHourlyStats`、`useDailyStats`）100% 来自 SQLite 的 `request_stats` 和 `request_stats_provider` 预聚合表，完全不依赖 NDJSON 文件扫描。NDJSON 文件仅服务于 Logs 页面的分页详情查询。

**设计方案**: 新增 `logs-meta.json`（~100 字节），存储 `entryCounter`、`currentFileNumber`、`currentFileLines` 三个内存变量。

```
logs-meta.json
{
  "entryCounter": 28450,
  "currentFileNumber": 3,
  "currentFileLines": 8234
}
```

**读写时机**:
- 写入: `rollFile()` 文件轮转时 + `app.on('before-quit')` 退出时 + 每写入 N 条日志时（防崩溃丢失）
- 读取: `initLogsDir()` 启动时一次读取

**兼容性**: 如果 `logs-meta.json` 不存在（旧版本升级 / 首次运行），回退到全量扫描一次 → 立即写入元数据文件 → 之后不再扫描。

**新增函数**:
- `loadMeta(): LogsMeta` — 读取 JSON 文件恢复状态
- `saveMeta(): void` — 将内存状态写入 JSON（同步，文件很小）

**修改函数**:
- `initLogsDir()` — 调用 `loadMeta()` 替代 `countLines()` 循环
- `rollFile()` — 轮转后调用 `saveMeta()`

**收益**: 启动 I/O 从 N 次全量读文件 → 1 次 100 字节 JSON 读 + 1 次当前文件尾行验证

---

### 模块 2：UpdateConfigManager 延迟配置读取

**文件**: `src/main/update/config.ts`

**当前问题**: 构造函数中同步执行 `fs.existsSync + fs.readFileSync` 读取 `update-config.json`。该配置实际只在 `did-finish-load` 后 3 秒的 `checkForUpdates()` 中用到。

**设计方案**: 懒加载模式
- 构造函数只记录 `configPath` 路径，不读文件
- `this.config` 初始化为 `null`
- 新增私有方法 `loadConfig(): UpdateConfig` 带缓存逻辑
- 首次调用 `getConfig()` 时才真正读取文件
- 后续调用命中缓存，不重复 I/O

**影响范围**: `getConfig()`、`setConfig()`、`resetConfig()` 方法需适配 `this.config` 可能为 `null` 的情况

**收益**: 移除 `app.whenReady()` 同步路径上的 1 次文件 I/O

---

### 模块 3：Mermaid 静态 → 动态导入

**文件**: `src/renderer/components/ui/mermaid.tsx`

**当前问题**: 顶层 `import mermaid from 'mermaid'` 导致 mermaid 核心模块（~4MB 含 cytoscape、katex）打入主 bundle，且 `mermaid.initialize()` 在模块加载时执行。即使用户从未遇到 Mermaid 代码块，也需要承担加载和解析成本。

**设计方案**: 在 Mermaid 组件的 `useEffect` 中动态导入：

```typescript
// 之前（模块顶层）
import mermaid from 'mermaid'
mermaid.initialize({ startOnLoad: false, ... })

// 之后（useEffect 内）
useEffect(() => {
  let cancelled = false
  import('mermaid').then(mod => {
    if (cancelled) return
    mod.default.initialize({ startOnLoad: false, ... })
    setReady(true)
  })
  return () => { cancelled = true }
}, [])
```

**注意**: Mermaid 组件已通过 `markdown.tsx` 中的 `Suspense` 包裹，UI 侧无需改动。Vite 会自动将 `import('mermaid')` 拆成独立 chunk。

**收益**: 主 bundle 移除 ~4MB mermaid 相关代码，首屏 JS 解析量显著下降

---

### 模块 4：路由级代码分割（React.lazy + Suspense）

**文件**: `src/renderer/App.tsx`

**当前问题**: 6 个页面组件（Dashboard、Providers、ApiKeys、Logs、Chat、Settings）全部顶层静态 import，导致所有页面及其依赖（recharts、framer-motion、shiki、mermaid 等）打包进一个 4.4MB 主 bundle。

**设计方案**:

```typescript
// 每个页面改为 React.lazy 动态导入
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ProvidersPage = lazy(() => import('./pages/Providers'))
const ApiKeysPage = lazy(() => import('./pages/ApiKeys'))
const LogsPage = lazy(() => import('./pages/Logs'))
const ChatPage = lazy(() => import('./pages/Chat'))
const SettingsPage = lazy(() => import('./pages/Settings'))
```

路由外层包裹 `Suspense` + 轻量 fallback：

```tsx
<Suspense fallback={<div className="p-6">加载中...</div>}>
  <Routes>
    <Route element={<Layout />}>
      <Route index element={<Dashboard />} />
      {/* ... */}
    </Route>
  </Routes>
</Suspense>
```

**fallback 设计**: 简单文字 "加载中..."，不引入额外依赖。首屏 Dashboard 加载速度本身很快（~200-500ms），几乎看不到 fallback。非首屏页面首次切换时显示短暂 loading。

**收益预估**:

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 主 bundle（首屏加载）| ~4.4MB | ~1.5MB（Layout + 共享组件 + Dashboard）|
| Chat 页首次进入 | 已在内存 | 额外加载 ~2MB |
| 各管理页面 | 已在内存 | 各 ~0.5-1MB 按需加载 |

---

### 模块 5：electron-updater 延迟导入

**文件**: `src/main/update/manager.ts`

**当前问题**: 顶层静态 `import { autoUpdater } from 'electron-updater'` 导致 electron-updater（976KB，56 源文件）在 Node.js 解析 `index.ts` 时即被加载。更新检查实际只在 `did-finish-load` 后 3 秒触发，且仅生产模式需要。

**设计方案**: 类型安全的延迟导入模式

```typescript
// 之前（模块顶层）
import { autoUpdater, UpdateInfo } from 'electron-updater'

// 之后 — import type 在编译后完全擦除，零运行时成本
import type { UpdateInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'

export class UpdateManager {
  private _autoUpdater: any = null           // 懒加载引用

  constructor() {
    this.configManager = new UpdateConfigManager()
    // 不再在构造时调用 setupAutoUpdater()，延后到首次需要时
  }

  /** 首次调用时动态导入 electron-updater 并注册事件监听 */
  private async ensureAutoUpdater(): Promise<any> {
    if (this._autoUpdater) return this._autoUpdater

    const { autoUpdater } = await import('electron-updater')
    this._autoUpdater = autoUpdater

    // 注册事件监听（原 setupAutoUpdater 逻辑移入此处）
    autoUpdater.logger = null
    autoUpdater.autoDownload = false
    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
    }
    const config = this.configManager.getConfig()
    autoUpdater.allowPrerelease = config.allowPrerelease
    autoUpdater.on('update-available', (info: UpdateInfo) => { ... })
    autoUpdater.on('download-progress', (progress) => { ... })
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => { ... })
    autoUpdater.on('error', (error: Error) => { ... })

    return autoUpdater
  }
}
```

**影响的方法**（所有访问 `autoUpdater` 的方法前加 `await this.ensureAutoUpdater()`）:

| 方法 | 变更 |
|------|------|
| `checkForUpdates()` | 已是 async，首行加 `const a = await this.ensureAutoUpdater()` |
| `downloadUpdate()` | 已是 async，同上 |
| `installUpdate()` | 同步 → async，同上 |
| `setAllowPrerelease()` | 同步 → async，同上 |

**调用方适配**: IPC handler (`ipc/index.ts` + `update/ipc.ts`) 中调用这些方法的 handler 已是 `async`，无需改动。preload 中 `invoke` 返回 Promise，也无需改动。

**收益**: 移除主进程模块加载阶段的 1 次重量级 import（~976KB 包体），`new UpdateManager()` 的构造时间从 ~5-15ms → ~0.5ms


---

### 模块 6（分析项，不实施）：ipc/index.ts "导入一切" 评估

**当前状态**: `ipc/index.ts` 静态 import 了全部 4 个 db 模块 + proxy/manager + update/manager，形成以下链式加载：

```
ipc/index.ts → proxy/manager.ts → proxy/server.ts → proxy/converter.ts (1395行)
            → db/providers.ts → db/connection.ts → db/database.ts → require('sql.js')
            → update/manager.ts → electron-updater (模块5优化后已解决)
```

**分析**: Node.js 在解析 `index.ts` 时就完成了整个依赖图的模块加载。但此阶段发生在 Electron 进程启动的早期（主脚本求值阶段），早于 `app.whenReady()`。实测全部模块解析 < 50ms。

**不实施的原因**:
1. 影响极小（< 50ms），远小于其他已修复的瓶颈
2. 要优化需要将所有 handler 改为动态 import 或在闭包内懒加载，显著增加首次 IPC 调用的延迟
3. 模块 5（electron-updater 延迟导入）已经解决了其中最重的依赖
4. converter.ts 尽管 1395 行，但全部是纯函数定义，无模块级副作用，解析开销可忽略

**后续方向**: 如果未来模块数量继续膨胀，可考虑将 IPC handler 注册改为按 domain 拆分 + 延迟注册模式，但当前不需处理。

---

## 不在范围内的优化项

| 项目 | 原因 |
|------|------|
| Shiki 语言 grammar tree-shaking（~3MB 无用 chunk） | 构建配置问题，非源码问题；影响的是 bundle 体积而非启动时阻塞 |
| `out/` 中测试文件被打包 | electron-builder 配置问题，不影响启动速度，仅浪费磁盘 |
| `process.cwd()` 模块级调用 | 纯字符串拼接，无 I/O，开销可忽略 |
| `require('sql.js')` 同步解析 46KB 加载器 | 必要的初始化步骤，WASM 编译已正确延迟到 `getSqlModule()` |

## 验收标准

1. **TypeScript 编译**: 零错误
2. **现有测试**: 全部通过（修改模块的测试需适配）
3. **启动时间**: 安装后首次冷启动，窗口出现 < 500ms（不含系统级杀毒软件影响）
4. **功能回归**: 仪表盘 / 日志页 / 更新配置 / Mermaid 图表 / 路由切换全部正常
