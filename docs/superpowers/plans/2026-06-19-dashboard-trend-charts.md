# 仪表板趋势图改造 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 将仪表板趋势区从"单系列 token 柱/面积图"改造为"按供应商/模型分组的 3 维度趋势图（Token/花费/次数）"，支持 24h 与 30d Tab 切换。

**架构：** 数据层 `getDetailedStats` SQL 扩展费用三分时序列（cache_cost/uncached_cost/output_cost），service 透传到 dataPoint；前端新建 TrendLineChart（多系列折线）与 TrendBarChart（柱状）通用组件，TimeTrendAccordion 改造为 Tab 切换 + 手风琴，每个模型渲染 3 张趋势图。

**技术栈：** React 19 / Recharts 3 / TanStack Query 5 / vitest 4 / sql.js(WASM)

**设计文档：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md`

**重要：** 本仓库 IDE/LSP 诊断有严重缓存滞后，会报已修复/已删除文件的虚假错误。唯一可信类型检查 `npx tsc -b --noEmit`（project references，必须 -b）。测试命令 `npx vitest run --config vitest.backend.config.ts <path>`（后端）/ `npx vitest run --config vitest.config.ts <path>`（前端）。命令输出重定向到临时文件后 grep 关键信息（铁律 05）。

---

## 文件结构

### 修改
- `src/main/db/logs-stats.ts` — getDetailedStats SQL +3 费用列
- `src/main/domains/logs/logs.service.ts` — detailedStats dataPoint 映射 +3
- `src/main/domains/logs/logs.types.ts` — DetailedStatsDataPoint +3
- `src/renderer/lib/types.ts` — StatsDataPoint +3
- `src/renderer/features/dashboard/components/TimeTrendAccordion.tsx` — 改造为 Tab + 3图

### 新建
- `src/renderer/features/dashboard/components/TrendLineChart.tsx` + 测试
- `src/renderer/features/dashboard/components/TrendBarChart.tsx` + 测试

### 删除
- `src/renderer/features/dashboard/components/StatsCharts.tsx`（HourlyBarChart/DailyAreaChart 仅 TimeTrendAccordion 使用，被 3 图替代）

---

## Task 1: 数据层 getDetailedStats 费用三分扩展

**目标：** getDetailedStats SQL 增加 cache_cost/uncached_cost/output_cost 三列时序费用拆分。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#2-数据层扩展`

**需求描述：**
`src/main/db/logs-stats.ts` 的 getDetailedStats：SQL SELECT 在现有 `cost` 列基础上，增加 3 列费用拆分——`cache_cost`（SUM(total_cache_tokens)*price_in_cached/DIV）、`uncached_cost`（MAX(0, SUM(total_tokens_in)-SUM(total_cache_tokens))*price_in_uncached/DIV）、`output_cost`（SUM(total_tokens_out)*price_out/DIV）。均用 COALESCE 缺单价归 0，LEFT JOIN provider_pricing 已有。`cost` 列保留（= 三者之和，兼容）。COST_DIVISOR 常量已存在。sql.js 同步 API。

**产出：**
- 文件：`src/main/db/logs-stats.ts`
- 模块：`createLogStatsRepository.getDetailedStats`（扩展返回字段）

**消费：**
- 无（外部依赖：provider_pricing 表、total_cache_tokens 列已由前序功能建好）

**文件：**
- 修改：`src/main/db/logs-stats.ts`
- 测试：`src/main/db/__tests__/logs-stats.test.ts`（getDetailedStats 测试块）

**验收标准：**
- [x] getDetailedStats 返回每行含 cache_cost/uncached_cost/output_cost
- [x] 配置单价的模型三费用列正确（cache_cost = cacheTokens×priceInCached/1e6 等）
- [x] 缺单价模型三费用列为 0
- [x] cost 列 = cache_cost + uncached_cost + output_cost
- [x] 测试用内存数据库 + 插入 pricing，不 mock
- [x] 所有测试通过

**步骤：**
1. 编写测试：getDetailedStats 返回含三费用列、配置单价正确、缺单价归 0、cost=三者之和
2. 运行测试验证失败
3. 实现 SQL +3 列
4. 运行测试验证通过
5. 提交

