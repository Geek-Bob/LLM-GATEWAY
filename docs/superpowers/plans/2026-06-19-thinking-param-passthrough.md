# 思考参数透传与协议转换 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 修正代理对思考参数的协议转换缺陷，并在 chat 页面增加思考设置入口（执行方式 + 强度），按对话持久化，实现纯透传式思考参数转发。

**架构：** 代理是纯透传转换服务，不配置不注入——`thinking` 字段跨协议同名透传，`reasoning_effort ↔ output_config.effort` 字段名转换，删除现状把 `reasoning_effort` 误转成 `thinking:{enabled,budget_tokens}` 的逻辑。chat 页面新增两正交控件（执行方式 thinking.type、强度 reasoning_effort），按对话存到 conversations 表两新列，发送时按规则注入请求体。

**技术栈：** TypeScript 6 / React 19 / sql.js / Zod 4 / TanStack Query 5 / vitest 4

**设计文档：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md`

---

## 文件结构

| 文件 | 职责 | 操作 |
|---|---|---|
| `src/shared/types.ts` | 定义 ThinkingType / ReasoningEffort 枚举；ConversationEntity 扩展两字段 | 修改 |
| `src/main/db/schema.ts` | conversations 表 CREATE 加两列 + 幂等 ALTER 迁移 | 修改 |
| `src/main/db/conversations.ts` | ConversationRow 加字段；create/update 处理新字段 | 修改 |
| `src/main/domains/conversation/conversation.types.ts` | Create/Update Input 加可选字段；Response 加字段 | 修改 |
| `src/main/domains/conversation/conversation.schema.ts` | create/update Zod schema 加两枚举字段 | 修改 |
| `src/main/domains/conversation/conversation.service.ts` | create/update 透传新字段；rowToResponse 映射 | 修改 |
| `src/main/ipc/conversations.ts` | 集成验证 handler 透传（schema 已在 domain 层定义） | 修改 |
| `src/main/proxy/converter/request.ts` | 删 reasoning_effort→thinking 误转；改 thinking 透传 + reasoning_effort↔output_config.effort | 修改 |
| `src/main/proxy/__tests__/converter.test.ts` | 修订 thinking 相关测试 | 修改 |
| `src/preload/index.ts` | conversations.create/update 签名扩展 | 修改 |
| `src/preload/types.ts` | ElectronAPI conversations 签名扩展 | 修改 |
| `src/renderer/lib/types.ts` | Conversation 派生新字段 | 修改 |
| `src/renderer/features/chat/hooks/useChatStream.ts` | send/buildRequestBody 接收 thinkingConfig 注入 | 修改 |
| `src/renderer/features/chat/hooks/useChatPage.ts` | 思考状态管理 + 持久化 + 传参 | 修改 |
| `src/renderer/features/chat/hooks/useConversationManager.ts` | selectConversation 返回思考设置；saveUserMessage/create 携带 | 修改 |
| `src/renderer/features/chat/components/ThinkingSettings.tsx` | 思考设置 UI 控件（新建） | 创建 |
| `src/renderer/pages/Chat.tsx` | 集成 ThinkingSettings | 修改 |
| `scripts/migrate-db.mjs` | conversations 建表语句同步加两列 | 修改 |

---

### Task 0: 共享类型契约定义

**目标：** 在 shared/types.ts 定义 ThinkingType / ReasoningEffort 枚举，并扩展 ConversationEntity 两个可选字段，作为所有层同源派生的契约源。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#61-共享类型sharedtypests`

**需求描述：**
定义两个跨进程共享的字面量联合类型：`ThinkingType = 'disabled' | 'enabled' | 'adaptive'`（执行方式，对应上游 thinking.type）、`ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'`（强度偏好，对应 reasoning_effort / output_config.effort）。在 `ConversationEntity` 上增加两个可选字段 `thinkingType?: ThinkingType`、`reasoningEffort?: ReasoningEffort`（可选，向后兼容旧对话）。遵守 CLAUDE.md 核心实体基础接口规则——这两个枚举是跨进程契约，必须在 shared/types.ts 定义，其他层只允许 type alias 派生。

**产出（Produces）：**
- 文件：`src/shared/types.ts`
- 类型：`ThinkingType`、`ReasoningEffort`、`ConversationEntity`（扩展）

**消费（Consumes）：**
- 无（契约层，不消费任何任务）

