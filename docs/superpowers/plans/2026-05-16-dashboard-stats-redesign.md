# 仪表盘统计重构 实施计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 superpowers:finishing-a-development-branch 交付

**目标：** 替换仪表盘无用的健康状态区域，改为按供应商/模型维度的调用统计，含 24h 柱状图 + 30d 面积图

**架构：** 新增 `request_stats_provider` sql.js 表按 (date, hour, provider_id, model) 聚合，代理请求时同步写入。新 IPC `logs:statsDetailed` 返回结构化数据。前端用 recharts 渲染图表

**技术栈：** sql.js, recharts, framer-motion

**追踪：** `[✅] 6/6 任务` — 全部完成 ✅

---

### Task 1: 新增数据库表 + 数据写入逻辑

**文件：**
- 修改：`src/main/db/schema.ts` — 添加 `request_stats_provider` CREATE TABLE
- 修改：`src/main/db/logs.ts` — `updateRequestStats` 增加对新表的写入

**步骤：**

- [✅] **步骤 1：在 schema.ts 中添加新表**

在 `src/main/db/schema.ts` 的 `createTables` 函数中，`request_stats` 表的 CREATE TABLE 之后，添加新表定义：

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS request_stats_provider (
    stat_date TEXT NOT NULL,
    stat_hour INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    total_requests INTEGER DEFAULT 0,
    total_tokens_in INTEGER DEFAULT 0,
    total_tokens_out INTEGER DEFAULT 0,
    total_errors INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    PRIMARY KEY (stat_date, stat_hour, provider_id, model)
  );
`)
```

- [✅] **步骤 2：在 logs.ts 中新增 `updateProviderStats` 函数**

在 `src/main/db/logs.ts` 中 `updateRequestStats` 函数下方，新增一个写入新表的函数：

```typescript
export function updateProviderStats(entry: {
  providerId?: number
  model: string
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  statusCode?: number
}): void {
  const db = getDb()
  if (entry.providerId === undefined) return // skip if no provider context
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const hour = now.getHours()
  const tokensIn = entry.tokensIn ?? 0
  const tokensOut = entry.tokensOut ?? 0
  const durationMs = entry.durationMs ?? 0
  const errorCount = entry.statusCode !== undefined && entry.statusCode >= 400 ? 1 : 0

  db.prepare(
    `INSERT INTO request_stats_provider (stat_date, stat_hour, provider_id, model, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms)
     VALUES (@date, @hour, @providerId, @model, 1, @tokensIn, @tokensOut, @errorCount, @durationMs)
     ON CONFLICT(stat_date, stat_hour, provider_id, model) DO UPDATE SET
       total_requests = total_requests + 1,
       total_tokens_in = total_tokens_in + @tokensIn,
       total_tokens_out = total_tokens_out + @tokensOut,
       total_errors = total_errors + @errorCount,
       total_duration_ms = total_duration_ms + @durationMs`
  ).run({
    date: dateStr,
    hour,
    providerId: entry.providerId,
    model: entry.model,
    tokensIn,
    tokensOut,
    errorCount,
    durationMs
  })
}
```

- [✅] **步骤 3：在 proxy server.ts 的 `tryLogEntry` 中调用新函数**

在 `src/main/proxy/server.ts` 中，在 `tryLogEntry` 函数的 `createLogEntry` 和 `updateRequestStats` 调用之后，添加 `updateProviderStats` 调用。确保传入 `providerId` 和 `model`：

```typescript
function tryLogEntry(
  _c: Context<AppEnv>,
  entry: {
    apiKeyId?: number
    providerId?: number
    model: string
    apiFormat: 'anthropic' | 'openai'
    statusCode?: number
    tokensIn?: number
    tokensOut?: number
    durationMs?: number
    error?: string
  }
): void {
  try {
    createLogEntry(entry)
    updateRequestStats(entry)
    updateProviderStats(entry)  // 新增
  } catch {
    // Silently ignore logging failures
  }
}
```

- [✅] **步骤 4：运行测试确保现有测试通过**

