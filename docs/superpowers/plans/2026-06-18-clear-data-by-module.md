# 设置页一键清空数据（按模块勾选）实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 在 Settings 页新增"数据管理"区块，用户按模块勾选（业务数据/运行数据）后一键清空，输入文字"清空"强确认。

**架构：** 新增 `datamanagement` domain 作为跨聚合根清空编排器。业务数据（providers/model_mappings/api_keys/conversations）单事务原子清空；运行数据（统计表 + NDJSON 日志）分步清空。组合输入先业务后运行、各自独立、部分成功。Agent 配置完全不动。

**技术栈：** Electron 42 + Hono（代理层不涉及）+ sql.js/WASM + Zod 4.x + React 19 + TanStack Query 5 + Radix AlertDialog + vitest 4。

**设计文档：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md`

---

## 文件结构

### 后端（main 进程）

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/shared/types.ts` | 派生 `ClearDataInput` / `ClearDataResult` 共享类型 | 修改 |
| `src/main/db/providers.ts` | `createProviderRepository` 加 `clearAll()` | 修改 |
| `src/main/db/model-mappings.ts` | `createModelMappingRepository` 加 `clearAll()` | 修改 |
| `src/main/db/api-keys.ts` | `createApiKeyRepository` 加 `clearAll()` | 修改 |
| `src/main/db/conversations.ts` | `createConversationRepository` 加 `clearAll()` | 修改 |
| `src/main/db/logs-stats.ts` | `createLogStatsRepository` 加 `clearAll()` | 修改 |
| `src/main/db/logs-writer.ts` | 加 `resetLogs()` 裸函数导出（删文件+重置计数器） | 修改 |
| `src/main/domains/datamanagement/datamanagement.types.ts` | 类型派生（type alias） | 新增 |
| `src/main/domains/datamanagement/datamanagement.schema.ts` | Zod `clearDataSchema` | 新增 |
| `src/main/domains/datamanagement/datamanagement.service.ts` | `createDataManagementService(db)` 清空编排 | 新增 |
| `src/main/ipc/datamanagement.ts` | `registerDataManagementHandlers(db)` IPC handler | 新增 |
| `src/main/ipc/index.ts` | 注册 `registerDataManagementHandlers(db)` | 修改 |

### preload 桥接层

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/preload/types.ts` | `ElectronAPI` 接口加 `dataManagement` 命名空间声明 | 修改 |
| `src/preload/index.ts` | `contextBridge` 暴露 `dataManagement.clear` | 修改 |

### 前端（renderer 进程）

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/renderer/lib/queries/datamanagement.ts` | `useClearData()` mutation 封装 | 新增 |
| `src/renderer/features/datamanagement/components/DataManagementCard.tsx` | 勾选 + 触发按钮 | 新增 |
| `src/renderer/features/datamanagement/components/ClearDataDialog.tsx` | 强确认弹窗（AlertDialog + Input） | 新增 |
| `src/renderer/pages/Settings.tsx` | 插入"数据管理"Card | 修改 |

---

## Task 0: 共享类型契约定义

**目标：** 在 `shared/types.ts` 定义清空功能的跨进程共享类型，作为所有任务的契约基准。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#共享类型sharedtypests-派生`（对应第 8.1 节）

**需求描述：**
定义两个跨进程共享的接口。`ClearDataInput` 含 `business` 和 `operational` 两个 boolean 字段，标识要清空哪类数据。`ClearDataResult` 含 `business` 和 `operational` 两个字段，各为 `{ cleared: boolean }` 对象，报告各类清空结果。放在 `shared/types.ts` 末尾新增"数据管理类型"区块，注释风格与现有区块一致（如 `// ====== 数据管理类型（主进程/渲染进程共享） ======`）。

**产出（Produces）：**
- 类型：`ClearDataInput`（字段 `business: boolean`、`operational: boolean`）
- 类型：`ClearDataResult`（字段 `business: { cleared: boolean }`、`operational: { cleared: boolean }`）

**消费（Consumes）：**
- 无

**文件：**
- 修改：`src/shared/types.ts`
- 测试：`src/main/domains/datamanagement/__tests__/datamanagement.types.test-d.ts`（类型断言测试，验证类型结构）

**验收标准：**
- [ ] `ClearDataInput` 接口含且仅含 `business: boolean` 与 `operational: boolean` 两个字段
- [ ] `ClearDataResult` 接口的 `business` 和 `operational` 均为 `{ cleared: boolean }` 结构
- [ ] 类型断言测试通过：`npx vitest run src/main/domains/datamanagement/__tests__/datamanagement.types.test-d.ts`（或 `npx tsd` 视项目配置，类型测试文件 `.test-d.ts`）
- [ ] `npx tsc --noEmit` 全量类型检查通过（修改 shared/types.ts 后强制要求）

