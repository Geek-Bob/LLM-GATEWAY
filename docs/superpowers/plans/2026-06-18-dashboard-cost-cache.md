# 仪表板费用配置与缓存 Token 统计 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 为仪表板新增按供应商+模型的费用单价配置（缓存命中/未命中/输出）与费用计算，采集缓存 token，并将供应商标记卡片改为近 7 天花费，新增 24h/30d 的 token（总/缓存/非缓存/输出）、花费（总/缓存/非缓存/输出）、次数汇总。

**架构：** 缓存 token 在代理日志层从 SSE usage 提取，写入 NDJSON 与两张预聚合统计表（新增 `total_cache_tokens` 列）。单价存独立 `provider_pricing` 表，走 pricing domain + Repository。统计查询在后端 stats service 内 SQL JOIN pricing 实时算费用，返回 token+费用汇总。前端供应商表单内配置单价，仪表板新增 RangeSummaryCard 展示 24h/30d 汇总。

**技术栈：** Electron 42 / Hono 4 / sql.js(WASM) / Zod 4 / React 19 / TanStack Query 5 / vitest 4

**设计文档：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md`

**命名说明（现有约定）：** 单实体 CRUD 域 IPC 通道用单数（`provider:*`），故新增单数 `pricing:*`；聚合查询 `logs:rangeSummary` 归 logs 域。

---

## 文件结构

### 新增文件
- `src/main/db/provider-pricing.ts` — pricing Repository 工厂
- `src/main/db/__tests__/provider-pricing.test.ts` — Repository 测试
- `src/main/domains/pricing/pricing.types.ts` — PricingRow / PricingInput / PricingResponse
- `src/main/domains/pricing/pricing.schema.ts` — Zod 校验
- `src/main/domains/pricing/pricing.service.ts` — createPricingService
- `src/main/domains/pricing/__tests__/pricing.service.test.ts` — service 测试
- `src/main/domains/pricing/__tests__/pricing.schema.test.ts` — schema 测试
- `src/main/ipc/pricing.ts` — registerPricingHandlers
- `src/renderer/features/dashboard/components/RangeSummaryCard.tsx` — 24h/30d 汇总卡
- `src/renderer/features/dashboard/components/__tests__/RangeSummaryCard.test.tsx` — 组件测试
- `scripts/migrate-pricing-cache.mjs` — 旧库 ALTER 加列 + 建 pricing 表（幂等）

### 修改文件
- `src/shared/types.ts` — 新增 PricingEntity / RangeSummary
- `src/main/db/schema.ts` — 新增 provider_pricing 表 + 两张统计表声明 total_cache_tokens 列
- `src/main/db/logs-stats.ts` — 写入/查询加 cache_tokens + JOIN pricing 算费用 + summaryDetailed
- `src/main/db/logs-writer.ts` — NDJSON 加 cache_tokens + LogEntryProps 加 cacheTokens
- `src/main/proxy/logger.ts` — extractUsageFromSSE 加 cacheTokens 返回 + LogEntryProps 加 cacheTokens
- `src/main/domains/stats/stats.types.ts` — StatsResponse 加 cacheTokens/totalCost + RangeSummary 复用
- `src/main/domains/stats/stats.service.ts` — summary 扩展 + summaryDetailed
- `src/main/domains/logs/logs.types.ts` — DetailedStatsModel/DataPoint 加 cost/cacheTokens
- `src/main/domains/logs/logs.service.ts` — detailedStats JOIN pricing 带 cost
- `src/main/ipc/logs.ts` — 注册 logs:rangeSummary handler
- `src/main/ipc/index.ts` — 注册 registerPricingHandlers
- `src/preload/types.ts` — pricing / rangeSummary API 类型
- `src/preload/index.ts` — 暴露 pricing + logs.rangeSummary
- `src/renderer/lib/types.ts` — PricingEntity / RangeSummary 派生 + DashboardStats 扩展
- `src/renderer/lib/queries/stats.ts` — useRangeSummary
- `src/renderer/lib/queries/providers.ts` — pricing queries（usePricingByProvider/useUpsertPricing/useDeletePricing）
- `src/renderer/pages/Dashboard.tsx` — 组装 RangeSummaryCard
- `src/renderer/features/dashboard/components/DashboardStats.tsx` — 第 3 卡改花费
- `src/renderer/features/provider/components/ProviderFormDialog.tsx` — 单价配置区
- `docs/ARCHITECTURE.md` — 同步数据流与模块职责

---

## Task 0: 共享类型与契约定义

**目标：** 定义跨进程共享的 PricingEntity、RangeSummary 类型，扩展 DashboardStats。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#44-共享类型sharedtypests-新增`