---

## Task 2: service 层 detailedStats 透传费用三分

**目标：** logs.service detailedStats 把三费用列映射到 dataPoint，model 维度累加。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#2-数据层扩展`

**需求描述：**
`src/main/domains/logs/logs.service.ts` 的 detailedStats：row 类型加 cache_cost/uncached_cost/output_cost；model 累加 cacheCost/uncachedCost/outputCost（与现有 cost 累加并列）；dataPoint 透传 cacheCost/uncachedCost/outputCost。`src/main/domains/logs/logs.types.ts` 的 DetailedStatsDataPoint 加 cacheCost/uncachedCost/outputCost。snake→camelCase 映射在 service 层完成。

**产出：**
- 文件：`src/main/domains/logs/logs.service.ts`、`src/main/domains/logs/logs.types.ts`
- 类型：`DetailedStatsDataPoint`（+3 字段）

**消费：**
- Task 1：getDetailedStats 返回含 cache_cost/uncached_cost/output_cost

**文件：**
- 修改：`src/main/domains/logs/logs.service.ts`、`src/main/domains/logs/logs.types.ts`
- 测试：`src/main/domains/logs/__tests__/logs.service.test.ts`

**验收标准：**
- [x] DetailedStatsDataPoint 含 cacheCost/uncachedCost/outputCost
- [x] detailedStats 每个时间点 dataPoint 含三费用字段
- [x] model 维度累计 cacheCost/uncachedCost/outputCost 正确
- [x] service 测试用内存数据库，不 mock statsRepo
- [x] 所有测试通过

**步骤：**
1. 编写测试：detailedStats dataPoint 含三费用字段、model 累加正确
2. 运行测试验证失败
3. 实现 row 类型 + 累加 + 透传 + types 扩展
4. 运行测试验证通过
5. 提交

---

## Task 3: 前端类型层 StatsDataPoint 扩展

**目标：** renderer StatsDataPoint 加三费用字段，对齐后端契约。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#41-共享类型`

**需求描述：**
`src/renderer/lib/types.ts` 的 `StatsDataPoint` interface 加 `cacheCost: number`、`uncachedCost: number`、`outputCost: number`（必填，对齐后端 detailedStats 保证返回）。现有 ProviderStatsModel 已有 cost/cacheTokens，本次只动 StatsDataPoint。

**产出：**
- 文件：`src/renderer/lib/types.ts`
- 类型：`StatsDataPoint`（+3 字段）

**消费：**
- Task 2：`DetailedStatsDataPoint`（后端契约，前端对齐）

**文件：**
- 修改：`src/renderer/lib/types.ts`

**验收标准：**
- [x] StatsDataPoint 含 cacheCost/uncachedCost/outputCost（number）
- [x] `npx tsc -b --noEmit` 通过

**步骤：**
1. 扩展 StatsDataPoint +3 字段
2. 运行 `npx tsc -b --noEmit` 验证
3. 提交

---

## Task 4: TrendLineChart 组件

**目标：** 新建 Recharts 多系列折线图通用组件。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#3-前端布局与组件`

**需求描述：**
`src/renderer/features/dashboard/components/TrendLineChart.tsx`：props `{ data: Array<Record<string, number|string>>, xKey: 'period', lines: Array<{key, name, color}>, height?: number, yFormatter?: (v:number)=>string }`。用 Recharts ResponsiveContainer + LineChart + Line（每个 line 一条）+ XAxis + YAxis + Tooltip + Legend。颜色用主题色变量（非硬编码，参考现有 StatsCharts 用 recharts 的 fill/stroke）。空数据显示空轴或提示。复用现有 StatsCharts.tsx 的 recharts import 风格。

**产出：**
- 文件：`src/renderer/features/dashboard/components/TrendLineChart.tsx`
- 模块：`TrendLineChart`

**消费：**
- Task 3：`StatsDataPoint`（数据形状参考，但组件用 Record 通用）

**文件：**
- 创建：`src/renderer/features/dashboard/components/TrendLineChart.tsx`
- 测试：`src/renderer/features/dashboard/components/__tests__/TrendLineChart.test.tsx`

