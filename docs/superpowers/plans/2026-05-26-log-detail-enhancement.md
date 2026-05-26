# 日志详情增强 + Debug 模式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 proxy debug 信息嵌入 NDJSON 日志条目，日志页面新增 debug 模式开关和点击查看详情面板。

**Architecture:** 在 LogEntryProps 新增可选 `debug` 字段（含 client/route/conversion/upstream 四个子块）。Proxy server 在请求处理中收集完整 debug 信息，最后传给 createLogEntry 写入 NDJSON。UI 通过 IPC toggle 控制 debug 模式开关，点击表格行展开右侧详情面板。

**Tech Stack:** TypeScript, React 19, Hono, NDJSON, Electron IPC, Vitest

---

### Task 1: 数据模型 — 类型定义 + NDJSON 读写

**Files:**
- Modify: `src/renderer/lib/types.ts`
- Modify: `src/main/db/logs.ts`

- [ ] **Step 1: 新增 LogDebugInfo 类型，LogEntry 加 debug 字段**

在 `src/renderer/lib/types.ts` 的 `LogEntry` 前插入：

```typescript
export interface LogDebugInfo {
  client: {
    body: string
    apiFormat: string
  }
  route: {
    providerName: string
    providerType: string
    baseUrl: string
    modelName: string
  }
  conversion?: {
    from: string
    to: string
    originalPath: string
    convertedPath: string
    originalModel: string
    convertedModel: string
  }
  upstream: {
    url: string
    body: string
    statusCode: number
    responseBody: string
  }
}
```

在 `LogEntry` 接口末尾添加：

```typescript
  debug?: LogDebugInfo
```

- [ ] **Step 2: update LogEntryProps 添加 debug 字段**

在 `src/main/db/logs.ts` 的 `LogEntryProps` 接口末尾添加：

```typescript
  debug?: {
    client: { body: string; apiFormat: string }
    route: { providerName: string; providerType: string; baseUrl: string; modelName: string }
    conversion?: { from: string; to: string; originalPath: string; convertedPath: string; originalModel: string; convertedModel: string }
    upstream: { url: string; body: string; statusCode: number; responseBody: string }
  }
```

- [ ] **Step 3: createLogEntry 写入 debug 字段**

在 `src/main/db/logs.ts` 的 `createLogEntry` 函数中，修改 `line` 构造。找到约第 127-142 行：

```typescript
  const line =
    JSON.stringify({
      id: entryCounter,
      api_key_id: entry.apiKeyId,
      provider_id: entry.providerId,
      model: entry.model,
      api_format: entry.apiFormat,
      status_code: entry.statusCode,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      duration_ms: entry.durationMs,
      error: entry.error,
      created_at: new Date().toISOString()
    }) + '\n'
```

替换为：

```typescript
  const line =
    JSON.stringify({
      id: entryCounter,
      api_key_id: entry.apiKeyId,
      provider_id: entry.providerId,
      model: entry.model,
      api_format: entry.apiFormat,
      status_code: entry.statusCode,
      tokens_in: entry.tokensIn,
      tokens_out: entry.tokensOut,
      duration_ms: entry.durationMs,
      error: entry.error,
      created_at: new Date().toISOString(),
      debug: entry.debug
    }) + '\n'
```

- [ ] **Step 4: normalizeEntry 透传 debug**

在 `src/main/db/logs.ts` 的 `normalizeEntry` 函数中（约第 146-159 行），返回对象添加：

```typescript
    debug: raw.debug ?? undefined,
```

- [ ] **Step 5: 运行现有测试确保不破坏**

```bash
npx vitest run src/main/db/__tests__/logs.test.ts
```

Expected: 11 tests PASS

- [ ] **Step 6: 新增 debug 字段写入/读取测试**

在 `src/main/db/__tests__/logs.test.ts` 的 `createLogEntry` describe 块中，`should handle optional fields with defaults` 测试之后新增：