**需求描述：**
在 `src/shared/types.ts` 新增两个跨进程类型。`PricingEntity` 为单价记录（providerId/model/priceInCached/priceInUncached/priceOut）。`RangeSummary` 为 24h/30d 全局汇总，token 维度（totalTokens/inputTokens/cacheTokens/uncachedTokens/outputTokens）与费用维度（totalCost/cacheCost/uncachedCost/outputCost）对称，含 totalRequests。口径：totalTokens = inputTokens + outputTokens；uncachedTokens = MAX(0, inputTokens - cacheTokens)。注意：`DashboardStats` 不在 shared/types.ts（实际定义在 `src/preload/types.ts` 与 `src/renderer/lib/types.ts` 两处），其扩展由 Task 8 处理，本任务不涉及。这是契约层，其他任务都消费这些类型，必须最先完成。

**产出：**
- 文件：`src/shared/types.ts`
- 类型：`PricingEntity`、`RangeSummary`

**消费：**
- 无（契约层，不消费其他任务产出）

**文件：**
- 修改：`src/shared/types.ts`

**验收标准：**
- [x] `PricingEntity` 含 providerId: number / model: string / priceInCached: number / priceInUncached: number / priceOut: number
- [x] `RangeSummary` 含 totalTokens/inputTokens/cacheTokens/uncachedTokens/outputTokens/totalCost/cacheCost/uncachedCost/outputCost/totalRequests 全部 number
- [x] `npx tsc --noEmit` 通过

**步骤：**
1. 编写类型定义
2. 运行 `npx tsc --noEmit` 验证编译
3. 提交

---

## Task 1: 数据库 schema 与迁移脚本

**目标：** 在 schema.ts 声明 provider_pricing 表与两张统计表的 total_cache_tokens 列，编写幂等迁移脚本。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#31-表结构变更`

**需求描述：**
`src/main/db/schema.ts` 的 `createTables`：新增 `provider_pricing` 表（PK (provider_id, model)，FK→providers ON DELETE CASCADE，三列 REAL 单价 + created_at/updated_at），用 `CREATE TABLE IF NOT EXISTS`。给 `request_stats` 与 `request_stats_provider` 的建表 SQL 各加 `total_cache_tokens INTEGER NOT NULL DEFAULT 0` 列（新库直接含此列）。新建 `scripts/migrate-pricing-cache.mjs`：对两张已存在表执行 `ALTER TABLE ... ADD COLUMN total_cache_tokens INTEGER NOT NULL DEFAULT 0`，并 `CREATE TABLE IF NOT EXISTS provider_pricing`；幂等——用 `pragma_table_info` 查列是否存在再 ALTER，风格对齐现有 `scripts/migrate-db.mjs`。迁移失败仅 logger.warn 不阻断。

**产出：**
- 文件：`src/main/db/schema.ts`（修改）、`scripts/migrate-pricing-cache.mjs`（创建）
- 模块：`createTables`（扩展）

**消费：**
- 无（schema 是数据层基础，独立）

**文件：**
- 修改：`src/main/db/schema.ts`
- 创建：`scripts/migrate-pricing-cache.mjs`

**验收标准：**
- [ ] `createTables` 执行后 provider_pricing 表存在且含三单价列 + 时间戳列 + PK + FK
- [ ] 新库的 request_stats / request_stats_provider 含 total_cache_tokens 列
- [ ] 迁移脚本对已存在表幂等执行（重复运行不报错）
- [ ] 迁移脚本先查 `pragma_table_info` 再 ALTER
- [ ] `npm run test:backend` 现有 db 测试通过

**步骤：**
1. 修改 schema.ts 建表 SQL
2. 编写 migrate-pricing-cache.mjs（参考 migrate-db.mjs 风格）
3. 验证迁移脚本幂等性：对已存在表运行两次，确认第二次不报错（先查 pragma_table_info 再 ALTER）
4. 运行后端测试验证 schema 不破坏现有
5. 提交

---

## Task 2: pricing Repository

**目标：** 实现 provider_pricing 表的 Repository 工厂。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#42-新增-domain-pricing`

**需求描述：**
`src/main/db/provider-pricing.ts` 导出 `createPricingRepository(db)`，返回纯对象方法：`list()`（全量，按 provider_id, model 排序）、`findByProvider(providerId)`、`upsert(input)`（INSERT ... ON CONFLICT(provider_id, model) DO UPDATE，更新三单价列与 updated_at）、`remove(providerId, model)`、`removeByProvider(providerId)`（删供应商下全部，供级联辅助）。返回 snake_case 的 `PricingRow`，类型 `export type PricingRepository = ReturnType<typeof createPricingRepository>`。遵循 Repository 模式，禁止内部 getDb()。