**步骤：**
1. 编写类型断言测试（`.test-d.ts`），用 `expectTypeOf` 验证 `ClearDataInput` 和 `ClearDataResult` 的字段结构
2. 运行测试，验证失败（类型未定义）
3. 在 `src/shared/types.ts` 末尾新增"数据管理类型"区块，定义两个 interface
4. 运行 `npx tsc --noEmit` 验证无编译错误
5. 运行类型测试，验证通过
6. 提交

---

## Task 1: 数据层 Repository clearAll（业务数据 4 表）

**目标：** 为 providers / model-mappings / api-keys / conversations 四个 Repository 各新增 `clearAll()` 方法，删除对应表全部行。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#84-repository-新增方法`（对应第 8.4 节）

**需求描述：**
在四个 Repository 工厂返回对象中各加一个 `clearAll(): Promise<void>` 方法。providers 执行 `DELETE FROM providers`；model-mappings 执行 `DELETE FROM model_mappings`；api-keys 执行 `DELETE FROM api_keys`；conversations 执行 `DELETE FROM conversations`（messages 表通过 `ON DELETE CASCADE` 自动级联清空，无需单独删 messages）。方法风格与现有 `remove(id)` 一致（async、无返回值、直接 prepare().run()）。每个方法配 JSDoc。

**产出（Produces）：**
- 方法：`createProviderRepository(db).clearAll`
- 方法：`createModelMappingRepository(db).clearAll`
- 方法：`createApiKeyRepository(db).clearAll`
- 方法：`createConversationRepository(db).clearAll`

**消费（Consumes）：**
- 无（数据层独立，db 实例由工厂参数注入）

**文件：**
- 修改：`src/main/db/providers.ts`
- 修改：`src/main/db/model-mappings.ts`
- 修改：`src/main/db/api-keys.ts`
- 修改：`src/main/db/conversations.ts`
- 测试：`src/main/db/__tests__/clear-all.business.test.ts`

**验收标准：**
- [ ] `providerRepo.clearAll()` 后 `SELECT COUNT(*) FROM providers` 为 0
- [ ] `modelMappingRepo.clearAll()` 后 `SELECT COUNT(*) FROM model_mappings` 为 0
- [ ] `apiKeyRepo.clearAll()` 后 `SELECT COUNT(*) FROM api_keys` 为 0
- [ ] `conversationRepo.clearAll()` 后 `SELECT COUNT(*) FROM conversations` 为 0，且关联的 `messages` 表也被清空（级联验证）
- [ ] 四个方法均为 `async` 返回 `Promise<void>`，配 JSDoc
- [ ] 测试使用内存数据库（sql.js WASM），不 mock 数据库操作
- [ ] 所有测试通过：`npx vitest run src/main/db/__tests__/clear-all.business.test.ts`

**步骤：**
1. 编写测试：用内存 db 插入若干 provider/mapping/apikey/conversation+message 记录，调用各 `clearAll()`，断言计数归零、messages 级联清空
2. 运行测试，验证失败（方法未定义）
3. 在四个 Repository 各实现 `clearAll()`
4. 运行测试，验证通过
5. 提交

---

## Task 2: 数据层 — 统计表 clearAll + 日志 resetLogs

**目标：** 为 `createLogStatsRepository` 加 `clearAll()`（删两张统计表），为 `logs-writer.ts` 加 `resetLogs()` 裸函数（删全部 NDJSON 文件 + meta + 重置模块计数器）。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#85-logs-writer-新增导出`（对应第 8.5 节）

**需求描述：**
`logStatsRepo.clearAll()` 依次执行 `DELETE FROM request_stats` 和 `DELETE FROM request_stats_provider`（两张表都要清）。

`resetLogs()` 是 `logs-writer.ts` 导出的裸函数（非 Repository，符合 NDJSON 模块豁免）。三步：① 删除 `logsDir` 下所有匹配 `/^logs-\d{4}\.ndjson$/` 的文件 + `logs-meta.json`；② 重置模块级变量 `currentFileNumber = 0`、`currentFileLines = 0`、`entryCounter = 0`；③ 不重建空文件（`createLogEntry` 已有首次写入初始化逻辑）。函数必须处理 `logsDir` 为 null 的情况（未初始化时安全 no-op 或抛明确错误，参考现有 `createLogEntry` 的 `'Logs directory not initialized'` 处理）。配 JSDoc 说明三步操作。