```typescript
    it('should store debug field when provided', () => {
      createLogEntry({
        model: 'gpt-4',
        apiFormat: 'openai',
        debug: {
          client: { body: '{"model":"gpt-4"}', apiFormat: 'openai' },
          route: { providerName: 'TestP', providerType: 'openai', baseUrl: 'https://api.test.com/v1', modelName: 'gpt-4' },
          upstream: { url: 'https://api.test.com/v1/chat/completions', body: '{"model":"gpt-4"}', statusCode: 200, responseBody: '{"choices":[]}' }
        }
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.debug).toBeDefined()
      expect(entry.debug.client.body).toBe('{"model":"gpt-4"}')
      expect(entry.debug.client.apiFormat).toBe('openai')
      expect(entry.debug.route.providerName).toBe('TestP')
      expect(entry.debug.upstream.url).toBe('https://api.test.com/v1/chat/completions')
      expect(entry.debug.upstream.statusCode).toBe(200)
    })

    it('should not include debug field when not provided', () => {
      createLogEntry({ model: 'gpt-4', apiFormat: 'openai' })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.debug).toBeUndefined()
    })

    it('should store debug with conversion info', () => {
      createLogEntry({
        model: 'gpt-4',
        apiFormat: 'openai',
        debug: {
          client: { body: '{}', apiFormat: 'openai' },
          route: { providerName: 'Anth', providerType: 'anthropic', baseUrl: 'https://api.anth.ai', modelName: 'claude-3' },
          conversion: { from: 'openai', to: 'anthropic', originalPath: '/v1/chat/completions', convertedPath: '/v1/messages', originalModel: 'gpt-4', convertedModel: 'claude-3' },
          upstream: { url: 'https://api.anth.ai/v1/messages', body: '{}', statusCode: 200, responseBody: '{}' }
        }
      })

      const files = fs.readdirSync(logDir).filter((f) => f.endsWith('.ndjson'))
      const content = fs.readFileSync(path.join(logDir, files[0]), 'utf-8')
      const entry = JSON.parse(content.trim())

      expect(entry.debug.conversion).toBeDefined()
      expect(entry.debug.conversion.from).toBe('openai')
      expect(entry.debug.conversion.to).toBe('anthropic')
      expect(entry.debug.conversion.convertedPath).toBe('/v1/messages')
    })
```

- [ ] **Step 7: 运行测试验证**

```bash
npx vitest run src/main/db/__tests__/logs.test.ts
```

Expected: 14 tests PASS (原有 11 + 新增 3)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/lib/types.ts src/main/db/logs.ts src/main/db/__tests__/logs.test.ts
git commit -m "feat: add debug field to log entries for request detail storage"
```

---

### Task 2: Debug 模式状态管理 + IPC

**Files:**
- Modify: `src/main/proxy/manager.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: manager.ts 新增 debugMode 状态**

在 `src/main/proxy/manager.ts` 的 `currentPort` 变量后（第 5 行后）添加：

```typescript
let debugMode = false
```

在 `getProxyConfig` 函数前添加 getter/setter：

```typescript
export function getDebugMode(): boolean {
  return debugMode
}

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled
}
```

- [ ] **Step 2: IPC handler 注册**

在 `src/main/ipc/index.ts` 的 proxy handlers 区域（`proxy:setPort` handler 之后约第 193-194 行），添加：

```typescript
  ipcMain.handle('proxy:getDebugMode', async () => {
    const { getDebugMode } = await import('../proxy/manager')
    return getDebugMode()
  })

  ipcMain.handle('proxy:setDebugMode', async (_event, enabled: boolean) => {
    const { setDebugMode } = await import('../proxy/manager')
    setDebugMode(enabled)
  })
```

注：由于 `getDebugMode`/`setDebugMode` 是新导出，需要在文件顶部 import 处改用动态 import（如上），或在顶部 import 中添加。选择动态 import 避免修改顶部 import 行。

更简洁的做法 — 直接更新顶部 import。找到 `import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort } from '../proxy/manager'`（约第 28 行），修改为：

```typescript
import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'
```

然后在 proxy handler 区域添加：

```typescript
  ipcMain.handle('proxy:getDebugMode', async () => {
    return getDebugMode()
  })

  ipcMain.handle('proxy:setDebugMode', async (_event, enabled: boolean) => {
    setDebugMode(enabled)
  })
```

- [ ] **Step 3: preload 暴露 API**

在 `src/preload/index.ts` 的 `proxy` 对象中（约第 36-42 行），添加两个新方法：

```typescript
    getDebugMode: () => ipcRenderer.invoke('proxy:getDebugMode'),
    setDebugMode: (enabled: boolean) => ipcRenderer.invoke('proxy:setDebugMode', enabled)
```