**产出：**
- 文件：`src/main/db/provider-pricing.ts`
- 模块：`createPricingRepository`、`PricingRepository`、`PricingRow`

**消费：**
- Task 1：`provider_pricing` 表（schema 已定义）

**文件：**
- 创建：`src/main/db/provider-pricing.ts`
- 测试：`src/main/db/__tests__/provider-pricing.test.ts`

**验收标准：**
- [x] `upsert` 对同一 (provider_id, model) 重复调用更新而非插入（幂等）
- [x] `findByProvider` 返回指定供应商的全部单价，按 model 排序
- [x] `remove` 删单条；(providerId, model) 不存在时不报错
- [x] `removeByProvider` 删除该供应商下全部单价行
- [x] 测试用内存数据库，不 mock 数据库操作
- [x] 所有测试通过：`npx vitest run src/main/db/__tests__/provider-pricing.test.ts`

**步骤：**
1. 编写 Repository 测试（Red）
2. 运行测试验证失败
3. 实现 createPricingRepository（Green）
4. 运行测试验证通过
5. 提交

---

## Task 3: pricing domain（schema + service）

**目标：** 实现 pricing domain 的 Zod 校验与业务服务。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#42-新增-domain-pricing`

**需求描述：**
三个文件。`pricing.types.ts`：`PricingRow`（snake_case db 行）、`PricingInput`（{providerId, model, priceInCached, priceInUncached, priceOut}，对外输入契约）、`PricingResponse`（camelCase，对齐 PricingEntity）。`pricing.schema.ts`：`createPricingSchema`（z.object，providerId z.number().int()、model z.string().min(1)、三单价 z.number().nonnegative()）。`pricing.service.ts`：`createPricingService(db)` 返回 `list()`/`getByProvider(providerId)`/`upsert(input)`/`remove(providerId, model)`，内部创建 Repository 并委派，负责 snake↔camelCase 转换。业务错误格式 `Failed to {action} pricing: {reason}`。

**产出：**
- 文件：`src/main/domains/pricing/pricing.types.ts`、`pricing.schema.ts`、`pricing.service.ts`
- 模块：`createPricingService`、`PricingService`
- 类型：`PricingInput`、`PricingResponse`

**消费：**
- Task 0：`PricingEntity`
- Task 2：`createPricingRepository`、`PricingRepository`

**文件：**
- 创建：`src/main/domains/pricing/pricing.types.ts`、`pricing.schema.ts`、`pricing.service.ts`
- 测试：`src/main/domains/pricing/__tests__/pricing.schema.test.ts`、`pricing.service.test.ts`

**验收标准：**
- [x] schema 拒绝非负数单价、空 model、非整数 providerId
- [x] service.upsert 委派 Repository.upsert 并完成字段转换
- [x] service.getByProvider 返回 camelCase 数组
- [x] service 测试用内存数据库，不 mock Repository（直接走真实 db）
- [x] 所有测试通过：`npx vitest run src/main/domains/pricing/`

**步骤：**
1. 编写 schema 测试（合法接受 + 非法拒绝 + 边界）
2. 运行验证失败
3. 实现 schema
4. 编写 service 测试（CRUD 委派 + 字段转换）
5. 运行验证失败
6. 实现 service
7. 运行验证通过
8. 提交

---

## Task 4: 缓存 token 采集（代理日志层）

**目标：** 从 SSE usage 提取缓存 token，贯穿 LogEntryProps 到 NDJSON 与统计写入入口。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#21-缓存-token-采集口径二分法`

**需求描述：**
`src/main/proxy/logger.ts`：`extractUsageFromSSE` 返回值从 `{tokensIn, tokensOut}` 扩展为 `{tokensIn, tokensOut, cacheTokens}`。OpenAI 从 `usage.prompt_tokens_details.cached_tokens` 提取；Anthropic 从 message_start 的 `usage.cache_read_input_tokens` 提取（cache_creation 不计）。无缓存字段时 cacheTokens=0。`LogEntryProps`（proxy/logger.ts 内）加 `cacheTokens?: number`。`tryLogEntry` 把 cacheTokens 透传给 createLogEntry / updateRequestStats / updateProviderStats。`src/main/db/logs-writer.ts`：`LogEntryProps` 加 `cacheTokens?`，NDJSON 行新增 `cache_tokens: entry.cacheTokens` 字段。`src/main/proxy/server.ts` 的 `ProxyServices.updateRequestStats`/`updateProviderStats` 签名加 `cacheTokens?`（仅为类型对齐，实际实现由 Task 5 完成）。解析失败 cacheTokens=0，不中断主流程。