**产出（Produces）：**
- 方法：`createLogStatsRepository(db).clearAll`
- 函数：`logs-writer.ts#resetLogs()`（裸函数导出）

**消费（Consumes）：**
- 无

**文件：**
- 修改：`src/main/db/logs-stats.ts`
- 修改：`src/main/db/logs-writer.ts`
- 测试：`src/main/db/__tests__/clear-all.operational.test.ts`

**验收标准：**
- [ ] `logStatsRepo.clearAll()` 后 `SELECT COUNT(*) FROM request_stats` 和 `request_stats_provider` 均为 0
- [ ] `resetLogs()` 调用后，日志目录下所有 `logs-XXXX.ndjson` 文件被删除，`logs-meta.json` 被删除
- [ ] `resetLogs()` 后模块计数器归零：`getEntryCounter()` 返回 0、`getCurrentFileLines()` 返回 0
- [ ] `resetLogs()` 后再调用 `createLogEntry()` 能正常写入，自动创建 `logs-0001.ndjson`，计数器从 1 开始
- [ ] `resetLogs()` 在 `logsDir` 未初始化时不崩溃（抛 `'Logs directory not initialized'` 或安全跳过，与 `createLogEntry` 一致）
- [ ] 测试用临时目录隔离（不污染真实日志目录），用 `initLogsDir(tmpDir)` 初始化
- [ ] 所有测试通过：`npx vitest run src/main/db/__tests__/clear-all.operational.test.ts`

**步骤：**
1. 编写测试：用临时目录 `initLogsDir`，写入几条日志产生 `logs-0001.ndjson` + meta，调用 `resetLogs()`，断言文件删除 + 计数器归零；再调 `createLogEntry()` 验证能重建并从 1 计数；统计表插入数据后 `clearAll()` 验证清空
2. 运行测试，验证失败
3. 实现 `logStatsRepo.clearAll()` 和 `resetLogs()`
4. 运行测试，验证通过
5. 提交

---

## Task 3: datamanagement domain — schema + types

**目标：** 创建 `datamanagement` domain 的类型派生文件和 Zod 校验 schema。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#81-共享类型sharedtypests-派生`（对应第 8.1 节，schema 校验规则见第 7 节）

**需求描述：**
`datamanagement.types.ts` 通过 type alias 从 `shared/types.ts` 派生 `ClearDataInput` / `ClearDataResult`（`export type ClearDataInput = ... from shared`，遵循"domain types 文件只允许 type alias 派生，禁止重新定义同名 interface"规则）。

`datamanagement.schema.ts` 定义 `clearDataSchema = z.object({ business: z.boolean(), operational: z.boolean() })`，并在 `.refine` 或 `.superRefine` 中校验**至少一个为 true**（`business === false && operational === false` 时拒绝），refine 错误消息明确指向 `business`/`operational` 字段。导出 `clearDataSchema` 和解析后的类型 `ClearDataInputParsed = z.infer<typeof clearDataSchema>`。

**产出（Produces）：**
- 模块：`datamanagement.types.ts`（类型派生）
- 模块：`datamanagement.schema.ts`，导出 `clearDataSchema`、`ClearDataInputParsed`

**消费（Consumes）：**
- Task 0：`ClearDataInput`、`ClearDataResult`（从 shared/types 派生）

**文件：**
- 创建：`src/main/domains/datamanagement/datamanagement.types.ts`
- 创建：`src/main/domains/datamanagement/datamanagement.schema.ts`
- 测试：`src/main/domains/datamanagement/__tests__/datamanagement.schema.test.ts`

**验收标准：**
- [ ] `clearDataSchema.parse({ business: true, operational: false })` 成功
- [ ] `clearDataSchema.parse({ business: false, operational: true })` 成功
- [ ] `clearDataSchema.parse({ business: true, operational: true })` 成功
- [ ] `clearDataSchema.parse({ business: false, operational: false })` 抛 ZodError，错误消息涉及"至少一个"
- [ ] `clearDataSchema.parse({ business: 'yes', operational: true })` 抛 ZodError（非 boolean 拒绝）
- [ ] `clearDataSchema.parse({})` 抛 ZodError（缺字段拒绝）
- [ ] `datamanagement.types.ts` 仅 type alias 派生，无重复 interface 定义
- [ ] 所有测试通过：`npx vitest run src/main/domains/datamanagement/__tests__/datamanagement.schema.test.ts`

**步骤：**
1. 编写 schema 测试覆盖合法/非法/边界输入，验证具体错误字段
2. 运行测试，验证失败
3. 实现 `datamanagement.types.ts`（type alias 派生）和 `datamanagement.schema.ts`（含 refine 校验至少一个 true）
4. 运行测试，验证通过
5. 提交

