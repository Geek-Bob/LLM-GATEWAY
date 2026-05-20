# 仪表盘统计重构设计

## 目标

替换仪表盘中无实际价值的"供应商健康状态"区域，改为显示按供应商/模型维度的调用次数和 token 消耗统计，提供 24 小时柱状图和 30 天面积图两个时间维度的可视化。

## 架构变更

### 1. 新增数据表

在 sql.js `config.db` 中新增 `request_stats_provider` 表：

```sql
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
```

区别于现有的 `request_stats` 表（仅按日期+小时全局聚合），新表按 `provider_id + model` 维度拆分，支持按供应商/模型查询。

### 2. 数据写入

修改 `src/main/db/logs.ts` 中的 `updateRequestStats` 函数，在更新全局表的同时，也同步写入 `request_stats_provider` 表：

```sql
INSERT INTO request_stats_provider (stat_date, stat_hour, provider_id, model, total_requests, total_tokens_in, total_tokens_out, total_errors, total_duration_ms)
VALUES (@date, @hour, @providerId, @model, 1, @tokensIn, @tokensOut, @errorCount, @durationMs)
ON CONFLICT(stat_date, stat_hour, provider_id, model) DO UPDATE SET
  total_requests = total_requests + 1,
  total_tokens_in = total_tokens_in + @tokensIn,
  total_tokens_out = total_tokens_out + @tokensOut,
  total_errors = total_errors + @errorCount,
  total_duration_ms = total_duration_ms + @durationMs
```

调用方（proxy `server.ts` 中的 `tryLogEntry`）已提供 `providerId` 和 `model` 参数，无需改动调用链。

### 3. 新增 IPC

在 `src/main/ipc/index.ts` 中新增 `logs:statsDetailed` handler：

```
输入: { range: '24h' | '30d' }
输出: {
  providers: [{
    providerId: number
    providerName: string
    models: [{
      model: string
      totalRequests: number
      totalTokensIn: number
      totalTokensOut: number
      totalErrors: number
      hourly: [{ hour: number, requests: number, tokensIn: number, tokensOut: number }]
      daily: [{ date: string, requests: number, tokensIn: number, tokensOut: number }]
    }]
  }]
}
```

查询逻辑：
- `24h`: `WHERE stat_date = date('now')` 按 hour 排序
- `30d`: `WHERE stat_date >= date('now', '-30 days')` 按 date 聚合

### 4. 删除无用代码

删除以下与健康检查相关的文件和引用：

- `src/main/utils/health.ts` — 整个文件（health check 逻辑）
- IPC `health:check` — 移除 handler
- IPC `health:onStatus` — 移除 handler
- Types `HealthStatus` — 从 `types.ts` 移除
- Preload 中 `health` API — 从 `preload/index.ts` 移除

### 5. Dashboard 前端重写

#### 布局结构

```
┌─ StatusBar（保留）─────────────────────────┐
├─ StatsCards（4 张统计卡片，保留）───────────┤
├─ 调用统计 ─────────────────────────────────┤
│  ┌─ 汇总表格（供应商/模型维度）─────────┐  │
│  │  供应商/模型 | 调用数 | 输入token | ...│  │
│  ├─────────────────────────────────────────┤  │
│  │  OpenAI ├─ gpt-4o ├─ gpt-4o-mini      │  │
│  │  Anthropic ├─ claude-sonnet-4         │  │
│  └─────────────────────────────────────────┘  │
│                                              │
│  ┌─ OpenAI 主账号 ▸ 3模型 1,234次 89K tokens┐ │
│  ├─ Anthropic 账号 ▾ 2模型 567次 45K tokens─┤ │
│  │  ┌─ claude-sonnet-4 ──────────────────┐  │ │
│  │  │ 320次 | 输入128K 输出15K tokens    │  │ │
│  │  │ ┌─24h 柱状图──┐ ┌─30d 面积图──┐   │  │ │
│  │  │ │ ██▄█▇▆█▅... │ │ /‾‾\__/‾\_/  │   │  │ │
│  │  │ └─────────────┘ └────────────┘   │  │ │
│  │  ├─ claude-haiku ───────────────────┤  │ │
│  │  │ ...                              │  │ │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

#### 组件结构

```
Dashboard.tsx（页面入口）
├── StatusBar（保留）
├── StatsCard × 4（保留）
├── StatsSummaryTable（新增 — 汇总表格）
└── ProviderAccordion（新增 — 供应商手风琴）
    └── ModelStatsPanel（新增 — 模型统计面板）
        ├── HourlyBarChart（新增 — 24h 柱状图）
        └── DailyAreaChart（新增 — 30d 面积图）
```

#### 交互行为

- 供应商卡片初始为折叠状态
- 点击供应商行展开/折叠，展开后显示该供应商下各模型的图表
- 展开/折叠使用 framer-motion AnimatePresence 做平滑展开
- 多个供应商可同时展开
- 汇总表格始终可见，不折叠

#### 图表渲染

使用已安装的 recharts 库：

- 24h 柱状图：`<BarChart>`，X 轴 0-23 小时，Y 轴请求数，蓝色柱
- 30d 面积图：`<AreaChart>`，X 轴日期（MM-DD），Y 轴请求数，蓝色渐变填充
- 图表尺寸：每个图表宽度自适应，高度固定 120px
- 图表容器：`cyber-card` 样式卡片

### 6. 类型更新

在 `src/renderer/lib/types.ts` 中：

- **移除** `HealthStatus` 接口
- **新增** `interface ProviderStats` — 供应商级统计
- **新增** `interface ModelStats` — 模型级统计
- **新增** `interface HourlyDataPoint` — 每小时数据点
- **新增** `interface DailyDataPoint` — 每天数据点
- **新增** `interface DetailedStats` — IPC 返回完整结构

## 副作用与注意事项

- 新表仅在请求发生后写入数据，新安装的应用前 24h/30d 图表为空（正常行为）
- `request_stats_provider` 表数据量上限：供应商数 × 模型数 × 24 小时 × 30 天，典型场景 < 5000 行
- 旧 `request_stats` 表保留不变，StatsCard 仍然使用它
- 全局 stats 卡片数据来源不变，仍是 `getLogStats`

## 未涵盖的范围

- 不修改 Chat 相关功能
- 不修改供应商/API Key 管理页面
- 不修改日志页面
- 不修改代理服务器核心逻辑