**产出：**
- 文件：`src/main/proxy/logger.ts`、`src/main/db/logs-writer.ts`、`src/main/proxy/server.ts`（签名）
- 模块：`extractUsageFromSSE`（扩展返回）

**消费：**
- 无（独立采集层，不消费 Task 0 共享类型；修改 proxy/logger.ts、logs-writer.ts、server.ts）

**文件：**
- 修改：`src/main/proxy/logger.ts`、`src/main/db/logs-writer.ts`、`src/main/proxy/server.ts`
- 测试：扩展 `src/main/proxy/__tests__/` 下 logger 相关测试

**验收标准：**
- [x] OpenAI SSE 含 `prompt_tokens_details.cached_tokens` 时 cacheTokens 正确提取
- [x] Anthropic SSE message_start 含 `cache_read_input_tokens` 时 cacheTokens 正确提取
- [x] Anthropic `cache_creation_input_tokens` 不计入 cacheTokens
- [x] 无缓存字段的 SSE，cacheTokens = 0
- [x] NDJSON 写入行含 `cache_tokens` 字段
- [x] `npx tsc --noEmit` 通过
- [x] 所有相关测试通过

**步骤：**
1. 编写 extractUsageFromSSE 缓存提取测试（OpenAI/Anthropic/无缓存三场景）
2. 运行验证失败
3. 实现缓存提取
4. 编写 NDJSON cache_tokens 字段测试
5. 实现字段写入
6. 运行验证通过
7. 提交

---

## Task 5: 统计表写入与查询扩展（含费用 JOIN）

**目标：** logs-stats.ts 写入 cache_tokens，getStats/getDetailedStats JOIN pricing 算费用，新增 summaryDetailed 汇总查询。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#22-费用计算公式`

**需求描述：**
`src/main/db/logs-stats.ts`：`updateRequestStats` / `updateProviderStats` 入参加 `cacheTokens?`，INSERT/ON CONFLICT 语句各加 `total_cache_tokens` 累加列。`getStats(range)` SELECT 加 `SUM(total_cache_tokens)`，并新增**全局费用汇总查询**：getStats 仍只返回 token 概览（无 model 维度无法逐模型算费），故费用需单独算。具体方案：新增内部方法 `getCostSummary(range)` 查 `request_stats_provider`，按 provider_id+model LEFT JOIN provider_pricing 逐模型算费用后 SUM，返回 `{totalCost, cacheCost, uncachedCost, outputCost}`。`getStats` 调用它并把 totalCost 一并返回（7d 概览卡用）。新增 `getRangeSummary(range)`：查 `request_stats_provider`，按 provider_id+model 分组聚合 token + JOIN pricing 算每模型费用，再 SUM 出完整 RangeSummary（含 token 三分 + 费用三分 + 次数）。`getDetailedStats` SELECT 加 `SUM(total_cache_tokens)`，并 LEFT JOIN provider_pricing 算每模型 cost。费用公式：cacheCost = cacheTokens×priceInCached/1e6；uncachedCost = MAX(0, tokensIn-cacheTokens)×priceInUncached/1e6；outputCost = tokensOut×priceOut/1e6。缺单价（JOIN 不到）费用按 0（COALESCE）。注意：sql.js 同步 API，JOIN 在同一条 SELECT 内完成。getStats 的 range 支持 '24h'/'7d'/'30d'，getCostSummary 同理。

**产出：**
- 文件：`src/main/db/logs-stats.ts`
- 模块：`createLogStatsRepository`（扩展：getRangeSummary 方法、getCostSummary 内部方法）

**消费：**
- Task 1：`total_cache_tokens` 列、`provider_pricing` 表
- Task 0：`RangeSummary`（返回结构对齐）

**文件：**
- 修改：`src/main/db/logs-stats.ts`
- 测试：扩展 `src/main/db/__tests__/logs-stats.test.ts` 或 `logs.test.ts`

**验收标准：**
- [x] updateRequestStats/updateProviderStats 写入后 total_cache_tokens 正确累加
- [x] getStats 返回含 cacheTokens 与 totalCost（7d 也算费用）
- [x] getRangeSummary('24h')/('30d') 返回 totalTokens/inputTokens/cacheTokens/uncachedTokens/outputTokens/totalCost/cacheCost/uncachedCost/outputCost/totalRequests
- [x] 配置单价的模型费用正确（cacheTokens×priceInCached + ...）
- [x] 缺单价的模型费用为 0，但 token 正常统计
- [x] cacheTokens > tokensIn 时 uncachedTokens clamp 到 0
- [x] getDetailedStats 每行含 cacheTokens 与 cost
- [x] 测试用内存数据库 + 插入 pricing 数据，不 mock
- [x] 所有测试通过