**文件：**
- 修改：`src/shared/types.ts`
- 测试：`src/shared/types.test-d.ts`（新建，类型断言测试）

**验收标准：**
- [x] `ThinkingType` 联合类型含且仅含 `'disabled' | 'enabled' | 'adaptive'` 三个字面量
- [x] `ReasoningEffort` 联合类型含且仅含 `'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'` 六个字面量
- [x] `ConversationEntity` 含 `thinkingType?: ThinkingType` 与 `reasoningEffort?: ReasoningEffort` 两个可选字段（不破坏现有字段）
- [x] `npx tsc -b --noEmit` 通过（前后端类型都检查）

**步骤：**
1. 编写类型断言测试（test-d.ts 验证枚举字面量与 ConversationEntity 字段类型）
2. 运行测试，验证失败
3. 在 shared/types.ts 定义两个枚举并扩展 ConversationEntity
4. 运行测试，验证通过
5. 提交

---

### Task 1: conversations 表 schema 加列与迁移

**目标：** 在 conversations 表增加 thinking_type、reasoning_effort 两列（均 nullable），对旧库做幂等 ALTER 迁移，并同步 migrate-db.mjs。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#51-conversations-表加两列`

**需求描述：**
conversations 表新增 `thinking_type TEXT`（值为 'disabled'|'enabled'|'adaptive'，NULL 视为 disabled）和 `reasoning_effort TEXT`（值为六个枚举之一，NULL 视为不传）两列，均 nullable 无默认值（向后兼容旧对话）。由于 schema.ts 用 `CREATE TABLE IF NOT EXISTS`，对已存在的旧表不会自动加列——必须在 createTables 内追加幂等 ALTER：用 `PRAGMA table_info('conversations')` 检测目标列不存在时执行 `ALTER TABLE conversations ADD COLUMN ...`。同时把新列写进 CREATE TABLE 语句（新安装直接有）。同步更新 scripts/migrate-db.mjs 中 conversations 的建表语句，保持一致。

**迁移策略决策（与 schema.ts 现有惯例冲突的处置）：** schema.ts 文件头注释现写「此文件只定义当前版本的表结构，不包含增量迁移逻辑，旧版本数据库迁移请使用 scripts/migrate-db.mjs」。本次采用**启动时幂等 ALTER** 策略（而非纯 migrate-db.mjs 一次性脚本），理由：sql.js 无声明式迁移框架，migrate-db.mjs 需用户手动运行，旧库在用户运行前不会加列，导致功能不可用。因此本任务须**同步修订 schema.ts 文件头注释**为「含幂等列迁移（PRAGMA table_info 检测后 ADD COLUMN）」，消除自相矛盾。migrate-db.mjs 仍同步更新建表语句（保持全量重建路径一致）。

**产出（Produces）：**
- 文件：`src/main/db/schema.ts`、`scripts/migrate-db.mjs`
- 模块：`createTables`（行为扩展）

**消费（Consumes）：**
- 无（数据层独立，不依赖 Task 0 类型——schema 不引用 TS 类型）

**文件：**
- 修改：`src/main/db/schema.ts`
- 修改：`scripts/migrate-db.mjs`
- 测试：`src/main/db/__tests__/schema.test.ts`（若不存在则新建）

**验收标准：**
- [x] 新建空库运行 createTables 后，conversations 表含 thinking_type、reasoning_effort 两列
- [x] 模拟旧库（conversations 表无两列）运行 createTables 后，两列被 ALTER 补上且已有数据不丢失
- [x] createTables 重复执行幂等（列已存在时不报错）
- [x] migrate-db.mjs 的 conversations 建表语句含两新列
- [x] schema.ts 文件头注释已修订为「含幂等列迁移」，与新逻辑一致（消除矛盾）
- [x] 测试通过：`npx vitest run src/main/db/__tests__/schema.test.ts --config vitest.backend.config.ts`

**步骤：**
1. 编写测试（新建库含两列 / 旧库 ALTER 补列 / 重复执行幂等）
2. 运行测试，验证失败
3. CREATE TABLE 加两列 + createTables 内加幂等 ALTER 逻辑 + 同步 migrate-db.mjs
4. 运行测试，验证通过
5. 提交

---

### Task 2: conversations Repository 支持新字段读写