---

## Task 4: datamanagement domain — service 清空编排

**目标：** 实现 `createDataManagementService(db)`，编排业务数据（事务原子）与运行数据（分步）清空，遵循先业务后运行、部分成功语义。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#86-service-工厂签名`（对应第 8.6 节，执行策略见第 5.1/5.2/5.3 节）

**需求描述：**
工厂内实例化 5 个 Repository（provider/modelMapping/apiKey/conversation/logStats）+ import `resetLogs` 裸函数。`clear(input)` 方法逻辑：

- 若 `input.business` 为 true：开 `BEGIN` 事务，依次调 4 个业务 Repository 的 `clearAll()`，全部成功 `COMMIT`；任一失败 `ROLLBACK` 并抛 `Failed to clear business data: {reason}`（reason 取 error.message）。业务失败则**不执行运行数据步骤**，整个 clear 失败。
- 若 `input.operational` 为 true（且业务步骤已成功或未要求业务）：调 `logStatsRepo.clearAll()` 和 `resetLogs()`，分步执行无事务；失败抛 `Failed to clear operational data: {reason}`。此时若业务已清空，属部分成功——错误消息需体现"业务数据已清空，运行数据清空失败"。
- 返回 `ClearDataResult`，对应字段 `{ cleared: true }`；未执行的类别不返回 cleared:true（或返回 `{cleared:false}`，由未要求该类决定）。
- 不引用 agentRepo（Agent 表完全不参与）。

事务用法遵循 `backend/33-data-access.md`：sql.js 无声明性 `db.transaction()`，用 `db.exec('BEGIN')`/`db.exec('COMMIT')`/`db.exec('ROLLBACK')` 显式控制，try/catch 中失败 ROLLBACK。

**产出（Produces）：**
- 模块：`createDataManagementService(db)`，方法 `clear(input: ClearDataInput): Promise<ClearDataResult>`
- 类型：`DataManagementService = ReturnType<typeof createDataManagementService>`

**消费（Consumes）：**
- Task 0：`ClearDataInput`、`ClearDataResult`
- Task 1：`createProviderRepository`/`createModelMappingRepository`/`createApiKeyRepository`/`createConversationRepository` 的 `clearAll`
- Task 2：`createLogStatsRepository` 的 `clearAll`、`resetLogs`
- Task 3：`clearDataSchema`（可选，service 内部假设输入已校验，但可导入类型）

**文件：**
- 创建：`src/main/domains/datamanagement/datamanagement.service.ts`
- 测试：`src/main/domains/datamanagement/__tests__/datamanagement.service.test.ts`

**验收标准：**
- [ ] `clear({business:true})` 清空 providers/model_mappings/api_keys/conversations 4 表，返回 `business.cleared === true`
- [ ] `clear({business:true})` 后 `agents` 和 `agent_configs` 表行数**不变**（Agent 保护验证，用 Repository 或直接 `db.prepare('SELECT COUNT(*)')` 只读查询断言，不经 service）
- [ ] `clear({operational:true})` 清空两张统计表 + 删除日志文件 + 重置计数器，返回 `operational.cleared === true`
- [ ] `clear({business:true, operational:true})` 先业务后运行，两者均 cleared:true
- [ ] 业务数据在事务中：若模拟中途失败（如 mock 某个 Repository.clearAll 抛错），`ROLLBACK` 后 4 表均未清空（原子性验证），抛 `Failed to clear business data: ...`
- [ ] 组合输入下运行数据失败时：业务已清空（不可回滚），抛 `Failed to clear operational data: ...`，且业务表确认为空
- [ ] 测试用内存数据库 + 临时日志目录，不 mock 内部 Repository（mock 外部文件系统或用真实临时目录）
- [ ] `messages` 表随 conversations 级联清空
- [ ] 所有测试通过：`npx vitest run src/main/domains/datamanagement/__tests__/datamanagement.service.test.ts`

**步骤：**
1. 编写 service 测试覆盖：单业务、单运行、组合、业务事务失败 ROLLBACK、运行失败部分成功、Agent 保护
2. 运行测试，验证失败
3. 实现 `createDataManagementService`（含事务 try/catch/ROLLBACK + 错误上下文格式）
4. 运行测试，验证通过
5. 提交

---

## Task 5: IPC handler + 注册

**目标：** 创建 `datamanagement:clear` IPC handler，经 `wrapIpcHandler` 包装，入口 Zod 校验；在 `ipc/index.ts` 注册。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#83-ipc-通道`（对应第 8.3 节，handler 规范见第 7 节）

