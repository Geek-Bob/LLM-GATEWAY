# 协议转换 cache 字段映射 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 修复 LLM Gateway 代理在 OpenAI↔Anthropic 协议转换时丢失 cache 字段的 BUG——客户端传 `prompt_cache_key` / `prompt_cache_retention` 时透传丢弃导致上游不启用 cache，命中永远 0。本计划在 `proxy/converter/` 3 文件内做字段映射，使 cache 启用信号与命中报告在两种协议间无损传递。

**架构：** 4 个 converter 函数按"客户端传才触发生成"原则加 cache 字段映射：request 层（OpenAI→Anthropic + 反向）映射 cache 启用信号，response 层（双向）映射 cache 命中数，SSE 层（双向）透传 cache 命中到流式响应。代理严格按"客户端传什么 = 代理忠实验证意图"工作，不强制注入。

**技术栈：** TypeScript 6 + vitest 4.x + Zod 4.x + Hono 4.x（已有）

---

## 文件结构

| 文件 | 任务范围 | 修改策略 |
|---|---|---|
| `src/main/proxy/converter/request.ts` | Task 1, 2 | 同文件 2 个函数分 2 个任务串行 |
| `src/main/proxy/converter/response.ts` | Task 3, 4 | 同文件 2 个函数分 2 个任务串行 |
| `src/main/proxy/converter/sse.ts` | Task 5, 6 | 同文件 2 个函数分 2 个任务串行 |
| `src/main/proxy/converter/__tests__/request.test.ts` | Task 1, 2 测试 | 新建（不存在） |
| `src/main/proxy/converter/__tests__/response.test.ts` | Task 3, 4 测试 | 新建（不存在） |
| `src/main/proxy/converter/__tests__/sse.test.ts` | Task 5, 6 测试 | 新建（不存在） |

---

### Task 1: openaiToAnthropicRequest 加 cache 启用信号映射

**目标：** OpenAI 客户端的 `prompt_cache_key` / `prompt_cache_retention` 在 OpenAI→Anthropic 转换时正确映射为 Anthropic 协议字段，使上游启用 cache。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#32-触发生成规则d-决策`

**需求描述：**
修改 `src/main/proxy/converter/request.ts` 的 `openaiToAnthropicRequest` 函数。当 `openaiBody.prompt_cache_retention` 存在且值为 `"24h"` 或 `"1h"` 时，在 `result.system` 最后一个 text 块上加 `cache_control: { type: "ephemeral" }`（若 system 为空或不存在则静默跳过，透明原则）。当 `openaiBody.prompt_cache_key` 存在时，设置 `result.metadata.user_id = openaiBody.prompt_cache_key`（与已有 metadata 字段合并而非覆盖）。两个字段都缺省时完全不改动现有行为（透明）。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/request.ts` — `openaiToAnthropicRequest` 函数增加 cache 字段映射
- 模块：`openaiToAnthropicRequest`（修改既有）
- 类型：无新增

**消费（Consumes）：**
- spec：`docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md` 决策 D + 触发生成规则

**文件：**
- 修改：`src/main/proxy/converter/request.ts`
- 创建：`src/main/proxy/converter/__tests__/request.test.ts`（如不存在）

**验收标准：**
- [ ] OpenAI 客户端传 `prompt_cache_retention: "24h"` + 至少一条 system 消息 → Anthropic 请求 system 末尾块含 `cache_control: { type: "ephemeral" }`
- [ ] OpenAI 客户端传 `prompt_cache_retention: "1h"` + system → 同样生成 `cache_control: { type: "ephemeral" }`
- [ ] OpenAI 客户端传 `prompt_cache_key: "user_123"` → Anthropic 请求 `metadata.user_id === "user_123"`
- [ ] OpenAI 客户端两个都传 → 同时生成 cache_control 和 metadata.user_id
- [ ] OpenAI 客户端都不传 → system 块无 cache_control，metadata 无 user_id（透明）
- [ ] OpenAI 客户端无 system 消息但传 `prompt_cache_retention` → 不报错，system 仍为空数组（透明）
- [ ] 现有 thinking / tool_choice / tools 转换不受影响（与既有测试一致）
- [ ] `npx vitest run --config vitest.backend.config.ts src/main/proxy/converter/__tests__/request.test.ts` 全过
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors

**步骤：**
1. Read `src/main/proxy/converter/request.ts` 全文确认 `openaiToAnthropicRequest` 当前结构
2. 写测试：8 个用例覆盖上述验收点（Red）
3. 跑测试，验证失败
4. 在 `openaiToAnthropicRequest` 中加 `if (openaiBody.prompt_cache_retention === "24h" || openaiBody.prompt_cache_retention === "1h")` 块 + `if (openaiBody.prompt_cache_key)` 块（Green）
5. 跑测试，验证通过
6. 跑全量后端测试 `npm run test:backend -- src/main/proxy/converter` 确认无回归
7. 跑 `npx tsc -b --noEmit` + `npm run lint`
8. commit：中文 `feat(converter): openaiToAnthropicRequest 加 prompt_cache_key/retention 映射`

---

### Task 2: anthropicToOpenAIRequest 加反向 cache 字段映射

**目标：** Anthropic 客户端的 `system[].cache_control` 与 `metadata.user_id` 在反向转换时映射为 OpenAI 协议字段。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#32-触发生成规则d-决策`