- [ ] **Step 4: 更新 renderer types 中的 ElectronAPI**

在 `src/preload/types.ts` 的 `proxy` 接口中添加：

```typescript
    getDebugMode: () => Promise<boolean>
    setDebugMode: (enabled: boolean) => Promise<void>
```

- [ ] **Step 5: 更新 renderer/lib/types.ts 的 electronAPI 类型**

在 `src/renderer/lib/types.ts` 的 `Window.electronAPI.proxy` 声明中（约第 89-95 行），添加：

```typescript
        getDebugMode: () => Promise<boolean>
        setDebugMode: (enabled: boolean) => Promise<void>
```

- [ ] **Step 6: 运行全量测试**

```bash
npx vitest run
```

Expected: 全量通过（本次改动不涉及破坏性变更）

- [ ] **Step 7: Commit**

```bash
git add src/main/proxy/manager.ts src/main/ipc/index.ts src/preload/index.ts src/preload/types.ts src/renderer/lib/types.ts
git commit -m "feat: add debug mode toggle state and IPC handlers"
```

---

### Task 3: Proxy server 收集并写入 debug 信息

**Files:**
- Modify: `src/main/proxy/server.ts`

- [ ] **Step 1: import getDebugMode**

在 `src/main/proxy/server.ts` 顶部，找到 `import { createLogEntry, updateRequestStats, updateProviderStats } from '../db/logs'`（约第 13 行），在其后添加：

```typescript
import { getDebugMode } from './manager'
```

- [ ] **Step 2: handleProxyRequest 中收集 debug 信息**

在 `handleProxyRequest` 函数内部，`const startTime = Date.now()` 之后，声明一个收集 debug 信息的变量：

```typescript
const debugInfo: any = getDebugMode() ? { client: {} as any, route: {} as any, upstream: {} as any } : null
```

在 `proxyDebugLog('CLIENT_REQUEST', ...)` 调用处（约第 133 行），提取 client body 字符串并存储：

```typescript
const clientBodyStr = JSON.stringify(body)
// ...
if (debugInfo) {
  debugInfo.client = { body: clientBodyStr, apiFormat }
}
```

在 `proxyDebugLog('ROUTE_RESOLVED', ...)` 之后，存储路由信息：

```typescript
if (debugInfo) {
  debugInfo.route = {
    providerName: route.provider.name,
    providerType: route.provider.providerType,
    baseUrl: route.provider.baseUrl,
    modelName: route.modelName
  }
}
```

在协议转换块中（`if (needsConversion)`），存储转换信息：

```typescript
if (debugInfo) {
  debugInfo.conversion = {
    from: apiFormat,
    to: route.provider.providerType,
    originalPath: path,
    convertedPath: proxyPath,
    originalModel: body.model,
    convertedModel: proxyBody.model
  }
}
```

在 `const url = buildProxyUrl(...)` 之后，存储上游请求信息：

```typescript
if (debugInfo) {
  debugInfo.upstream.url = url
  debugInfo.upstream.body = JSON.stringify(proxyBody)
}
```

**对于响应体收集**：需根据三个分支处理：

- **非流式 error 响应**（`!response.ok && !proxyBody.stream`）：读取 errorBody 后存储
- **流式响应**（`proxyBody.stream`）：不存响应体（流式不易捕获完整响应）
- **非流式成功响应**：读取 responseBody 后存储

具体代码：

在 `!response.ok && !proxyBody.stream` 分支（约第 235-242 行），`const errorBody = await response.json()` 之后添加：

```typescript
if (debugInfo) {
  debugInfo.upstream.statusCode = response.status
  debugInfo.upstream.responseBody = JSON.stringify(errorBody)
}
```

在非流式成功分支（约第 271-288 行），`const responseBody = await response.json()` 之后添加：

```typescript
if (debugInfo) {
  debugInfo.upstream.statusCode = response.status
  debugInfo.upstream.responseBody = JSON.stringify(responseBody)
}
```

在流式分支，添加 statusCode 但不存响应体：

```typescript
if (debugInfo) {
  debugInfo.upstream.statusCode = response.status
  debugInfo.upstream.responseBody = '(streaming — body not captured)'
}
```

- [ ] **Step 3: 将 debugInfo 传入 createLogEntry**

修改 `tryLogEntry` 调用。在所有调用 `tryLogEntry` 的地方，将 `debugInfo` 合并传入。