**步骤：**
1. 编写 updateRequestStats/updateProviderStats 写入 cache_tokens 测试
2. 实现写入
3. 编写 getRangeSummary 测试（含单价/缺单价/clamp 三场景）
4. 实现 getRangeSummary JOIN 查询
5. 编写 getDetailedStats cost 测试
6. 实现详细统计 JOIN
7. 运行验证通过
8. 提交

---

## Task 6: stats/logs service 扩展

**目标：** 业务层 service 透传新字段，summary 带 cacheTokens+totalCost，新增 summaryDetailed，detailedStats 带 cost。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#43-stats-domain-扩展`

**需求描述：**
`src/main/domains/stats/stats.types.ts`：`StatsResponse` 加 `cacheTokens`、`totalCost`。`src/main/domains/stats/stats.service.ts`：`summary` 透传 cacheTokens **与 totalCost**（statsRepo.getStats 已返回 totalCost）；新增 `summaryDetailed(range: '24h'|'30d'): Promise<RangeSummary>` 委派 `statsRepo.getRangeSummary(range)` 并完成字段映射（snake→camelCase）。`src/main/domains/logs/logs.types.ts`：`DetailedStatsModel` 加 `cacheTokens`、`cost`；`DetailedStatsDataPoint` 加 `cacheTokens`、`cost`。`src/main/domains/logs/logs.service.ts`：`detailedStats` 透传 cacheTokens 与 cost（statsRepo 已 JOIN 算好），完成 snake→camelCase 映射。

**产出：**
- 文件：`stats.types.ts`、`stats.service.ts`、`logs.types.ts`、`logs.service.ts`
- 模块：`StatsService.summaryDetailed`（新增）

**消费：**
- Task 0：`RangeSummary`
- Task 5：`statsRepo.getRangeSummary`、`getDetailedStats` 含 cost/cacheTokens

**文件：**
- 修改：`src/main/domains/stats/stats.types.ts`、`stats.service.ts`、`src/main/domains/logs/logs.types.ts`、`logs.service.ts`
- 测试：扩展 `stats.service.test.ts`、`logs.service.test.ts`

**验收标准：**
- [x] summary 返回含 cacheTokens 与 totalCost
- [x] summaryDetailed('24h')/('30d') 返回完整 RangeSummary 字段
- [x] detailedStats 每模型含 cacheTokens 与 cost
- [x] detailedStats 每时间点含 cacheTokens 与 cost
- [x] service 测试用内存数据库，不 mock statsRepo
- [x] 所有测试通过

**步骤：**
1. 编写 summaryDetailed 测试
2. 实现透传 + 映射
3. 编写 detailedStats cost 透传测试
4. 实现字段映射
5. 运行验证通过
6. 提交

---

## Task 7: IPC handler 注册（pricing + logs:rangeSummary）

**目标：** 注册 pricing CRUD 与 logs:rangeSummary IPC handler，接入编排层。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#45-ipc-通道契约`

**需求描述：**
`src/main/ipc/pricing.ts`：`registerPricingHandlers(db)` 注册 `pricing:list`/`pricing:getByProvider`/`pricing:upsert`/`pricing:delete`，全部经 `wrapIpcHandler` 包装，data: unknown + Zod `.parse()`（upsert 用 createPricingSchema）。`src/main/ipc/logs.ts`：新增 `logs:rangeSummary` handler，调用 `statsService.summaryDetailed(range)`（不经过 logsService），range 用 `detailedStatsRangeSchema` 复用校验。`src/main/ipc/index.ts`：import 并调用 `registerPricingHandlers(db)`。

**产出：**
- 文件：`src/main/ipc/pricing.ts`、`src/main/ipc/logs.ts`、`src/main/ipc/index.ts`
- 模块：`registerPricingHandlers`

**消费：**
- Task 3：`createPricingService`、`createPricingSchema`
- Task 6：`StatsService.summaryDetailed`

**文件：**
- 创建：`src/main/ipc/pricing.ts`
- 修改：`src/main/ipc/logs.ts`、`src/main/ipc/index.ts`
- 测试：扩展 `src/main/ipc/__tests__/integration.test.ts`

**验收标准：**
- [x] pricing:list / getByProvider / upsert / delete 四通道可用
- [x] pricing:upsert 对非法输入（负单价）返回 Invalid input 错误
- [x] logs:rangeSummary('24h')/('30d') 返回 RangeSummary
- [x] 所有 handler 经 wrapIpcHandler 包装（handler 内无手写 try/catch）
- [x] setupIpcHandlers 调用 registerPricingHandlers
- [x] 集成测试通过