**需求描述：**
`registerDataManagementHandlers(db)` 内创建 service，注册 `ipcMain.handle('datamanagement:clear', wrapIpcHandler(async (_event, data: unknown) => { const input = clearDataSchema.parse(data); return dataManagementService.clear(input) }, 'datamanagement:clear'))`。data 参数 `unknown` 强制走 `.parse()`。handler 内不写 try/catch、不写业务逻辑（委派 service）。在 `ipc/index.ts` 的 `setupIpcHandlers` 中调用 `registerDataManagementHandlers(db)`。

通道命名 `datamanagement:clear`（单数域，遵循 `backend/32-interface-contracts.md` 单实体域单数规则）。

**产出（Produces）：**
- 模块：`registerDataManagementHandlers(db)`
- IPC 通道：`datamanagement:clear`

**消费（Consumes）：**
- Task 3：`clearDataSchema`
- Task 4：`createDataManagementService`、`DataManagementService`

**文件：**
- 创建：`src/main/ipc/datamanagement.ts`
- 修改：`src/main/ipc/index.ts`
- 测试：`src/main/ipc/__tests__/datamanagement.test.ts`

**验收标准：**
- [ ] `datamanagement:clear` handler 经 `wrapIpcHandler` 包装（非裸 `ipcMain.handle`）
- [ ] data 参数标注 `unknown`，入口调用 `clearDataSchema.parse(data)`
- [ ] handler 委派 `service.clear(input)`，不做额外转换，返回值类型与 service 一致
- [ ] 合法输入（`{business:true}`）返回 `ClearDataResult` 结构
- [ ] 非法输入（`{business:false, operational:false}` 或非 boolean）被 ZodError 拦截，`wrapIpcHandler` 映射为 `{ error: 'Invalid input: ...' }`
- [ ] `ipc/index.ts` 中 `registerDataManagementHandlers(db)` 在 `setupIpcHandlers` 内被调用
- [ ] handler 内无手写 try/catch（除非分支处理特定错误，本任务无此需要）
- [ ] 所有测试通过：`npx vitest run src/main/ipc/__tests__/datamanagement.test.ts`

**步骤：**
1. 编写 IPC handler 集成测试：mock 或真实调用 service，验证合法输入返回结果、非法输入返回 `{error: 'Invalid input...'}`、handler 不吞错误
2. 运行测试，验证失败
3. 实现 `ipc/datamanagement.ts`，在 `ipc/index.ts` 注册
4. 运行测试，验证通过
5. 提交

---

## Task 6: preload 桥接层 — dataManagement 命名空间

**目标：** 在 preload 两处声明并实现 `dataManagement` API 命名空间，渲染进程可通过 `api.dataManagement.clear(input)` 调用。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#11-涉及文件清单`（修改清单中 preload 两处）

**需求描述：**
`preload/types.ts` 的 `ElectronAPI` 接口加 `dataManagement: { clear: (input: ClearDataInput) => Promise<ClearDataResult> }`（从 shared/types 导入类型，type-only）。`preload/index.ts` 的 `contextBridge.exposeInMainWorld` 加 `dataManagement: { clear: (input: ClearDataInput) => ipcRenderer.invoke('datamanagement:clear', input) }`。命名空间风格与现有 `providers`/`apiKeys` 一致（JSDoc 注释说明用途）。preload 只导入 shared 类型定义。

**产出（Produces）：**
- API：`window.electronAPI.dataManagement.clear(input)`（经 `api.dataManagement.clear` 暴露）

**消费（Consumes）：**
- Task 0：`ClearDataInput`、`ClearDataResult`（type-only 导入）
- Task 5：IPC 通道 `datamanagement:clear`（运行时 invoke 目标）

**文件：**
- 修改：`src/preload/types.ts`
- 修改：`src/preload/index.ts`
- 测试：类型层面由 `npx tsc --noEmit` 保证（preload 改动主要影响类型契约）

**验收标准：**
- [ ] `ElectronAPI` 接口含 `dataManagement: { clear: (input: ClearDataInput) => Promise<ClearDataResult> }`
- [ ] `preload/index.ts` 暴露 `dataManagement.clear`，调用 `ipcRenderer.invoke('datamanagement:clear', input)`
- [ ] preload 两处均 type-only 导入 shared 类型，不导入 main/renderer 运行时代码
- [ ] 通道名 `datamanagement:clear` 与 Task 5 注册的通道一致
- [ ] `npx tsc --noEmit` 通过（renderer 侧 `api.dataManagement.clear` 类型可解析）