```bash
npx vitest run
```

预期：全部 119+ 测试通过。

---

### Task 2: 查询函数 + IPC handler [✅] [✅]

- [✅] **步骤 1：在 logs.ts 中添加 `getDetailedStats` 函数**

在 `src/main/db/logs.ts` 末尾添加：

```typescript
export function getDetailedStats(range: '24h' | '30d'): Record<string, unknown>[] {
  const db = getDb()
  let dateCondition: string
  let groupBy: string

  if (range === '24h') {
    dateCondition = "stat_date = date('now')"
    groupBy = 'stat_hour'
  } else {
    dateCondition = "stat_date >= date('now', '-30 days')"
    groupBy = 'stat_date'
  }

  const rows = db
    .prepare(
      `SELECT
        provider_id,
        model,
        ${groupBy === 'stat_hour' ? 'stat_hour' : 'stat_date'} as period,
        SUM(total_requests) as total_requests,
        SUM(total_tokens_in) as total_tokens_in,
        SUM(total_tokens_out) as total_tokens_out,
        SUM(total_errors) as total_errors
      FROM request_stats_provider
      WHERE ${dateCondition}
      GROUP BY provider_id, model, ${groupBy}
      ORDER BY provider_id, model, ${groupBy}`
    )
    .all() as Record<string, unknown>[]

  return rows
}
```

- [✅] **步骤 2：在 ipc/index.ts 中添加 `logs:statsDetailed` handler**

在 `src/main/ipc/index.ts` 中 import `getDetailedStats` 到日志 handlers 区域。在 `logs:stats` handler 之后添加：