找到所有 `tryLogEntry(c, { ...logBase, ... })` 调用，在参数中添加 `debug: debugInfo ?? undefined`：

非流式成功分支（约第 287 行）：
```typescript
tryLogEntry(c, { ...logBase, tokensIn, tokensOut, debug: debugInfo ?? undefined })
```

非流式 error 分支：
```typescript
tryLogEntry(c, { ...logBase, debug: debugInfo ?? undefined })
```

流式分支 — `tryLogEntry` 在 `extractAndLogSSE` 中调用，不传 debug（流式暂不支持详情）。

错误处理分支 `handleProxyError` 中也不传 debug（请求可能未发出）。

- [ ] **Step 4: 运行测试验证**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: 编译通过，测试通过

- [ ] **Step 5: Commit**

```bash
git add src/main/proxy/server.ts
git commit -m "feat: collect and persist debug info per proxy request"
```

---

### Task 4: UI — 日志页面 debug 开关 + 详情面板

**Files:**
- Modify: `src/renderer/pages/Logs.tsx`

- [ ] **Step 1: 新增状态变量**

在 `LogsPage` 组件中，现有状态后添加：

```typescript
const [debugMode, setDebugMode] = useState(false)
const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
```

- [ ] **Step 2: 页面加载时读取 debug 模式**

在现有 `useEffect` 后添加：

```typescript
useEffect(() => {
  api.proxy.getDebugMode().then(setDebugMode).catch(() => {})
}, [])
```

- [ ] **Step 3: debug 模式切换函数**

```typescript
const toggleDebugMode = () => {
  const next = !debugMode
  setDebugMode(next)
  api.proxy.setDebugMode(next).catch(() => {})
}
```

- [ ] **Step 4: Header 区域添加开关**

在现有 Header `<div>` 中（约第 44-49 行），标题右侧添加 toggle：

```tsx
<div className="flex items-center gap-3">
  <button
    onClick={toggleDebugMode}
    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
    style={{
      background: debugMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(100, 116, 139, 0.12)',
      color: debugMode ? '#22c55e' : '#64748b',
      border: `1px solid ${debugMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(100, 116, 139, 0.2)'}`
    }}
  >
    <span style={{ fontSize: '14px' }}>{debugMode ? '🔍' : '🔍'}</span>
    Debug {debugMode ? 'ON' : 'OFF'}
  </button>
</div>
```

- [ ] **Step 5: 表格行可点击**

在 `<tr>` 上添加 `onClick` 和样式：

```tsx
<motion.tr
  key={idx}
  initial={{ opacity: 0, x: -8 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: idx * 0.02, duration: 0.25 }}
  onClick={() => setSelectedLog(selectedLog?.id === entry.id ? null : entry)}
  style={{ cursor: 'pointer' }}
  className={selectedLog?.id === entry.id ? 'bg-white/5' : ''}