**步骤：**
1. 修改 `preload/types.ts` 加接口声明
2. 修改 `preload/index.ts` 加 contextBridge 暴露
3. 运行 `npx tsc --noEmit` 验证类型契约贯通
4. 提交

> 说明：preload 桥接层无独立单元测试（属类型契约 + 1 行 invoke 转发），由 `tsc --noEmit` 和后续前端组件集成测试间接覆盖。

---

## Task 7: 前端 query 封装 — useClearData

**目标：** 创建 `lib/queries/datamanagement.ts`，封装 `useClearData()` mutation，成功后失效相关缓存。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#64-清空后处理`（对应第 6.4 节，queryKey 规范见 `frontend/31-renderer.md`）

**需求描述：**
`useClearData()` 返回 `useMutation`，`mutationFn` 调 `api.dataManagement.clear(input)`。`onSuccess` 根据 input 失效缓存：清空业务数据时 invalidate `['providers']`、`['modelMappings']`、`['apiKeys']`、`['conversations']`；清空运行数据时 invalidate `['logs']`、`['stats']`（用 `qc.invalidateQueries({ queryKey: [domain] })` 前缀失效，覆盖各 action）。`onError` 不在此处 toast（由调用组件处理，保持 query 层纯数据，遵循 `frontend/31-renderer.md`——组件决定错误 UI；或按项目惯例在 query onError 用 toast，参照现有 `useProviders` 无 onError、错误由组件处理的模式）。queryKey 不在此任务定义（本任务无 query，仅 mutation）。

**产出（Produces）：**
- Hook：`useClearData()`（mutation，接收 `ClearDataInput`）

**消费（Consumes）：**
- Task 0：`ClearDataInput`、`ClearDataResult`
- Task 6：`api.dataManagement.clear`

**文件：**
- 创建：`src/renderer/lib/queries/datamanagement.ts`
- 测试：`src/renderer/lib/queries/__tests__/datamanagement.test.ts`（mock `api.dataManagement.clear` + QueryClient，验证 onSuccess 调用 invalidateQueries）

**验收标准：**
- [ ] `useClearData()` 返回 useMutation 对象，mutate 时调用 `api.dataManagement.clear(input)`
- [ ] `onSuccess` 中：input.business=true 时调用 `qc.invalidateQueries({ queryKey: ['providers'] })`、`['modelMappings']`、`['apiKeys']`、`['conversations']`
- [ ] `onSuccess` 中：input.operational=true 时调用 `qc.invalidateQueries({ queryKey: ['logs'] })`、`['stats']`
- [ ] 组合输入时两组 invalidate 都触发
- [ ] 不在组件外直接调 IPC，通过 `api`（lib/ipc.ts）封装
- [ ] 所有测试通过：`npx vitest run src/renderer/lib/queries/__tests__/datamanagement.test.ts`

**步骤：**
1. 编写测试：mock `window.electronAPI.dataManagement.clear`，用 QueryClient 包装，触发 mutate，断言 `invalidateQueries` 被以正确 queryKey 调用
2. 运行测试，验证失败
3. 实现 `useClearData`（含条件性 invalidate 逻辑）
4. 运行测试，验证通过
5. 提交

---

## Task 8: 前端组件 — ClearDataDialog 强确认弹窗

**目标：** 创建 `ClearDataDialog` 组件，AlertDialog + Input，输入"清空"二字才启用确认按钮。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#63-强确认弹窗alertdialog`（对应第 6.3 节）

**需求描述：**
受控组件，props：`open: boolean`、`onOpenChange: (open: boolean) => void`、`selectedModules: { business: boolean; operational: boolean }`（展示"即将清空：..."列表）、`onConfirm: () => void`、`isPending?: boolean`（清空中状态）。

UI：`AlertDialog`（`components/ui/alert-dialog`）。标题"确认清空数据"。内容列出即将清空的模块名（业务数据/运行数据，根据 selectedModules 动态拼接）+ 警告"此操作不可恢复！"+ Input（`components/ui/input`）提示输入"清空"。确认按钮文字"确认清空"，destructive 变体，**仅当 Input 值 === '清空' 时 enabled**，否则 disabled。点击确认调 `onConfirm`。`isPending` 时禁用按钮并显示加载态。取消按钮调 `onOpenChange(false)`。

**禁止** `confirm()`/`alert()`/`window.confirm`（用 AlertDialog）。**禁止**原生 `<input>`（用 `components/ui/input`）。用 `userEvent` 测试交互。

**产出（Produces）：**
- 组件：`ClearDataDialog`

**消费（Consumes）：**
- 无（纯 UI 组件，props 驱动）