```typescript
ipcMain.handle('logs:statsDetailed', async (_event, range: '24h' | '30d') => {
  const rows = getDetailedStats(range)
  const providers = listProviders()

  // Group rows by provider_id
  const providerMap = new Map<number, {
    providerId: number
    providerName: string
    models: Map<string, {
      model: string
      totalRequests: number
      totalTokensIn: number
      totalTokensOut: number
      totalErrors: number
      dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[]
    }>
  }>()

  for (const row of rows) {
    const pid = row.provider_id as number
    const model = row.model as string
    if (!providerMap.has(pid)) {
      const p = providers.find((pr) => pr.id === pid)
      providerMap.set(pid, {
        providerId: pid,
        providerName: p?.name ?? `Provider #${pid}`,
        models: new Map()
      })
    }
    const pm = providerMap.get(pid)!
    if (!pm.models.has(model)) {
      pm.models.set(model, {
        model,
        totalRequests: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalErrors: 0,
        dataPoints: []
      })
    }
    const mm = pm.models.get(model)!
    mm.totalRequests += row.total_requests as number
    mm.totalTokensIn += row.total_tokens_in as number
    mm.totalTokensOut += row.total_tokens_out as number
    mm.totalErrors += row.total_errors as number
    mm.dataPoints.push({
      period: row.period as number | string,
      requests: row.total_requests as number,
      tokensIn: row.total_tokens_in as number,
      tokensOut: row.total_tokens_out as number
    })
  }

  return Array.from(providerMap.values()).map((p) => ({
    providerId: p.providerId,
    providerName: p.providerName,
    models: Array.from(p.models.values()).map((m) => ({
      model: m.model,
      totalRequests: m.totalRequests,
      totalTokensIn: m.totalTokensIn,
      totalTokensOut: m.totalTokensOut,
      totalErrors: m.totalErrors,
      dataPoints: m.dataPoints
    }))
  }))
})
```

- [✅] **步骤 3：在 preload/index.ts 中添加 `statsDetailed` API**

在 `src/preload/index.ts` 的 `logs` 对象中，在 `stats` 之后添加：

```typescript
statsDetailed: (range: '24h' | '30d') => ipcRenderer.invoke('logs:statsDetailed', range),
```

- [✅] **步骤 4：构建验证**

```bash
npm run build
```

预期：构建成功，无类型错误。

---

### Task 3: 删除健康检查相关代码 [✅]

**文件：**
- 删除：`src/main/utils/health.ts`
- 删除：`src/main/utils/__tests__/crypto.test.ts`（保留，不删除此文件）
- 修改：`src/main/index.ts` — 移除 `startHealthCheck`、`stopHealthCheck`、`startLogCleanup` 引用
- 修改：`src/main/ipc/index.ts` — 移除 `health:check` handler，移除 `checkProviderHealth` import
- 修改：`src/preload/index.ts` — 移除 `health` 对象
- 修改：`src/renderer/lib/types.ts` — 移除 `HealthStatus` 接口

**步骤：**

- [ ] **步骤 1：删除 `src/main/utils/health.ts` 文件**

```bash
rm src/main/utils/health.ts
```

- [ ] **步骤 2：修改 `src/main/index.ts`**

移除 import 行：
```typescript
import { startHealthCheck, startLogCleanup } from './utils/health'
```

移除变量声明：
```typescript
let stopHealthCheck: (() => void) | null = null
let stopLogCleanup: (() => void) | null = null
```

移除 `startServer` 函数中的调用：
```typescript
stopHealthCheck = startHealthCheck()
stopLogCleanup = startLogCleanup()
```

移除 `before-quit` 中的调用：
```typescript
stopHealthCheck?.()
stopLogCleanup?.()
```

- [ ] **步骤 3：修改 `src/main/ipc/index.ts`**

移除 import：
```typescript
import { checkProviderHealth } from '../utils/health'
```

移除整个 `health:check` handler 块（约 10 行）。

- [ ] **步骤 4：修改 `src/preload/index.ts`**

移除整个 `health` 对象：
```typescript
health: {
  check: () => ipcRenderer.invoke('health:check'),
  onStatus: (callback: ...) => { ... }
},
```

- [ ] **步骤 5：修改 `src/renderer/lib/types.ts`**

移除 `HealthStatus` 接口定义（整个 interface 块）。

- [ ] **步骤 6：构建验证**

```bash
npm run build
```

预期：构建成功，无 `health` 相关错误。

---

### Task 4: 前端类型定义 [✅]

**文件：**
- 修改：`src/renderer/lib/types.ts` — 添加 `ProviderStatsModel`、`ProviderStatsGroup`、`DetailedStats` 类型，更新 `Window.electronAPI`

**步骤：**

- [ ] **步骤 1：添加新的统计类型**

在 `src/renderer/lib/types.ts` 中，移除 `HealthStatus` 接口后，添加：

```typescript
export interface StatsDataPoint {
  period: number | string  // hour (0-23) for 24h, date string for 30d
  requests: number
  tokensIn: number
  tokensOut: number
}

export interface ProviderStatsModel {
  model: string
  totalRequests: number
  totalTokensIn: number
  totalTokensOut: number
  totalErrors: number
  dataPoints: StatsDataPoint[]
}