**目标：** ConversationRow 加两字段，create/update 方法处理 thinking_type、reasoning_effort 的读写。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#62-模块接口签名`

**需求描述：**
`ConversationRow` 接口增加 `thinking_type: string | null`、`reasoning_effort: string | null`（snake_case，数据库层）。`create` 方法签名增加两个可选参数 `thinkingType?`、`reasoningEffort?`，INSERT 时写入对应列（未传写 NULL）。`update` 方法 `data` 参数类型增加 `thinking_type?: string | null`、`reasoning_effort?: string | null`，按现有动态拼 SET 子句的模式处理。`list`/`findById` 用 `SELECT *` 自动带出新列，无需改 SQL。遵守 Repository 工厂模式，禁止内联业务规则。

**产出（Produces）：**
- 文件：`src/main/db/conversations.ts`
- 模块：`createConversationRepository`（create/update 签名扩展）、`ConversationRow`（扩展）

**消费（Consumes）：**
- Task 1：conversations 表已含两列（数据层前提）

**文件：**
- 修改：`src/main/db/conversations.ts`
- 测试：`src/main/db/__tests__/conversations.test.ts`

**验收标准：**
- [ ] create 传入 thinkingType/reasoningEffort 时正确写入对应列
- [ ] create 不传时两列为 NULL
- [ ] update 传入 thinking_type/reasoning_effort 时正确更新对应列
- [ ] update 不传两字段时不改动它们（部分更新语义）
- [ ] list/findById 返回的行含两字段
- [ ] 测试通过：`npx vitest run src/main/db/__tests__/conversations.test.ts --config vitest.backend.config.ts`

**步骤：**
1. 编写测试（create 带新字段 / create 不带 / update 部分更新 / 查询返回新字段）
2. 运行测试，验证失败
3. 扩展 ConversationRow + create/update 签名
4. 运行测试，验证通过
5. 提交

---

### Task 3: conversation domain 类型、Zod schema 与服务层透传

**目标：** conversation.types.ts 的 Create/Update Input 加可选字段、Response 加字段；conversation.schema.ts 的 create/update Zod schema 加两枚举校验字段；conversation.service.ts 的 create/update/rowToResponse 透传思考设置。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#62-模块接口签名`

**需求描述：**
三处同改（domain 层一体）：(1) `ConversationResponse` 增 `thinkingType?: ThinkingType`、`reasoningEffort?: ReasoningEffort`（type alias 引用 Task 0 枚举）；`CreateConversationInput`/`UpdateConversationInput` 同增两可选字段。(2) `conversation.schema.ts` 的 `createConversationSchema`/`updateConversationSchema` 增 `thinkingType: z.enum(['disabled','enabled','adaptive']).optional()`、`reasoningEffort: z.enum(['minimal','low','medium','high','xhigh','max']).optional()`（Zod 4 enum 写法，注意是 `reasoningEffort` camelCase 与 input 类型对齐）。(3) `conversation.service.ts` 的 `create` 透传新字段给 repo.create（未传 undefined）；`update` 的 data 映射对象增 `thinking_type?`/`reasoning_effort?` 分支；`conversationRowToResponse` 把 snake_case 行映射为 camelCase（null → undefined）。遵守类型同源——枚举从 shared/types 派生，禁止重新定义；Zod schema 归属 domain 层（backend/31-domain-modeling.md）。

**产出（Produces）：**
- 文件：`src/main/domains/conversation/conversation.types.ts`、`src/main/domains/conversation/conversation.schema.ts`、`src/main/domains/conversation/conversation.service.ts`
- 模块：`ConversationResponse`（扩展）、`CreateConversationInput`（扩展）、`UpdateConversationInput`（扩展）、`createConversationSchema`（扩展）、`updateConversationSchema`（扩展）、`createConversationService`（行为扩展）

**消费（Consumes）：**
- Task 0：`ThinkingType`、`ReasoningEffort` 枚举类型
- Task 2：`createConversationRepository` create/update 新签名、`ConversationRow` 新字段

**文件：**
- 修改：`src/main/domains/conversation/conversation.types.ts`
- 修改：`src/main/domains/conversation/conversation.schema.ts`
- 修改：`src/main/domains/conversation/conversation.service.ts`
- 测试：`src/main/domains/conversation/__tests__/conversation.service.test.ts`、`src/main/domains/conversation/__tests__/conversation.schema.test.ts`