**文件：**
- 创建：`src/renderer/features/datamanagement/components/ClearDataDialog.tsx`
- 测试：`src/renderer/features/datamanagement/components/__tests__/ClearDataDialog.test.tsx`

**验收标准：**
- [ ] open=true 时弹窗渲染，标题"确认清空数据"
- [ ] 内容展示根据 selectedModules 拼接的"即将清空：业务数据、运行数据"（仅展示为 true 的）
- [ ] 展示"此操作不可恢复！"警告
- [ ] Input 初始为空时，"确认清空"按钮 disabled
- [ ] 输入非"清空"（如"清"或"clear"）时，按钮仍 disabled
- [ ] 输入"清空"时，按钮 enabled
- [ ] 点击"确认清空"（enabled 状态）调用 `onConfirm`
- [ ] 点击"取消"调用 `onOpenChange(false)`
- [ ] isPending=true 时按钮 disabled 且显示加载态
- [ ] 使用 `components/ui/alert-dialog` 和 `components/ui/input`，无原生元素/confirm/alert
- [ ] 所有测试通过：`npx vitest run src/renderer/features/datamanagement/components/__tests__/ClearDataDialog.test.tsx`

**步骤：**
1. 编写组件测试：渲染弹窗，用 `userEvent.type` 输入"清空"，断言按钮启用；输入其他值断言禁用；点击确认断言 onConfirm 调用
2. 运行测试，验证失败
3. 实现 `ClearDataDialog`（受控、条件启用按钮）
4. 运行测试，验证通过
5. 提交

---

## Task 9: 前端组件 — DataManagementCard + Settings 集成

**目标：** 创建 `DataManagementCard`（两个 Checkbox + 触发按钮 + 弹窗状态机），集成到 Settings 页"关于我们"Card 之前，串联 `useClearData` + `ClearDataDialog`。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#62-ui-布局`（对应第 6.2 节）和 `#61-页面集成`（对应第 6.1 节）

**需求描述：**
`DataManagementCard` 内部状态：`business`/`operational` 两个 boolean（Checkbox 受控）、`dialogOpen` boolean。

UI：Card（`components/ui/card`）标题"数据管理"+ 警示描述。两个 `components/ui/checkbox` 分别对应业务数据/运行数据，各配说明文案（业务数据："供应商配置 · 模型映射 · API 密钥 · 对话历史 (Agent 配置将保留)"；运行数据："请求日志 · 统计数据"）。底部"清空选中数据"按钮（`components/ui/button` destructive 变体），**两个 Checkbox 都未勾选时 disabled**。点击按钮打开 `ClearDataDialog`（传 selectedModules）。

`ClearDataDialog` 的 `onConfirm` 调用 `useClearData().mutateAsync({ business, operational })`：成功 → `toast.success('已清空选中数据')` + 关闭弹窗 + 重置 Checkbox；失败 → `toast.error(getErrorMessage(e))`。

在 `Settings.tsx` 的"关于我们"Card（带 Info 图标那个）**之前**插入 `<DataManagementCard />`，用 `motion.div variants={childVariants}` 包裹保持入场动画一致。

动画用 `motion.div` 包裹 Card（不用 motion.button 替代 Button）。颜色/圆角/阴影遵循 `frontend/37-visual-style.md`（Card 用 `rounded-xl` `shadow`）。

**产出（Produces）：**
- 组件：`DataManagementCard`（自包含状态机 + 弹窗）

**消费（Consumes）：**
- Task 7：`useClearData`
- Task 8：`ClearDataDialog`
- Task 0：`ClearDataInput`（类型）

**文件：**
- 创建：`src/renderer/features/datamanagement/components/DataManagementCard.tsx`
- 修改：`src/renderer/pages/Settings.tsx`
- 测试：`src/renderer/features/datamanagement/components/__tests__/DataManagementCard.test.tsx`

**验收标准：**
- [ ] 渲染"数据管理"Card，含两个 Checkbox 和"清空选中数据"按钮
- [ ] 两个 Checkbox 都未勾选时，按钮 disabled
- [ ] 勾选任一 Checkbox 后，按钮 enabled
- [ ] 点击按钮打开 `ClearDataDialog`，传入当前勾选状态
- [ ] 弹窗确认成功后：调用 `useClearData` 的 mutate（mock 验证调用参数匹配勾选），显示 `toast.success`，关闭弹窗，Checkbox 重置为未勾选
- [ ] 弹窗确认失败（mock mutate reject）时：显示 `toast.error(getErrorMessage(e))`，弹窗可保持或关闭（择一，测试断言一致即可）
- [ ] 使用共享组件（Card/Checkbox/Button/AlertDialog），无原生元素
- [ ] Settings 页"关于我们"Card 之前出现"数据管理"Card
- [ ] 入场动画用 `childVariants` 包裹，与 Settings 其他 Card 一致
- [ ] 所有测试通过：`npx vitest run src/renderer/features/datamanagement/components/__tests__/DataManagementCard.test.tsx`
- [ ] `npm run test:frontend` 前端全量测试通过