export interface ProviderStatsGroup {
  providerId: number
  providerName: string
  models: ProviderStatsModel[]
}
```

- [ ] **步骤 2：更新 Window.electronAPI 类型**

在 `types.ts` 的 `Window.electronAPI.logs` 中添加：

```typescript
statsDetailed: (range: '24h' | '30d') => Promise<ProviderStatsGroup[]>
```

移除 `health` 相关类型引用。

- [ ] **步骤 3：构建验证**

```bash
npm run build
```

预期：构建成功，无类型错误。

---

### Task 5: 图表子组件 [✅]

**文件：**
- 创建：`src/renderer/components/StatsCharts.tsx` — 包含 HourlyBarChart 和 DailyAreaChart

**步骤：**

- [ ] **步骤 1：创建 StatsCharts.tsx 组件**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { StatsDataPoint } from '../lib/types'

interface HourlyBarChartProps {
  data: StatsDataPoint[]
  height?: number
}

export function HourlyBarChart({ data, height = 100 }: HourlyBarChartProps) {
  // Fill missing hours with 0
  const filled = Array.from({ length: 24 }, (_, i) => {
    const existing = data.find((d) => d.period === i)
    return { hour: `${i}:00`, requests: existing?.requests ?? 0, tokensIn: existing?.tokensIn ?? 0, tokensOut: existing?.tokensOut ?? 0 }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={filled} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <XAxis dataKey="hour" tick={{ fontSize: 9, fill: '#8b949e' }} interval={3} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} width={24} />
        <Tooltip
          contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, fontSize: 12 }}
          formatter={(value: number) => [value.toLocaleString(), '请求数']}
        />
        <Bar dataKey="requests" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={8} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface DailyAreaChartProps {
  data: StatsDataPoint[]
  height?: number
}

export function DailyAreaChart({ data, height = 100 }: DailyAreaChartProps) {
  const filled = data.map((d) => ({
    date: typeof d.period === 'string' ? d.period.slice(5) : String(d.period),
    requests: d.requests,
    tokensIn: d.tokensIn,
    tokensOut: d.tokensOut,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={filled} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#8b949e' }} interval={4} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: '#8b949e' }} axisLine={false} tickLine={false} width={24} />
        <Tooltip
          contentStyle={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 8, fontSize: 12 }}
          formatter={(value: number) => [value.toLocaleString(), '请求数']}
        />
        <Area type="monotone" dataKey="requests" stroke="#3b82f6" strokeWidth={1.5} fill="url(#areaFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **步骤 2：构建验证**

```bash
npm run build
```

预期：构建成功，无类型错误。

---

### Task 6: Dashboard 页面重写 [✅]

**文件：**
- 修改：`src/renderer/pages/Dashboard.tsx` — 完整重写，替换健康状态区域
- 移除：删除 `Dashboard.tsx` 中对 `HealthStatus` 的引用、`api.health.check` 调用、`api.health.onStatus` 调用

**步骤：**

- [✅] **步骤 1：重写 Dashboard.tsx**

移除旧的 health 相关 import 和 state，新增 stats 相关 import：

```typescript
import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import type { Provider, ProviderStatsGroup, DashboardStats } from '../lib/types'
import { StatsCard } from '../components/StatsCard'
import { StatusBar } from '../components/StatusBar'
import { HourlyBarChart, DailyAreaChart } from '../components/StatsCharts'
import { motion, AnimatePresence } from 'framer-motion'
```

新增 state：
```typescript
const [providerStats, setProviderStats] = useState<ProviderStatsGroup[]>([])
const [expandedProvider, setExpandedProvider] = useState<number | null>(null)
```

替换 `api.health.check()` 和 `api.health.onStatus()` 为 `api.logs.statsDetailed` 调用：
```typescript
useEffect(() => {
  api.providers.list().then(setProviders)
  api.logs.stats('7d').then(setStats)
  api.logs.statsDetailed('30d').then(setProviderStats)
}, [])
```

**渲染替换健康状态区域**（约 50 行被替换为以下结构）：

```tsx
{/* Stats Summary Table */}
<motion.div variants={childVariants} className="mb-6">
  <div className="flex items-center gap-3 mb-4">
    <h2 className="text-base font-semibold" style={{ color: '#f1f5f9' }}>调用统计</h2>
  </div>
  {providerStats.length === 0 ? (
    <div className="cyber-card p-6 text-center">
      <p className="text-sm" style={{ color: '#64748b' }}>暂无统计数据，发送请求后自动生成</p>
    </div>
  ) : (
    <div className="cyber-card overflow-hidden">
      <table className="cyber-table">
        <thead>
          <tr>
            <th>供应商 / 模型</th>
            <th style={{ textAlign: 'right' }}>调用次数</th>
            <th style={{ textAlign: 'right' }}>输入 Tokens</th>
            <th style={{ textAlign: 'right' }}>输出 Tokens</th>
            <th style={{ textAlign: 'right' }}>错误</th>
          </tr>
        </thead>
        <tbody>
          {providerStats.map((group) => [
            <tr key={group.providerId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <td><strong style={{ color: '#e6edf3' }}>{group.providerName}</strong></td>
              <td style={{ textAlign: 'right', color: '#8b949e' }}>
                {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()}
              </td>
              <td style={{ textAlign: 'right', color: '#8b949e' }}>
                {group.models.reduce((s, m) => s + m.totalTokensIn, 0).toLocaleString()}
              </td>
              <td style={{ textAlign: 'right', color: '#8b949e' }}>
                {group.models.reduce((s, m) => s + m.totalTokensOut, 0).toLocaleString()}
              </td>
              <td style={{ textAlign: 'right', color: group.models.reduce((s, m) => s + m.totalErrors, 0) > 0 ? '#ef4444' : '#8b949e' }}>
                {group.models.reduce((s, m) => s + m.totalErrors, 0)}
              </td>
            </tr>,
            ...group.models.map((model) => (
              <tr key={`${group.providerId}-${model.model}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ paddingLeft: 32, color: '#8b949e' }}>└ {model.model}</td>
                <td style={{ textAlign: 'right', color: '#e6edf3' }}>{model.totalRequests.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8b949e' }}>{model.totalTokensIn.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: '#8b949e' }}>{model.totalTokensOut.toLocaleString()}</td>
                <td style={{ textAlign: 'right', color: model.totalErrors > 0 ? '#ef4444' : '#8b949e' }}>{model.totalErrors}</td>
              </tr>
            ))
          ])}
        </tbody>
      </table>
    </div>
  )}
</motion.div>

{/* Provider Accordion */}
<motion.div variants={childVariants}>
  <h2 className="text-base font-semibold mb-4" style={{ color: '#f1f5f9' }}>时间趋势</h2>
  <div className="space-y-2">
    {providerStats.map((group) => (
      <div key={group.providerId} className="cyber-card overflow-hidden">
        <button
          onClick={() => setExpandedProvider(expandedProvider === group.providerId ? null : group.providerId)}
          className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
        >
          <span style={{ color: expandedProvider === group.providerId ? '#60a5fa' : '#8b949e', fontSize: 14 }}>
            {expandedProvider === group.providerId ? '▾' : '▸'}
          </span>
          <span className="w-2 h-2 rounded-full" style={{ background: '#3b82f6' }} />
          <span className="font-medium" style={{ color: '#e6edf3' }}>{group.providerName}</span>
          <span style={{ color: '#8b949e', fontSize: 13 }}>{group.models.length} 个模型</span>
          <span style={{ color: '#8b949e', fontSize: 13 }}>
            {group.models.reduce((s, m) => s + m.totalRequests, 0).toLocaleString()} 次调用
          </span>
          <span style={{ color: '#8b949e', fontSize: 12 }}>
            | {group.models.reduce((s, m) => s + m.totalTokensIn + m.totalTokensOut, 0).toLocaleString()} tokens
          </span>
        </button>

        <AnimatePresence>
          {expandedProvider === group.providerId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
            >
              <div style={{ padding: '16px 20px' }}>
                {group.models.map((model, idx) => (
                  <div
                    key={model.model}
                    style={{
                      borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      paddingTop: idx > 0 ? 16 : 0,
                      marginTop: idx > 0 ? 16 : 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6' }} />
                      <span style={{ fontWeight: 500, color: '#e6edf3' }}>{model.model}</span>
                      <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 10, background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                        {model.totalRequests} 次
                      </span>
                      <span style={{ fontSize: 12, color: '#8b949e' }}>
                        | 输入 {model.totalTokensIn.toLocaleString()} · 输出 {model.totalTokensOut.toLocaleString()} tokens
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="cyber-card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          24 小时 · 柱状图
                        </div>
                        <HourlyBarChart data={model.dataPoints} height={100} />
                      </div>
                      <div className="cyber-card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 10, color: '#484f58', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                          30 天 · 面积图
                        </div>
                        <DailyAreaChart data={model.dataPoints} height={100} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ))}
  </div>
</motion.div>
```

- [✅] **步骤 2：删除不再使用的数据获取**
- [✅] **步骤 3：构建验证**

```bash
npm run build
```

预期：构建成功，无类型错误。