**需求描述：**
修改 `src/main/proxy/converter/request.ts` 的 `anthropicToOpenAIRequest` 函数。当 `anthropicBody.system` 数组中**任一**块含 `cache_control` 字段时，固定设置 `result.prompt_cache_retention = "24h"`（用户决策 A：尊重 Anthropic 端 cache_control: ephemeral 显式要 cache 的意图）。当 `anthropicBody.metadata?.user_id` 存在时，设置 `result.prompt_cache_key = anthropicBody.metadata.user_id`。两个条件都缺省时透明不改动。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/request.ts` — `anthropicToOpenAIRequest` 函数增加 cache 字段映射
- 模块：`anthropicToOpenAIRequest`（修改既有）

**消费（Consumes）：**
- spec：`docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md` 决策 A + 反向触发生成规则
- Task 1：同文件改动（不消费其代码逻辑，但要求 Task 1 已完成 commit）

**文件：**
- 修改：`src/main/proxy/converter/request.ts`
- 修改：`src/main/proxy/converter/__tests__/request.test.ts`（追加 2 个用例）

**验收标准：**
- [ ] Anthropic 客户端 `system: [{type:"text", text:"...", cache_control:{type:"ephemeral"}}]` → OpenAI 请求 `prompt_cache_retention === "24h"`
- [ ] Anthropic 客户端 `metadata: {user_id: "user_123"}` → OpenAI 请求 `prompt_cache_key === "user_123"`
- [ ] Anthropic 客户端 system 无 cache_control + 无 metadata → OpenAI 请求无 prompt_cache 字段
- [ ] Anthropic 客户端 system 多块且只有其中一块带 cache_control → 仍生成 prompt_cache_retention（任一块即触发）
- [ ] 现有 thinking / tool_choice 转换不受影响
- [ ] `npx vitest run --config vitest.backend.config.ts src/main/proxy/converter/__tests__/request.test.ts` 全过（含 Task 1 测试）

**步骤：**
1. 拉取 Task 1 的 commit（必须已 commit，未 push 也可）
2. 写测试：4 个用例覆盖上述验收点（Red）
3. 跑测试，验证失败
4. 在 `anthropicToOpenAIRequest` 末尾（tool_choice 处理之后）加反向 cache 映射块
5. 跑测试，验证通过
6. 跑全量后端测试确认无回归
7. 跑 `npx tsc -b --noEmit` + `npm run lint`
8. commit：中文 `feat(converter): anthropicToOpenAIRequest 加 cache_control/user_id 反向映射`

---

### Task 3: anthropicToOpenAIResponse 加 usage cache 字段映射

**目标：** Anthropic 响应中的 `cache_read_input_tokens` / `cache_creation_input_tokens` 映射到 OpenAI 响应格式，使客户端能正确读到 cache 命中数。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#22-跨协议对照表`