**验收标准：**
- [ ] create 传 thinkingType/reasoningEffort 时透传到 repo 并返回含字段的 Response
- [ ] update 传两字段时透传到 repo（snake_case 映射）
- [ ] update 不传两字段时不改动
- [ ] rowToResponse 把 row 的 null 映射为 Response 的 undefined
- [ ] createConversationSchema/updateConversationSchema 接受合法枚举值
- [ ] 非法枚举值（如 thinkingType:'foo'）被 Zod schema 拒绝
- [ ] 测试通过：`npx vitest run src/main/domains/conversation/__tests__/ --config vitest.backend.config.ts`

**步骤：**
1. 编写测试（service create/update 透传 / null→undefined 映射 + schema 合法接受 / 非法拒绝）
2. 运行测试，验证失败
3. 扩展 types + schema + service 透传逻辑
4. 运行测试，验证通过
5. 提交

---

### Task 4: IPC handler 集成验证

**目标：** 验证 conversations create/update handler 透传 Task 3 的 schema 校验结果与 service 返回值，确认 IPC 契约前后端一致。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#63-ipc-契约跨进程一致性铁律`

**需求描述：**
Zod schema 已在 Task 3 的 domain 层定义，ipc/conversations.ts 仅 import + `.parse()`，本任务不改 schema 定义。验证：create handler（`(_event, data: unknown)` 单参数对象形态）与 update handler（`(_event, id: unknown, data: unknown)` 两参数形态，id 单独传、data 是对象）经 wrapIpcHandler 包装，非法枚举值由 schema.parse 抛 ZodError 被 wrapIpcHandler 统一映射为 Invalid input 错误，合法值透传 service。确认 handler 无手写 try/catch、不做业务逻辑、透传 service 返回值。

**产出（Produces）：**
- 文件：`src/main/ipc/conversations.ts`（仅必要时调整 import，预期无实质改动）
- 模块：`registerConversationHandlers`（验证，无行为变更）

**消费（Consumes）：**
- Task 0：枚举值域（用于构造测试样本）
- Task 3：`createConversationSchema`/`updateConversationSchema` 已扩展、`CreateConversationInput`/`UpdateConversationInput` 新字段

**文件：**
- 修改：`src/main/ipc/conversations.ts`（仅 import 同步，预期无逻辑改动）
- 测试：`src/main/ipc/__tests__/integration.test.ts` 或 conversations handler 专属测试

**验收标准：**
- [ ] create handler 接受含 thinkingType/reasoningEffort 的对象，校验通过后透传 service 返回值
- [ ] update handler 两参数形态（id + data 对象），校验通过后透传
- [ ] 非法枚举值（如 thinkingType:'foo'）经 schema.parse 抛错，wrapIpcHandler 返回 Invalid input 格式错误
- [ ] handler 经 wrapIpcHandler 包装（不手写 try/catch）
- [ ] 测试通过：`npx vitest run --config vitest.backend.config.ts`（相关测试文件）

**步骤：**
1. 编写测试（合法枚举透传 / 非法枚举拒绝 / 两参数形态）
2. 运行测试，验证通过（schema 已在 Task 3 就绪，handler 透传）
3. 必要时同步 import
4. 提交

---

### Task 5: 代理协议转换修正（核心 bug 修复）

**目标：** 修正 request.ts 的思考参数转换——删除 reasoning_effort→thinking:{enabled,budget_tokens} 误转，改为 thinking 透传 + reasoning_effort↔output_config.effort 字段名转换，删除 budget_tokens 生成。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#3-转换契约修正现状缺陷`

**需求描述：**
**OpenAI→Anthropic（openaiToAnthropicRequest）**：删除现状 line 353-356 的 `if (openaiBody.reasoning_effort) result.thinking = {type:'enabled',budget_tokens:...}` 逻辑。改为：若 `openaiBody.thinking` 存在则 `result.thinking = openaiBody.thinking`（同结构透传）；若 `openaiBody.reasoning_effort` 存在则 `result.output_config = {effort: openaiBody.reasoning_effort}`。两维度独立处理，不再生成 budget_tokens。**Anthropic→OpenAI（anthropicToOpenAIRequest）**：删除现状 line 580-585 的 `thinking.enabled → reasoning_effort`（按 budget_tokens 反推 low/medium/high）逻辑。改为：若 `anthropicBody.thinking` 存在则 `result.thinking = anthropicBody.thinking`（透传）；若 `anthropicBody.output_config?.effort` 存在则 `result.reasoning_effort = anthropicBody.output_config.effort`。同协议透传（from===to）不变。