**步骤：**
1. 编写 pricing IPC 集成测试
2. 实现 registerPricingHandlers
3. 编写 logs:rangeSummary 集成测试
4. 实现 handler + 注册
5. 接入 ipc/index.ts
6. 运行验证通过
7. 提交

---

## Task 8: preload 与 renderer 类型层

**目标：** preload 暴露 pricing + logs.rangeSummary API，renderer 类型派生。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#45-ipc-通道契约`

**需求描述：**
`src/preload/types.ts`：ElectronAPI 加 `pricing: { list, getByProvider, upsert, delete }` 与 `logs.rangeSummary(range)`；**同时扩展该文件内的 `DashboardStats` interface（第 29 行）加 `cacheTokens?: number` 与 `totalCost?: number`**（向后兼容可选字段）。`src/preload/index.ts`：暴露对应 ipcRenderer.invoke。`src/renderer/lib/types.ts`：派生 `PricingEntity`/`RangeSummary`（从 shared re-export 或 type alias）；**扩展该文件内的 `DashboardStats` interface（第 45 行）加 `cacheTokens?: number` 与 `totalCost?: number`**；`ProviderStatsModel`/`StatsDataPoint` 加 cost/cacheTokens。`src/renderer/lib/ipc.ts`：api 对象加 pricing 与 logs.rangeSummary。注意 preload 与 renderer 两处 DashboardStats 是独立定义，都要改以与后端 StatsResponse 契约一致。

**产出：**
- 文件：`src/preload/types.ts`、`src/preload/index.ts`、`src/renderer/lib/types.ts`、`src/renderer/lib/ipc.ts`
- 模块：`api.pricing`、`api.logs.rangeSummary`

**消费：**
- Task 0：`PricingEntity`、`RangeSummary`
- Task 7：IPC 通道已注册

**文件：**
- 修改：`src/preload/types.ts`、`src/preload/index.ts`、`src/renderer/lib/types.ts`、`src/renderer/lib/ipc.ts`

**验收标准：**
- [x] window.electronAPI.pricing.{list,getByProvider,upsert,delete} 类型存在
- [x] window.electronAPI.logs.rangeSummary('24h') 返回 Promise<RangeSummary>
- [x] preload/types.ts 的 DashboardStats 含 cacheTokens?/totalCost?
- [x] renderer/lib/types.ts 的 DashboardStats 含 cacheTokens?/totalCost?
- [x] ProviderStatsModel/StatsDataPoint 含 cost/cacheTokens
- [x] `npx tsc --noEmit` 通过

**步骤：**
1. 扩展 preload types + index
2. 扩展 renderer types + ipc
3. 运行 `npx tsc --noEmit` 验证
4. 提交

---

## Task 9: renderer queries（rangeSummary + pricing）

**目标：** 封装 useRangeSummary 与 pricing queries hooks。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#53-新增组件`

**需求描述：**
`src/renderer/lib/queries/stats.ts`：新增 `useRangeSummary(range: '24h'|'30d')`，queryKey `['stats','rangeSummary',range]`，queryFn 调 `api.logs.rangeSummary(range)`。`src/renderer/lib/queries/providers.ts`（或新建 `pricing.ts`，遵循按域分文件）：`usePricingByProvider(providerId)`（queryKey `['pricing','byProvider',providerId]`）、`useUpsertPricing()`（mutation，成功后 invalidate `['pricing']`）、`useDeletePricing()`（mutation）。遵循 queryKey 层级化数组格式。

**产出：**
- 文件：`src/renderer/lib/queries/stats.ts`、`src/renderer/lib/queries/providers.ts`（或 `pricing.ts`）
- 模块：`useRangeSummary`、`usePricingByProvider`、`useUpsertPricing`、`useDeletePricing`

**消费：**
- Task 8：`api.pricing`、`api.logs.rangeSummary`

**文件：**
- 修改：`src/renderer/lib/queries/stats.ts`、`src/renderer/lib/queries/providers.ts`

**验收标准：**
- [x] useRangeSummary queryKey 为 `['stats','rangeSummary',range]`
- [x] useUpsertPricing 成功后 invalidate pricing 相关 queryKey
- [x] 所有 queryKey 为层级化数组（非字符串）
- [x] `npx tsc --noEmit` 通过

**步骤：**
1. 编写 useRangeSummary
2. 编写 pricing queries
3. 运行类型检查
4. 提交

---

## Task 10: 供应商表单单价配置区