**需求描述：**
修改 `src/main/proxy/converter/response.ts` 的 `anthropicToOpenAIResponse` 函数。在 `response.usage` 对象中：当 `anthropicBody.usage.cache_read_input_tokens` 存在时，添加 `prompt_tokens_details: { cached_tokens: <value> }`；当 `cache_creation_input_tokens` 存在时，添加 `cache_creation_input_tokens: <value>`（保留供诊断，OpenAI 端不识别但无副作用）。`total_tokens` 字段逻辑不变（= input + output）。当 Anthropic usage 字段都缺省时透明不改动。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/response.ts` — `anthropicToOpenAIResponse` 函数 usage 映射
- 模块：`anthropicToOpenAIResponse`（修改既有）

**消费（Consumes）：**
- spec：`docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md` 验收 5.2

**文件：**
- 修改：`src/main/proxy/converter/response.ts`
- 创建：`src/main/proxy/converter/__tests__/response.test.ts`（如不存在）

**验收标准：**
- [ ] Anthropic 响应 `usage.cache_read_input_tokens: 1500` → OpenAI 响应 `usage.prompt_tokens_details.cached_tokens === 1500`
- [ ] Anthropic 响应 `usage.cache_creation_input_tokens: 800` → OpenAI 响应 `usage.cache_creation_input_tokens === 800`
- [ ] Anthropic 响应两个字段都缺省 → OpenAI 响应无 prompt_tokens_details 与 cache_creation_input_tokens（透明）
- [ ] Anthropic 响应 `cache_read_input_tokens: 0` → OpenAI 响应 `prompt_tokens_details.cached_tokens === 0`（不省略 0 值）
- [ ] `total_tokens` 仍等于 `input_tokens + output_tokens`，不受 cache 字段影响
- [ ] 现有 tool_use / thinking / text 转换不受影响
- [ ] `npx vitest run --config vitest.backend.config.ts src/main/proxy/converter/__tests__/response.test.ts` 全过
- [ ] `npx tsc -b --noEmit` exit 0

**步骤：**
1. Read `src/main/proxy/converter/response.ts` 全文确认 `anthropicToOpenAIResponse` 当前结构
2. 写测试：4 个用例（Red）
3. 跑测试，验证失败
4. 在 `usage` 构造后追加 cache 字段映射（Green）
5. 跑测试，验证通过
6. 跑全量后端测试确认无回归
7. 跑 `npx tsc -b --noEmit`
8. commit：中文 `feat(converter): anthropicToOpenAIResponse usage 加 cache 字段映射`

---

### Task 4: openAIToAnthropicResponse 加反向 usage cache 字段映射

**目标：** OpenAI 响应的 `prompt_tokens_details.cached_tokens` 反向映射到 Anthropic 协议的 `cache_read_input_tokens`。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#22-跨协议对照表`

**需求描述：**
修改 `src/main/proxy/converter/response.ts` 的 `openAIToAnthropicResponse` 函数。当 `openaiBody.usage.prompt_tokens_details?.cached_tokens` 存在时，设置 `result.usage.cache_read_input_tokens = <value>`。当缺省时透明不改动。注意 OpenAI 协议不输出 `cache_creation_input_tokens`，所以反向不需要保留 raw 字段。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/response.ts` — `openAIToAnthropicResponse` 函数 usage 映射
- 模块：`openAIToAnthropicResponse`（修改既有）

**消费（Consumes）：**
- spec：`docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md` 验收 5.2 反向
- Task 3：同文件改动（不消费其代码逻辑，但要求 Task 3 已完成 commit）

**文件：**
- 修改：`src/main/proxy/converter/response.ts`
- 修改：`src/main/proxy/converter/__tests__/response.test.ts`（追加 2 个用例）

**验收标准：**
- [ ] OpenAI 响应 `usage.prompt_tokens_details.cached_tokens: 800` → Anthropic 响应 `usage.cache_read_input_tokens === 800`
- [ ] OpenAI 响应 `prompt_tokens_details` 缺省 → Anthropic 响应无 `cache_read_input_tokens` 字段（透明）
- [ ] 现有 tool_calls / reasoning_content 转换不受影响
- [ ] `npx vitest run --config vitest.backend.config.ts src/main/proxy/converter/__tests__/response.test.ts` 全过（含 Task 3 测试）

**步骤：**
1. 拉取 Task 3 的 commit
2. 写测试：2 个用例（Red）
3. 跑测试，验证失败
4. 在 `usage` 构造后追加 `cache_read_input_tokens` 映射（Green）
5. 跑测试，验证通过
6. 跑全量后端测试确认无回归
7. 跑 `npx tsc -b --noEmit`
8. commit：中文 `feat(converter): openAIToAnthropicResponse usage 加 cached_tokens 反向映射`

---

### Task 5: sse.ts Anthropic→OpenAI 方向加 cache 字段透传

**目标：** 流式响应中 Anthropic 的 `usage.cache_read_input_tokens` / `cache_creation_input_tokens` 透传到 OpenAI chunk 的 `usage.prompt_tokens_details.cached_tokens` / `cache_creation_input_tokens`。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#41-修改文件清单`