>
```

- [ ] **Step 6: 详情面板组件**

在 `</motion.div>` 闭合标签之前（分页之后），添加详情面板：

```tsx
{selectedLog && (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
    className="fixed right-0 top-12 bottom-0 w-[42%] cyber-card overflow-y-auto z-30 border-l"
    style={{ borderColor: 'rgba(148, 163, 184, 0.12)', background: '#0b1120' }}
  >
    {/* Header */}
    <div className="flex items-center justify-between mb-5 sticky top-0 py-3 px-5 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.1)', background: '#0b1120' }}>
      <h3 className="text-lg font-bold" style={{ color: '#f1f5f9' }}>
        请求详情 #{selectedLog.id}
      </h3>
      <button
        onClick={() => setSelectedLog(null)}
        className="text-xl leading-none px-2 py-1 rounded hover:bg-white/5 transition-colors"
        style={{ color: '#64748b' }}
      >
        ✕
      </button>
    </div>

    <div className="px-5 pb-5 space-y-5">
      {selectedLog.debug ? (
        <>
          {/* 客户端请求 */}
          <DebugSection title="📥 客户端请求">
            <DebugKV label="模型" value={selectedLog.model} />
            <DebugKV label="格式" value={selectedLog.debug.client.apiFormat} />
            <DebugJSON label="请求体" json={selectedLog.debug.client.body} />
          </DebugSection>

          {/* 路由 & 转换 */}
          <DebugSection title="🔀 路由 & 转换">
            <DebugKV label="Provider" value={`${selectedLog.debug.route.providerName} (${selectedLog.debug.route.providerType})`} />
            <DebugKV label="Base URL" value={selectedLog.debug.route.baseUrl} />
            <DebugKV label="上游模型" value={selectedLog.debug.route.modelName} />
            {selectedLog.debug.conversion && (
              <>
                <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }} />
                <DebugKV label="协议转换" value={`${selectedLog.debug.conversion.from} → ${selectedLog.debug.conversion.to}`} />
                <DebugKV label="原始路径" value={selectedLog.debug.conversion.originalPath} />
                <DebugKV label="转换路径" value={selectedLog.debug.conversion.convertedPath} />
                <DebugKV label="原始模型" value={selectedLog.debug.conversion.originalModel} />
                <DebugKV label="转换模型" value={selectedLog.debug.conversion.convertedModel} />
              </>
            )}
          </DebugSection>

          {/* 上游请求 */}
          <DebugSection title="📤 上游请求">
            <DebugKV label="URL" value={selectedLog.debug.upstream.url} />
            <DebugKV label="状态码" value={String(selectedLog.debug.upstream.statusCode)} mono />
            <DebugJSON label="请求体" json={selectedLog.debug.upstream.body} />
          </DebugSection>

          {/* 上游响应 */}
          <DebugSection title="📨 上游响应">
            <DebugJSON label="响应体" json={selectedLog.debug.upstream.responseBody} />
          </DebugSection>
        </>
      ) : (
        <div className="text-center py-12">
          <p style={{ color: '#64748b' }}>基础信息</p>
          <div className="mt-4 space-y-2 text-left">
            <DebugKV label="状态码" value={String(selectedLog.status_code)} />
            <DebugKV label="耗时" value={`${selectedLog.duration_ms}ms`} />
            <DebugKV label="Tokens" value={`${selectedLog.tokens_in}↑ ${selectedLog.tokens_out}↓`} />
            {selectedLog.error && <DebugKV label="错误" value={selectedLog.error} />}
          </div>
          <div className="mt-8 p-4 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
            <p className="text-sm" style={{ color: '#93c5fd' }}>
              开启 <strong>Debug 模式</strong> 后可查看完整请求/响应体
            </p>
          </div>
        </div>
      )}
    </div>
  </motion.div>
)}
```

- [ ] **Step 7: 添加辅助组件**

在文件顶部（`LogsPage` 组件之前或之后），定义 3 个辅助组件：

```tsx
function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2" style={{ color: '#94a3b8' }}>{title}</h4>
      <div className="rounded-lg p-3 space-y-1.5 text-sm" style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
        {children}
      </div>
    </div>
  )
}

function DebugKV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: '#475569', minWidth: '80px', flexShrink: 0 }}>{label}:</span>
      <span className={mono ? 'font-mono' : ''} style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function DebugJSON({ label, json }: { label: string; json: string }) {
  let formatted = json
  try {
    formatted = JSON.stringify(JSON.parse(json), null, 2)
  } catch { /* use raw string */ }

  return (
    <div className="mt-1">
      <span style={{ color: '#475569', fontSize: '13px' }}>{label}:</span>
      <pre
        className="mt-1 p-2.5 rounded text-xs overflow-x-auto max-h-72 overflow-y-auto font-mono"
        style={{ background: 'rgba(2, 6, 23, 0.8)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.08)' }}
      >
        {formatted}
      </pre>
    </div>
  )
}
```

- [ ] **Step 8: 运行全量编译 + 测试**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: TypeScript 编译通过，测试通过

- [ ] **Step 9: 功能验证**

启动 dev server 验证：
1. Debug 模式默认 OFF，日志列表正常显示
2. 点击表行，右侧滑出详情面板，显示基础信息 + 提示文字
3. 打开 Debug 开关，开关变绿
4. 发一个请求，日志中能看到 debug 字段
5. 点击该日志，详情面板显示完整请求链路

```bash
npm run dev
```

- [ ] **Step 10: Commit**

```bash
git add src/renderer/pages/Logs.tsx
git commit -m "feat: add debug mode toggle and request detail panel to logs page"
```

---

### 验证

```bash
npx tsc --noEmit        # 编译检查
npx vitest run          # 全量测试
npm run build           # 全量构建
```