**产出（Produces）：**
- 文件：`src/main/proxy/converter/request.ts`
- 模块：`openaiToAnthropicRequest`（行为修正）、`anthropicToOpenAIRequest`（行为修正）

**消费（Consumes）：**
- 无（proxy/converter 独立模块，不消费其他任务产出）

**文件：**
- 修改：`src/main/proxy/converter/request.ts`
- 测试：`src/main/proxy/__tests__/converter.test.ts`

**验收标准：**
- [x] OpenAI→Anthropic：`reasoning_effort:'high'` → `output_config.effort:'high'`（不再生成 thinking/budget_tokens）
- [x] OpenAI→Anthropic：`thinking:{type:'adaptive'}` → 透传 `thinking:{type:'adaptive'}`
- [x] OpenAI→Anthropic：同时传 thinking + reasoning_effort → 两字段各自正确转换
- [x] OpenAI→Anthropic：都不传 → 转换后无 thinking 无 output_config
- [x] Anthropic→OpenAI：`output_config.effort:'max'` → `reasoning_effort:'max'`
- [x] Anthropic→OpenAI：`thinking:{type:'enabled'}` → 透传（不再反推 reasoning_effort）
- [x] 删除/改写 O→A 方向旧测试 `should map reasoning_effort to thinking budget_tokens`（converter.test.ts:212）为新行为
- [x] 删除/改写 A→O 方向旧测试 `should convert thinking enabled to reasoning_effort`（converter.test.ts:369）为新行为（thinking 透传，不再反推 reasoning_effort）
- [x] 测试通过：`npx vitest run src/main/proxy/__tests__/converter.test.ts --config vitest.backend.config.ts`

**步骤：**
1. 编写测试（两方向各维度转换 / 双维度同时 / 都不传）
2. 运行测试，验证失败（含改写旧测试）
3. 修正 request.ts 两方向转换逻辑
4. 运行测试，验证通过
5. 提交

---

### Task 6: preload 层签名扩展

**目标：** preload 的 conversations.create/update 签名扩展 thinkingType/reasoningEffort 可选参数，types.ts 同步 ElectronAPI 接口。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#63-ipc-契约跨进程一致性铁律`

**需求描述：**
`src/preload/index.ts` 的 conversations.create 入参对象增 `thinkingType?: ThinkingType`、`reasoningEffort?: ReasoningEffort`；update 入参对象（Record<string, unknown> 已宽泛，但为类型安全显式标注可选字段）同增。`src/preload/types.ts` 的 ElectronAPI.conversations.create/update 签名同步扩展。返回类型真实——create/update 返回类型派生自 `shared/types.ts` 的 `ConversationEntity`（preload 只允许 type-only 导入 shared，不依赖 renderer 的 Conversation 类型）。注意 update 是两参数形态 `(id: number, data: {...})`，create 是单参数对象形态 `(data: {...})`。类型同源派生自 Task 0 枚举。

**产出（Produces）：**
- 文件：`src/preload/index.ts`、`src/preload/types.ts`
- 模块：`ElectronAPI.conversations`（签名扩展）

**消费（Consumes）：**
- Task 0：`ThinkingType`、`ReasoningEffort` 枚举类型

**文件：**
- 修改：`src/preload/index.ts`
- 修改：`src/preload/types.ts`
- 测试：无（类型层变更，由 tsc 保证）

**验收标准：**
- [ ] preload conversations.create 入参类型含两可选字段
- [ ] preload conversations.update 入参类型含两可选字段
- [ ] ElectronAPI 接口同步扩展
- [ ] `npx tsc -b --noEmit` 通过

**步骤：**
1. 扩展 preload/index.ts conversations 签名
2. 扩展 preload/types.ts ElectronAPI 接口
3. 运行 `npx tsc -b --noEmit` 验证通过
4. 提交

---

### Task 7: 前端 Conversation 类型派生

**目标：** renderer 的 Conversation 类型派生新字段，供 UI 层使用。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#62-模块接口签名`