**需求描述：**
修改 `src/main/proxy/converter/sse.ts` 3 个函数：
- `formatAnthropicMessageStartToOpenAI(data)`：当 `data.message.usage.cache_read_input_tokens` 存在时，在 chunk 顶层加 `usage: { prompt_tokens_details: { cached_tokens: <value> } }`（首帧 cache 命中）
- `formatAnthropicMessageDeltaToOpenAI(data)`：当 `data.usage.cache_read_input_tokens` 存在时，在已有 usage 块中加 `prompt_tokens_details: { cached_tokens: <value> }`（终止帧 cache 命中）
- `formatOpenAIUsageOnlyClose(s, usage)`：**不在本任务范围**（属 Task 6 方向）

注意 message_start 时 chunk 之前**没有** usage 字段（首帧只是声明角色），需新增 usage 块而非合并。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/sse.ts` — 2 个函数增加 cache 字段映射
- 模块：`formatAnthropicMessageStartToOpenAI` / `formatAnthropicMessageDeltaToOpenAI`（修改既有）

**消费（Consumes）：**
- spec：`docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md` 验收 5.3 第 1、2 条

**文件：**
- 修改：`src/main/proxy/converter/sse.ts`
- 创建：`src/main/proxy/converter/__tests__/sse.test.ts`（如不存在）

**验收标准：**
- [ ] Anthropic `message_start` `message.usage.cache_read_input_tokens: 1365` → OpenAI 首 chunk 含 `usage.prompt_tokens_details.cached_tokens === 1365`
- [ ] Anthropic `message_delta` `data.usage.cache_read_input_tokens: 114` → OpenAI 终止 chunk 含 `usage.prompt_tokens_details.cached_tokens === 114`
- [ ] Anthropic `cache_read_input_tokens: 0` → OpenAI chunk 仍带 `cached_tokens: 0`（不省略 0 值）
- [ ] Anthropic cache 字段缺省 → OpenAI chunk 不加 prompt_tokens_details（透明）
- [ ] 现有 text / tool_use / thinking delta 转换不受影响
- [ ] `npx vitest run --config vitest.backend.config.ts src/main/proxy/converter/__tests__/sse.test.ts` 全过
- [ ] `npx tsc -b --noEmit` exit 0

**步骤：**
1. Read `src/main/proxy/converter/sse.ts` 全文确认 3 个函数当前结构
2. 写测试：4 个用例（Red）
3. 跑测试，验证失败
4. 改 `formatAnthropicMessageStartToOpenAI` 加首帧 usage 块（Green）
5. 改 `formatAnthropicMessageDeltaToOpenAI` 加终止帧 usage 增量块
6. 跑测试，验证通过
7. 跑全量后端测试确认无回归
8. 跑 `npx tsc -b --noEmit` + `npm run lint`
9. commit：中文 `feat(converter): sse Anthropic→OpenAI 加 cache 字段透传`

---

### Task 6: sse.ts OpenAI→Anthropic 方向加 cache 字段映射

**目标：** 流式响应中 OpenAI 的 `usage.prompt_tokens_details.cached_tokens` 反向映射到 Anthropic 的 `usage.cache_read_input_tokens`。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#41-修改文件清单`

**需求描述：**
修改 `src/main/proxy/converter/sse.ts` 2 个函数：
- `formatOpenAIUsageOnlyClose(s, usage)`：当 `usage.prompt_tokens_details?.cached_tokens` 存在时，在生成的 `message_delta.usage` 块中加 `cache_read_input_tokens: <value>`
- `formatOpenAIMessageStart(ctx, s, data)`：当 `data.usage.prompt_tokens_details?.cached_tokens` 存在时（罕见但可能），在 `message.usage` 块中加 `cache_read_input_tokens: <value>`

注意 OpenAI 协议不输出 `cache_creation_input_tokens`，所以反向不保留该字段。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/sse.ts` — 2 个函数增加 cache 字段反向映射
- 模块：`formatOpenAIUsageOnlyClose` / `formatOpenAIMessageStart`（修改既有）

**消费（Consumes）：**
- spec：`docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md` 验收 5.3 第 3 条
- Task 5：同文件改动（不消费其代码逻辑，但要求 Task 5 已完成 commit）

**文件：**
- 修改：`src/main/proxy/converter/sse.ts`
- 修改：`src/main/proxy/converter/__tests__/sse.test.ts`（追加 2 个用例）

**验收标准：**
- [ ] OpenAI 终止 chunk `usage.prompt_tokens_details.cached_tokens: 8` → Anthropic `message_delta.usage.cache_read_input_tokens === 8`
- [ ] OpenAI 首 chunk `usage.prompt_tokens_details.cached_tokens: 1365` → Anthropic `message.usage.cache_read_input_tokens === 1365`（罕见但覆盖）
- [ ] OpenAI `prompt_tokens_details` 缺省 → Anthropic usage 块无 cache_read_input_tokens（透明）
- [ ] `npx vitest run --config vitest.backend.config.ts src/main/proxy/converter/__tests__/sse.test.ts` 全过（含 Task 5 测试）

**步骤：**
1. 拉取 Task 5 的 commit
2. 写测试：2 个用例（Red）
3. 跑测试，验证失败
4. 改 `formatOpenAIUsageOnlyClose` 在 usage 块加 `cache_read_input_tokens` 映射（Green）
5. 改 `formatOpenAIMessageStart` 在 message.usage 块加映射
6. 跑测试，验证通过
7. 跑全量后端测试确认无回归
8. 跑 `npx tsc -b --noEmit`
9. commit：中文 `feat(converter): sse OpenAI→Anthropic 加 cached_tokens 反向映射`

---

### Task 7: 集成验证 + 收尾

**目标：** 跑全量验证确认无回归，处理收尾事务（responseBodyRaw 字段还原、push master）。

**设计文档索引：** `docs/superpowers/specs/2026-06-21-protocol-conversion-cache-mapping-design.md#54-不破坏现有行为`