**验收标准：**
- [x] 渲染传入的每条 line（按 lines 数组）
- [x] XAxis 用 xKey、YAxis 用数值
- [x] 空数据显示空态/提示
- [x] yFormatter 应用到 tooltip/axis
- [x] 复用 recharts，无原生 SVG 手写
- [x] 组件测试通过

**步骤：**
1. 编写测试：多系列线渲染、空数据、yFormatter
2. 运行测试验证失败
3. 实现组件
4. 运行测试验证通过
5. 提交

---

## Task 5: TrendBarChart 组件

**目标：** 新建柱状图组件（次数趋势用）。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#3-前端布局与组件`

**需求描述：**
`src/renderer/features/dashboard/components/TrendBarChart.tsx`：props `{ data: Array<{period: number|string, requests: number}>, height?: number }`。Recharts BarChart + Bar(requests) + XAxis(period) + YAxis + Tooltip。空数据显示空态。复用现有 StatsCharts 的 BarChart 风格。

**产出：**
- 文件：`src/renderer/features/dashboard/components/TrendBarChart.tsx`
- 模块：`TrendBarChart`

**消费：**
- Task 3：`StatsDataPoint`（数据形状参考）

**文件：**
- 创建：`src/renderer/features/dashboard/components/TrendBarChart.tsx`
- 测试：`src/renderer/features/dashboard/components/__tests__/TrendBarChart.test.tsx`

**验收标准：**
- [x] 渲染 requests 柱状，XAxis=period
- [x] 空数据显示空态
- [x] 复用 recharts
- [x] 组件测试通过

**步骤：**
1. 编写测试：柱状渲染、空数据
2. 运行测试验证失败
3. 实现组件
4. 运行测试验证通过
5. 提交

---

## Task 6: TimeTrendAccordion 改造（Tab + 3 趋势图）

**目标：** TimeTrendAccordion 改造为 Tab 切换 24h/30d + 手风琴 + 每模型 3 张趋势图，移除旧双图。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#3-前端布局与组件`

**需求描述：**
`src/renderer/features/dashboard/components/TimeTrendAccordion.tsx` 改造：
- 顶部加 `[24h] [30d]` Tab 切换（`useState<'24h'|'30d'>('24h')`），两个 query（hourlyStats/dailyStats）均预加载，Tab 仅切换显示数据源。
- 手风琴按供应商→模型展开（`useState<number|null>` 记忆 providerId，Tab 切换保留展开态）。
- 每个模型下渲染 3 张图：
  1. Token 趋势（TrendLineChart）：3 线 总输入(tokensIn)/缓存(cacheTokens)/非缓存(tokensIn-cacheTokens)
  2. 花费趋势（TrendLineChart）：3 线 缓存(cacheCost)/非缓存(uncachedCost)/输出(outputCost)
  3. 次数趋势（TrendBarChart）：requests
- 数据映射：每个模型 dataPoints → 三图所需数组。非缓存 token 前端实时算。
- period 格式：24h 显示小时、30d 显示日期（MM-DD）。
- 趋势线颜色映射（设计 §4.4，用主题色变量非硬编码）：Token 趋势——总输入=灰、缓存=蓝、非缓存=橙；花费趋势——缓存=蓝、非缓存=橙、输出=绿。
- 移除 import HourlyBarChart/DailyAreaChart。
- 删除 `src/renderer/features/dashboard/components/StatsCharts.tsx`（仅本组件用，确认无其他引用）。
- 复用 Card/Badge/Button/EmptyState 等共享组件。

**产出：**
- 文件：`src/renderer/features/dashboard/components/TimeTrendAccordion.tsx`
- 删除：`src/renderer/features/dashboard/components/StatsCharts.tsx`

**消费：**
- Task 3：`StatsDataPoint`（含三费用字段）
- Task 4：`TrendLineChart`
- Task 5：`TrendBarChart`