**需求描述：**
`src/renderer/lib/types.ts` 的 `Conversation` 接口增 `thinkingType?: ThinkingType`、`reasoningEffort?: ReasoningEffort`（从 shared/types 派生，禁止重新定义）。确保 window.electronAPI.conversations 返回的 Conversation 类型含新字段，UI 层可读取。

**产出（Produces）：**
- 文件：`src/renderer/lib/types.ts`
- 类型：`Conversation`（扩展）

**消费（Consumes）：**
- Task 0：`ThinkingType`、`ReasoningEffort` 枚举类型
- Task 6：preload ElectronAPI 返回类型含新字段

**文件：**
- 修改：`src/renderer/lib/types.ts`
- 测试：无（类型层）

**验收标准：**
- [ ] Conversation 接口含 thinkingType?、reasoningEffort? 两可选字段
- [ ] 类型从 shared/types 派生（type alias / import），未重新定义枚举
- [ ] `npx tsc -b --noEmit` 通过

**步骤：**
1. 扩展 Conversation 接口
2. 运行 `npx tsc -b --noEmit` 验证
3. 提交

---

### Task 8: ThinkingSettings UI 组件

**目标：** 新建思考设置 UI 组件——执行方式（disabled/enabled/adaptive）单选 + 强度（六枚举）下拉，disabled 时强度灰显。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#41-ui-布局`

**需求描述：**
新建 `src/renderer/features/chat/components/ThinkingSettings.tsx`。受控组件，props：`thinkingType: ThinkingType`、`reasoningEffort: ReasoningEffort`、`onThinkingTypeChange`、`onReasoningEffortChange`。执行方式用三个单选项（disabled/enabled/adaptive），强度用 Select 下拉（minimal/low/medium/high/xhigh/max）。当 thinkingType==='disabled' 时强度 Select 灰显（disabled）。遵守组件复用规则——用 `@/components/ui/select`、`@/components/ui/button` 或 RadioGroup，禁止原生 HTML 元素。文件名 PascalCase。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/ThinkingSettings.tsx`
- 模块：`ThinkingSettings` 组件

**消费（Consumes）：**
- Task 0：`ThinkingType`、`ReasoningEffort` 枚举类型

**文件：**
- 创建：`src/renderer/features/chat/components/ThinkingSettings.tsx`
- 测试：`src/renderer/features/chat/components/__tests__/ThinkingSettings.test.tsx`

**验收标准：**
- [ ] 渲染三个执行方式选项（disabled/enabled/adaptive）
- [ ] 渲染强度下拉，含六个枚举选项
- [ ] 切换执行方式触发 onThinkingTypeChange
- [ ] 切换强度触发 onReasoningEffortChange
- [ ] thinkingType=disabled 时强度下拉灰显（disabled 属性）
- [ ] 测试通过：`npx vitest run src/renderer/features/chat/components/__tests__/ThinkingSettings.test.tsx`

**步骤：**
1. 编写测试（渲染选项 / 切换回调 / disabled 灰显）
2. 运行测试，验证失败
3. 实现 ThinkingSettings 组件
4. 运行测试，验证通过
5. 提交

---

### Task 9: useChatStream 注入思考参数

**目标：** useChatStream 的 send/buildRequestBody 接收 thinkingConfig，按规则注入 thinking/reasoning_effort 到请求体。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#42-请求体组装规则`

**需求描述：**
`useChatStream.send` 签名增加第三参数 `thinkingConfig: { thinkingType: ThinkingType; reasoningEffort: ReasoningEffort }`。`buildRequestBody` 增加该参数，注入规则：`thinkingType==='disabled'` 时不注入任何思考字段；否则注入 `body.thinking = {type: thinkingType}` + `body.reasoning_effort = reasoningEffort`。保持现有 model/messages/stream 组装逻辑不变。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/hooks/useChatStream.ts`
- 模块：`useChatStream`（send/buildRequestBody 签名扩展）

**消费（Consumes）：**
- Task 0：`ThinkingType`、`ReasoningEffort` 枚举类型

**文件：**
- 修改：`src/renderer/features/chat/hooks/useChatStream.ts`
- 测试：`src/renderer/features/chat/hooks/__tests__/useChatStream.test.ts`（若不存在新建）

**验收标准：**
- [ ] thinkingType=disabled 时请求体不含 thinking、不含 reasoning_effort
- [ ] thinkingType=enabled 时请求体含 `thinking:{type:'enabled'}` + `reasoning_effort:<值>`
- [ ] thinkingType=adaptive 时请求体含 `thinking:{type:'adaptive'}` + `reasoning_effort:<值>`
- [ ] 原 model/messages/stream 组装不受影响
- [ ] 测试通过：`npx vitest run src/renderer/features/chat/hooks/__tests__/useChatStream.test.ts`

**步骤：**
1. 编写测试（三种模式请求体注入）
2. 运行测试，验证失败
3. 扩展 send/buildRequestBody 签名与注入逻辑
4. 运行测试，验证通过
5. 提交

---

### Task 10: useConversationManager 携带思考设置

**目标：** selectConversation 返回对话的思考设置；saveUserMessage/create 携带当前思考设置。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#73-状态管理`