**目标：** ProviderFormDialog 增加每个模型的 3 类单价输入，保存时 upsert pricing。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#51-供应商编辑表单--单价配置区`

**需求描述：**
`src/renderer/features/provider/components/ProviderFormDialog.tsx`：模型列表下方新增"费用配置（元/百万tokens）"区，对 form.models 每个模型渲染一行 3 个 Input（缓存命中/未命中/输出）。编辑模式打开时通过 `usePricingByProvider(editingId)` 回填已有单价。表单 state 扩展 `pricing: Record<model, {priceInCached, priceInUncached, priceOut}>`。handleSave 在 provider create/update 成功后，对每个模型调用 `useUpsertPricing`（新建模式用返回的 provider id）。复用 Input/Label 组件，不引入新 UI 库。新增模型时同步加默认空单价行，移除模型时同步移除。

**产出：**
- 文件：`src/renderer/features/provider/components/ProviderFormDialog.tsx`
- 模块：ProviderFormDialog（扩展）

**消费：**
- Task 9：`usePricingByProvider`、`useUpsertPricing`

**文件：**
- 修改：`src/renderer/features/provider/components/ProviderFormDialog.tsx`
- 测试：扩展 ProviderFormDialog 测试

**验收标准：**
- [x] 每个已添加模型显示 3 个单价输入
- [x] 编辑模式回填已有单价
- [x] 保存成功后对每个模型 upsert pricing
- [x] 新建模式用返回的 provider id upsert
- [x] 新增/移除模型同步增删单价行
- [x] 复用 Input/Label，无原生 input
- [x] 组件测试通过

**步骤：**
1. 编写单价配置区渲染 + 回填测试
2. 实现渲染与回填
3. 编写保存 upsert 测试
4. 实现保存逻辑
5. 运行验证通过
6. 提交

---

## Task 11: RangeSummaryCard 组件

**目标：** 实现 24h/30d 汇总卡组件，token 4 列 + 费用 4 列 + 次数。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#52-仪表板布局`

**需求描述：**
`src/renderer/features/dashboard/components/RangeSummaryCard.tsx`：props `{ range: '24h'|'30d' }`，内部用 `useRangeSummary(range)`。展示标题（"近 24 小时"/"近 30 天"）+ token 区（总/缓存/非缓存/输出）+ 费用区（总/缓存/非缓存/输出）+ 次数。加载态用 Skeleton，空数据（totalRequests=0）显示 0 或 EmptyState 提示。费用格式化保留合适小数（如 ¥0.0123 或统一元单位）。复用 Card/Badge 等共享组件。

**产出：**
- 文件：`src/renderer/features/dashboard/components/RangeSummaryCard.tsx`
- 模块：`RangeSummaryCard`

**消费：**
- Task 9：`useRangeSummary`
- Task 0：`RangeSummary`（类型）

**文件：**
- 创建：`src/renderer/features/dashboard/components/RangeSummaryCard.tsx`
- 测试：`src/renderer/features/dashboard/components/__tests__/RangeSummaryCard.test.tsx`

**验收标准：**
- [x] 渲染 token 4 列（总/缓存/非缓存/输出）数值
- [x] 渲染费用 4 列（总/缓存/非缓存/输出）数值
- [x] 渲染次数
- [x] 加载态显示 Skeleton
- [x] 空数据显示 0 / 提示
- [x] 组件测试（渲染 + 加载态 + 空数据）通过
- [x] `npm run test:frontend` 通过

**步骤：**
1. 编写组件测试（渲染数值 + 加载态 + 空数据）
2. 运行验证失败
3. 实现组件
4. 运行验证通过
5. 提交

---

## Task 12: 仪表板页面组装与卡片改造

**目标：** Dashboard 组装 RangeSummaryCard，DashboardStatsGrid 第 3 卡改近 7 天花费。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#52-仪表板布局`

**需求描述：**
`src/renderer/features/dashboard/components/DashboardStats.tsx`：第 3 张卡 `供应商标记`（activeProviders/totalProviders）改为 `近 7 天花费`，value 用 `stats?.totalCost ?? 0` 格式化（移除 activeProviders/totalProviders props 中第 3 卡的依赖，但保留 props 传参以兼容——实际改为读 stats.totalCost）。`src/renderer/pages/Dashboard.tsx`：在 StatsSummaryTable 上方（或趋势手风琴上方）插入两个 `<RangeSummaryCard range="24h" />` 与 `<RangeSummaryCard range="30d" />`。保留原有顶部 4 卡、汇总表、趋势手风琴结构。