**文件：**
- 修改：`src/renderer/features/dashboard/components/TimeTrendAccordion.tsx`
- 删除：`src/renderer/features/dashboard/components/StatsCharts.tsx`
- 测试：`src/renderer/features/dashboard/components/__tests__/TimeTrendAccordion.test.tsx`

**验收标准：**
- [x] 顶部渲染 24h/30d Tab，点击切换数据源
- [x] 手风琴按供应商展开，展开后每个模型显示 3 张趋势图
- [x] Token 趋势 3 线（总输入/缓存/非缓存）
- [x] 花费趋势 3 线（缓存/非缓存/输出）
- [x] 次数趋势柱状
- [x] Tab 切换保留手风琴展开态
- [x] 空数据显示提示
- [x] StatsCharts.tsx 已删除，无残留引用
- [x] 复用共享组件，无原生 SVG
- [x] 组件测试通过 + `npx tsc -b --noEmit` 通过

**步骤：**
1. 编写测试：Tab 切换、手风琴展开 3 图渲染、空数据
2. 运行测试验证失败
3. 实现改造（Tab + 手风琴 + 3 图 + 数据映射）
4. 删除 StatsCharts.tsx，移除其 import
5. 运行测试 + tsc -b 验证通过
6. 提交

---

## Task 7: 全量验证与文档同步

**目标：** 全量测试 + tsc + lint 通过，更新 ARCHITECTURE.md。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-dashboard-trend-charts-design.md#7-影响范围`

**需求描述：**
运行全量测试、类型检查、lint，修复回归。更新 `docs/ARCHITECTURE.md`：5.6 渲染进程 Dashboard 趋势区描述更新为"Tab 切换 24h/30d + 按供应商/模型手风琴 + 每模型 3 趋势图（Token/花费/次数）"；如有目录结构变化（新增 TrendLineChart/TrendBarChart、删除 StatsCharts）同步。注意 ARCHITECTURE.md 可能已有前序功能的未提交改动，只追加本次相关内容。

**产出：**
- 文件：`docs/ARCHITECTURE.md`

**消费：**
- 全部前置任务

**文件：**
- 修改：`docs/ARCHITECTURE.md`

**验收标准：**
- [x] `npx tsc -b --noEmit` 通过（零错误）
- [x] 后端测试全通过
- [x] 前端测试全通过
- [x] `npm run lint` 通过（0 error）
- [x] ARCHITECTURE.md 趋势区描述更新
- [x] 提交

**步骤：**
1. 运行全量测试（输出重定向 /tmp，grep 关键结果）
2. 运行 tsc -b + lint
3. 修复回归
4. 更新 ARCHITECTURE.md
5. 提交

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 1: getDetailedStats 费用三分 | 无 | — |
| L1 | Task 2: service detailedStats 透传 | Task 1 | ✅ |
| L1 | Task 3: 前端 StatsDataPoint 扩展 | Task 2 | ✅ |
| L2 | Task 4: TrendLineChart | Task 3 | ✅ |
| L2 | Task 5: TrendBarChart | Task 3 | ✅ |
| L3 | Task 6: TimeTrendAccordion 改造 | Task 3,4,5 | — |
| L4 | Task 7: 全量验证与文档同步 | 全部 | — |

**说明：**
- L0：Task 1 数据层基础，无依赖。
- L1：Task 2 消费 Task 1；Task 3 消费 Task 2（前后端契约对齐，需后端字段确定后前端类型才能对齐）。Task 2 改后端、Task 3 改前端类型，文件不重叠，但 Task 3 依赖 Task 2 的字段定义 → 串行。实际为链式依赖，分层表标注 L1 同层但 Task 3 应在 Task 2 后执行。
- L2：Task 4/5 两个新组件并行，改不同文件。
- L3：TimeTrendAccordion 依赖三组件 + 类型。
- L4：全量验证收尾。

**并行约束提醒：**
- Task 2 与 Task 3 是链式（Task 3 依赖 Task 2 字段），虽分层表同列 L1 但执行时 Task 2 先于 Task 3。若严格并行可能 Task 3 类型对齐时 Task 2 尚未定字段——建议 Task 2 完成后再派 Task 3。
- Task 4/5 完全独立（不同新文件），可安全并行。