**需求描述：**
1. 跑全量测试 `npm test` 确认前后端所有 905+ 测试无回归
2. 跑 `npx tsc -b --noEmit` 确认类型零错误
3. 跑 `npm run lint` 确认 0 errors
4. 还原 `responseBodyRaw` 临时字段（commit `29d07a6` 的使命已完成）：
   - `src/main/proxy/logger.ts` 删 `debug.upstream.responseBodyRaw = text` 行 + 删 JSDoc 注释
   - `src/shared/types.ts` 删 `responseBodyRaw?: string` 行
5. Push master 到 origin（当前领先 3 commits：spec 文档 + 6 个 converter 改动）
6. 关闭 BUG 2 任务

**产出（Produces）：**
- 无新文件，仅清理

**消费（Consumes）：**
- Task 1-6：所有 converter 改动必须已 commit

**文件：**
- 修改：`src/main/proxy/logger.ts`（删 1 行 + JSDoc）
- 修改：`src/shared/types.ts`（删 1 行）

**验收标准：**
- [ ] `npm test` 全过（前 905 + 新增 ≥20 用例）
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors
- [ ] `responseBodyRaw` 字段完全从代码移除
- [ ] master 成功 push 到 origin
- [ ] `git log origin/master..HEAD` 显示所有 6 个 converter commit + spec commit + 还原 commit

**步骤：**
1. 拉取 Task 6 的 commit
2. 跑 `npm test` 全量验证
3. 跑 `npx tsc -b --noEmit` + `npm run lint`
4. 还原 `responseBodyRaw` 字段（Edit logger.ts + shared/types.ts）
5. 跑测试确认还原无破坏
6. commit：中文 `chore(debug): 还原 responseBodyRaw 临时字段，BUG 2 修复完成`
7. `git push origin master`
8. 关闭所有任务清单条目

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件 → 可并行执行；同文件改动 → 串行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L1 | Task 1: openaiToAnthropicRequest cache 映射 | spec 决策 D | ✅ |
| L1 | Task 3: anthropicToOpenAIResponse usage cache | spec 验收 5.2 | ✅ |
| L1 | Task 5: sse Anthropic→OpenAI cache | spec 验收 5.3 | ✅ |
| L2 | Task 2: anthropicToOpenAIRequest 反向 cache | spec 决策 A + Task 1（同文件） | ✅ |
| L2 | Task 4: openAIToAnthropicResponse 反向 usage | spec 验收 5.2 + Task 3（同文件） | ✅ |
| L2 | Task 6: sse OpenAI→Anthropic 反向 cache | spec 验收 5.3 + Task 5（同文件） | ✅ |
| L3 | Task 7: 集成验证 + 收尾 + push | Task 1-6 | — |

**关键依赖**：
- Task 2 依赖 Task 1（同文件 request.ts，避免 merge conflict）
- Task 4 依赖 Task 3（同文件 response.ts）
- Task 6 依赖 Task 5（同文件 sse.ts）
- Task 1, 3, 5 互不依赖（不同文件），可并行
- Task 2, 4, 6 互不依赖，可并行

---

## 牢记

- TDD 铁律：每个 Task 步骤 1-2 是写测试 + 验证失败
- 中文 commit message，不署名 AI
- 频繁提交，每个 Task 一个 commit
- 不修改 IPC 契约（本次纯 converter 内部改造）
- 不动 `safety_identifier` / `user` 字段（YAGNI）
- 同文件改动不要跨任务合并 commit