**产出：**
- 文件：`src/renderer/pages/Dashboard.tsx`、`src/renderer/features/dashboard/components/DashboardStats.tsx`
- 模块：Dashboard（扩展）、DashboardStatsGrid（改造）

**消费：**
- Task 11：`RangeSummaryCard`
- Task 8：`DashboardStats.totalCost`

**文件：**
- 修改：`src/renderer/pages/Dashboard.tsx`、`src/renderer/features/dashboard/components/DashboardStats.tsx`

**验收标准：**
- [ ] Dashboard 渲染 24h 与 30d 两个 RangeSummaryCard
- [ ] DashboardStatsGrid 第 3 卡显示"近 7 天花费"而非供应商标记
- [ ] 花费值来自 stats.totalCost
- [ ] 顶部 4 卡、汇总表、趋势手风琴结构保留
- [ ] `npm run test:frontend` 通过

**步骤：**
1. 改造 DashboardStatsGrid 第 3 卡
2. 在 Dashboard 插入两个 RangeSummaryCard
3. 运行前端测试 + 类型检查
4. 提交

---

## Task 13: 全量验证与文档同步

**目标：** 全量测试 + 编译 + lint + 类型检查通过，更新 ARCHITECTURE.md。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-dashboard-cost-cache-design.md#8-影响范围`

**需求描述：**
运行 `npm test`（前后端全量）、`npx tsc --noEmit`、`npm run lint`。修复任何回归。更新 `docs/ARCHITECTURE.md`：数据流增加 cache_tokens 采集与 pricing 费用计算链路，模块职责新增 pricing domain，目录结构补 provider-pricing.ts 与 RangeSummaryCard。确保文档与实际代码一致。

**产出：**
- 文件：`docs/ARCHITECTURE.md`（修改）

**消费：**
- 所有前置任务

**文件：**
- 修改：`docs/ARCHITECTURE.md`

**验收标准：**
- [ ] `npm test` 全量通过（输出重定向到临时文件，仅 grep 关键结果）
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run lint` 通过
- [ ] ARCHITECTURE.md 数据流含 cache_tokens 与 pricing 链路
- [ ] ARCHITECTURE.md 目录结构含新增文件
- [ ] 提交

**步骤：**
1. 运行全量测试（输出重定向 /tmp）
2. grep 提取 error/fail/pass 关键信息
3. 运行类型检查 + lint
4. 修复回归
5. 更新 ARCHITECTURE.md
6. 提交

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 0: 共享类型与契约 | 无 | ✅ |
| L0 | Task 1: schema 与迁移脚本 | 无 | ✅ |
| L0 | Task 4: 缓存 token 采集 | 无 | ✅ |
| L1 | Task 2: pricing Repository | Task 1 | ✅ |
| L1 | Task 5: 统计表写入与查询扩展 | Task 0, 1 | ✅ |
| L2 | Task 3: pricing domain | Task 0, 2 | ✅ |
| L2 | Task 6: stats/logs service 扩展 | Task 0, 5 | ✅ |
| L3 | Task 7: IPC handler 注册 | Task 3, 6 | ✅ |
| L3 | Task 8: preload 与 renderer 类型层 | Task 0, 7 | ✅ |
| L4 | Task 9: renderer queries | Task 8 | ✅ |
| L4 | Task 10: 供应商表单单价配置区 | Task 9 | — |
| L4 | Task 11: RangeSummaryCard 组件 | Task 9 | ✅ |
| L5 | Task 12: 仪表板页面组装 | Task 10, 11 | — |
| L6 | Task 13: 全量验证与文档同步 | 全部 | — |

**说明：**
- L0：Task 0（契约）、Task 1（schema）、Task 4（缓存采集，独立不改共享类型）三者无相互依赖，可并行。
- L1：Task 2/5 消费 L0 产出，修改不同文件，可并行。Task 5 依赖 Task 0（RangeSummary 结构）与 Task 1（表结构）。
- L2：Task 3（pricing domain，依赖 Repository）与 Task 6（service 扩展，依赖 statsRepo）可并行。
- L3：Task 7（IPC，依赖 service）与 Task 8（类型层，依赖契约+通道）可并行。
- L4：queries 与两个前端组件并行；Task 10 与 Task 11 修改不同文件可并行。
- L5：页面组装依赖表单与 RangeSummaryCard 两个组件。
- L6：全量验证收尾。

**并行约束提醒：**
- Task 5 与 Task 6 都涉及 logs-stats / logs service，但 Task 5 改 db 层、Task 6 改 service 层，文件不重叠，分属 L1/L2 不同层，串行执行。
- Task 10（表单）与 Task 12（页面）都改 renderer，但分属 L4/L5，串行。