**需求描述：**
`useConversationManager.selectConversation` 返回对象增 `thinkingType`、`reasoningEffort`（从 `api.conversations.get` 返回的 conv 读取，旧对话无值时返回默认 disabled/medium——UI 默认强度 medium，仅当 thinkingType≠disabled 时才外发）。`saveUserMessage` 新建对话时把当前思考设置传入 `api.conversations.create`；已有对话时若思考设置变化则调 `api.conversations.update` 更新。需要从调用方接收当前思考设置——扩展 `UseConversationManagerParams` 增加思考设置的 getter，或让 saveUserMessage 增加参数。按现有模式最小改动实现。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/hooks/useConversationManager.ts`
- 模块：`useConversationManager`（selectConversation 返回扩展、saveUserMessage 行为扩展）

**消费（Consumes）：**
- Task 0：`ThinkingType`、`ReasoningEffort` 枚举类型（参数标注）
- Task 6：`api.conversations.create/update` 接受 thinkingType/reasoningEffort
- Task 7：Conversation 类型含新字段

**文件：**
- 修改：`src/renderer/features/chat/hooks/useConversationManager.ts`
- 测试：`src/renderer/features/chat/hooks/__tests__/useConversationManager.test.ts`（若不存在新建）

**验收标准：**
- [ ] selectConversation 返回对话的 thinkingType/reasoningEffort（旧对话无值时返回默认 disabled/medium）
- [ ] saveUserMessage 新建对话时携带当前思考设置
- [ ] saveUserMessage 已有对话且思考设置变化时调 update 更新
- [ ] saveUserMessage 已有对话且思考设置未变时不调 update
- [ ] 测试通过：`npx vitest run src/renderer/features/chat/hooks/__tests__/useConversationManager.test.ts`

**步骤：**
1. 编写测试（selectConversation 返回 / saveUserMessage 新建携带 / update 触发条件）
2. 运行测试，验证失败
3. 扩展 selectConversation 返回 + saveUserMessage 携带逻辑
4. 运行测试，验证通过
5. 提交

---

### Task 11: useChatPage 思考状态编排 + Chat 页面集成

**目标：** useChatPage 持有 thinkingType/reasoningEffort 状态，切对话同步、修改持久化、发送时传给 useChatStream；Chat 页面集成 ThinkingSettings 组件。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#73-状态管理`

**需求描述：**
`useChatPage` 增加 `thinkingType`/`reasoningEffort` state（默认 disabled/medium），暴露 setter。切对话（handleSelectConversation）时从 selectConversation 返回值同步状态。修改思考设置时调 conversations.update 持久化（防抖或即时，按现有模式）。handleSend/handleRegenerate 调 send 时传入 thinkingConfig。Chat 页面渲染 ThinkingSettings 组件，绑定 useChatPage 暴露的思考状态与 setter。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/hooks/useChatPage.ts`、`src/renderer/pages/Chat.tsx`
- 模块：`useChatPage`（思考状态编排）、Chat 页面（集成 ThinkingSettings）

**消费（Consumes）：**
- Task 8：`ThinkingSettings` 组件
- Task 9：`useChatStream.send` 接受 thinkingConfig
- Task 10：`useConversationManager` selectConversation 返回思考设置、saveUserMessage 携带

**文件：**
- 修改：`src/renderer/features/chat/hooks/useChatPage.ts`
- 修改：`src/renderer/pages/Chat.tsx`
- 测试：`src/renderer/pages/__tests__/Chat.test.tsx`（已有，扩展）

**验收标准：**
- [ ] useChatPage 暴露 thinkingType/reasoningEffort 及 setter
- [ ] 切对话时思考状态同步为目标对话的设置
- [ ] 新建对话时思考状态默认 disabled/medium
- [ ] 修改思考设置触发 conversations.update 持久化
- [ ] handleSend/handleRegenerate 传 thinkingConfig 给 send
- [ ] Chat 页面渲染 ThinkingSettings 并双向绑定
- [ ] 测试通过：`npx vitest run src/renderer/pages/__tests__/Chat.test.tsx`

**步骤：**
1. 编写测试（状态同步 / 持久化 / 发送传参 / 渲染集成）
2. 运行测试，验证失败
3. useChatPage 加思考状态编排 + Chat 集成 ThinkingSettings
4. 运行测试，验证通过
5. 提交

---

### Task 12: 全量验证与集成

**目标：** 全量测试 + 类型检查 + lint，确认整体集成无回归。

**设计文档索引：** `docs/superpowers/specs/2026-06-19-thinking-param-passthrough-design.md#9-测试策略`