**步骤：**
1. 编写 DataManagementCard 组件测试：勾选状态切换、按钮启用条件、打开弹窗、确认成功/失败两条路径（mock useClearData 的 mutateAsync）
2. 运行测试，验证失败
3. 实现 `DataManagementCard`（状态机 + 弹窗串联 + toast）
4. 修改 `Settings.tsx` 插入 `<DataManagementCard />`
5. 运行组件测试 + `npm run test:frontend`，验证通过
6. 提交

---

## Task 10: 全量验证 + 类型检查 + Lint

**目标：** 全栈集成验证，确保新增代码与现有代码协同无冲突。

**设计文档索引：** `docs/superpowers/specs/2026-06-18-clear-data-by-module-design.md#12-实施顺序`（对应第 12 节）

**需求描述：**
运行全量测试、类型检查、Lint，确保无回归。重点验证：分层导入约束（`backend/30-layered-architecture.md`）未被破坏——`domains/datamanagement/` 不导入 `proxy/`；`ipc/datamanagement.ts` 不直接导入 `db/` 业务函数；renderer 不直接 import main；preload 只 type-only 导入 shared。

**产出（Produces）：**
- 无新增文件，验证既有产出集成正确

**消费（Consumes）：**
- Task 0-9 全部产出

**文件：**
- 无修改（纯验证任务）

**验收标准：**
- [ ] `npm test`（前端 + 后端全量）通过
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run build` 全量构建通过（electron-vite 三进程构建）
- [ ] 分层导入约束检查：`grep -r "from.*proxy" src/main/domains/datamanagement/` 无结果；`grep -r "from.*db/" src/main/ipc/datamanagement.ts` 仅 type-only（Database 类型）
- [ ] 无 `console.log`（用 logger）、无 `confirm()`/`alert()`

**步骤：**
1. 运行 `npm test`，修复任何失败
2. 运行 `npx tsc --noEmit`，修复类型错误
3. 运行 `npm run lint`，修复 lint 问题
4. 运行 `npm run build`，修复构建问题
5. 检查分层导入约束（Grep 验证）
6. 提交（如有修复）

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 0: 共享类型契约定义 | 无 | — |
| L1 | Task 1: 业务数据 4 表 clearAll | 无（数据层独立） | ✅ |
| L1 | Task 2: 统计表 clearAll + resetLogs | 无（数据层独立） | ✅ |
| L1 | Task 3: schema + types | Task 0 | ✅ |
| L2 | Task 4: service 清空编排 | Task 0, 1, 2, 3 | — |
| L3 | Task 5: IPC handler + 注册 | Task 3, 4 | — |
| L3 | Task 6: preload 桥接层 | Task 0, 5 | ✅ |
| L4 | Task 7: useClearData query | Task 0, 6 | — |
| L4 | Task 8: ClearDataDialog 组件 | 无（纯 UI） | ✅ |
| L5 | Task 9: DataManagementCard + Settings 集成 | Task 7, 8, 0 | — |
| L6 | Task 10: 全量验证 | Task 0-9 | — |

### 依赖说明

- **L0**：`ClearDataInput`/`ClearDataResult` 是全链路契约，最先定义
- **L1 并行三任务**：Task 1（业务 4 表）、Task 2（统计+日志）、Task 3（schema/types）修改不同文件、无相互引用，可并行
- **L2**：Task 4 service 同时消费 Task 1/2 的 `clearAll`/`resetLogs` 和 Task 3 的 schema 类型，必须串行
- **L3 并行两任务**：Task 5（IPC）依赖 service；Task 6（preload）依赖 IPC 通道 + 类型，但 preload 仅声明契约不运行 service，可与 Task 5 同层（修改不同文件 preload/ vs ipc/）
- **L4 并行两任务**：Task 7（query）依赖 preload API；Task 8（Dialog）是纯 UI 无依赖，可并行
- **L5**：Task 9 集成串联 Task 7+8，串行
- **L6**：Task 10 全量验证收尾

### 关键路径

`Task 0 → 3 → 4 → 5 → 6 → 7 → 9 → 10`（含类型契约的主链路），L1 的 Task 1/2 可在 Task 0 后并行插入。