**需求描述：**
运行全量后端测试、前端测试、`npx tsc -b --noEmit`、`npm run lint`，确保所有任务产出集成后无类型错误、无测试回归、无 lint 错误。特别确认 converter 测试修订后无遗留旧断言、IPC 契约前后端类型一致、chat 页面端到端思考设置流转正确。

**产出（Produces）：**
- 无新文件（验证任务）

**消费（Consumes）：**
- Task 0-11 全部产出

**文件：**
- 无（仅运行验证命令）

**验收标准：**
- [ ] `npm test`（前端+后端全量）通过
- [ ] `npx tsc -b --noEmit` 通过
- [ ] `npm run lint` 通过
- [ ] 无遗留旧测试断言（reasoning_effort→thinking budget_tokens 已清除）
- [ ] 真实样本链路验证：chat 页面设 enabled+high → 请求体含 thinking+reasoning_effort → 代理转换后上游收到 thinking+output_config.effort

**步骤：**
1. 运行 `npm test`，修复任何回归
2. 运行 `npx tsc -b --noEmit`，修复类型错误
3. 运行 `npm run lint`，修复 lint 问题
4. 真实样本链路验证（debug 模式查 proxy-debug.log 确认转换后请求体）
5. 提交

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 0: 共享类型契约定义 | 无 | — |
| L0 | Task 1: conversations 表 schema 加列与迁移 | 无 | ✅ |
| L0 | Task 5: 代理协议转换修正 | 无 | ✅ |
| L1 | Task 2: conversations Repository 支持新字段读写 | Task 1 | ✅ |
| L1 | Task 6: preload 层签名扩展 | Task 0 | ✅ |
| L1 | Task 8: ThinkingSettings UI 组件 | Task 0 | ✅ |
| L1 | Task 9: useChatStream 注入思考参数 | Task 0 | ✅ |
| L2 | Task 3: conversation domain 类型、Zod schema 与服务层透传 | Task 0, Task 2 | ✅ |
| L2 | Task 7: 前端 Conversation 类型派生 | Task 0, Task 6 | ✅ |
| L3 | Task 4: IPC handler 集成验证 | Task 0, Task 3 | ✅ |
| L3 | Task 10: useConversationManager 携带思考设置 | Task 0, Task 6, Task 7 | ✅ |
| L4 | Task 11: useChatPage 思考状态编排 + Chat 页面集成 | Task 8, Task 9, Task 10 | ✅ |
| L5 | Task 12: 全量验证与集成 | Task 0-11 | — |

### 分层说明

- **L0**：三个无依赖基础任务——Task 0（类型契约）、Task 1（schema）、Task 5（proxy converter，独立模块）修改不同文件，安全并行。
- **L1**：依赖 L0 产出。Task 2 依赖 schema（Task 1）；Task 6/8/9 依赖 Task 0 枚举类型，改不同文件，并行。
- **L2**：Task 3 同时依赖 Task 0 类型与 Task 2 Repository 新签名；Task 7 依赖 Task 0 类型与 Task 6 preload 返回类型（type-only 依赖）。两者改不同文件，并行。
- **L3**：Task 4 依赖 domain schema（Task 3）；Task 10 依赖 Task 0/6/7，不同文件并行。
- **L4**：Task 11 集成层，依赖前端组件/hook（Task 8/9/10）。
- **L5**：Task 12 全量验证，依赖所有任务完成。
