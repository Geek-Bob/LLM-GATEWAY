# 重构遗留字段漂移修复 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。验收标准使用 checkbox（`- [ ]`）语法跟踪，步骤使用有序列表（`1. 2. 3.`）描述 TDD 工作流。

**目标：** 消除 9 处 interface 重复定义、引入 JSON 配置迁移框架、修复在线更新检查 BUG、恢复 CI、清理死代码

**架构：** 三批次串行交付。批次 1（v1.0.4 发版主线）包含字段同源化 + 迁移框架 + UI/logger 修复 + 类型补全；批次 2 改写 8 个测试文件并加防回归冒烟；批次 3 清理 `proxy.restart` 死代码。

**技术栈：** TypeScript 6 / Electron 42 / Hono 4 / sql.js / vitest 4 / React 19 / TanStack Query 5

**关联设计文档：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md`

---

## 批次 1 — v1.0.4 发版主线

### Task 1.1: 字段同源化 — 删 9 处 interface 重复定义

**目标：** 消除全仓 9 处违反"shared 单源"铁律的 interface 重复定义，回归到 `shared/types.ts` 单一源。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#13-全仓扫描的扩散结果`

**需求描述：**
全仓扫描发现 9 处 interface 在 main/preload/db 层被重复定义，与 `shared/types.ts` 中标准定义字段相同（仅 JSDoc 可能不同）。这违反了项目铁律"核心实体基础接口只在 shared/types.ts 定义"。本任务删除所有重复定义，改为从 `shared/types.ts` `import type`。9 处违规清单：`UpdateCheckResult`（manager.ts）、`UpdateConfig`（config.ts）、`CreateAgentInput`（preload/types.ts + db/agents.ts）、`UpdateAgentInput`（db/agents.ts）、`CreateAgentConfigInput`（preload/types.ts + db/agent-configs.ts）、`UpdateAgentConfigInput`（preload/types.ts）、`SwitchConfigInput`（preload/types.ts）。

**产出（Produces）：**
- 文件：5 个文件被修改（删除重复定义并添加 import）
- 模块：无新增模块（仅整理类型 import 路径）

**消费（Consumes）：**
- 无（Layer 0 任务，仅整理类型源）

**文件：**
- 修改：`src/main/update/manager.ts`（删 `UpdateCheckResult` 定义，import from shared）
- 修改：`src/main/update/config.ts`（删 `UpdateConfig` 定义，import from shared）
- 修改：`src/main/update/ipc.ts`（如已 import 自 `./config`，改 import 自 `shared/types`）
- 修改：`src/main/db/agents.ts`（删 `CreateAgentInput`/`UpdateAgentInput` 定义，import from shared）
- 修改：`src/main/db/agent-configs.ts`（删 `CreateAgentConfigInput` 定义，import from shared）
- 修改：`src/preload/types.ts`（删 `CreateAgentInput`/`CreateAgentConfigInput`/`UpdateAgentConfigInput`/`SwitchConfigInput` 4 处定义，已有 shared import 仅扩展）

**验收标准：**
- [ ] 全仓 `grep -E "^export interface (UpdateConfig|UpdateCheckResult|CreateAgentInput|UpdateAgentInput|CreateAgentConfigInput|UpdateAgentConfigInput|SwitchConfigInput) "` 仅 `src/shared/types.ts` 命中
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run test:frontend` 通过（已有测试无回归）
- [ ] 涉及 5 个文件每个独立 commit，commit message 中文，不含 AI 署名

**步骤：**
1. 用 LSP `findReferences` 或 Grep 列出每个 interface 的所有引用文件，确认 import path 影响范围
2. 逐文件修改：删本地 interface 定义 → 添加 `import type { Xxx } from '../../shared/types'`
3. 每个文件修改后立即运行 `npx tsc --noEmit` 验证类型
4. 全部修改完成后跑 `npm run lint && npm run test:frontend`
5. 5 个文件分别 commit（按 manager.ts → config.ts → ipc.ts → agents.ts → agent-configs.ts → preload/types.ts 顺序）
6. 提交后再 grep 一次验收命令，确认零命中

---

### Task 1.2: JSON 配置迁移框架 + update-config 迁移器

**目标：** 引入轻量 `core/config-migration.ts` 通用框架，并在 `update/config.ts` 注册迁移器修复 v1.0.2 升级用户的字段漂移问题。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#42-新增接口json-配置迁移框架`

**需求描述：**
建立 JSON 配置迁移的通用机制，避免下次字段重命名再爆同样 BUG。框架由 `ConfigMigrator<T>` 类型 + `applyMigrators<T>()` 函数构成（约 60 行手写代码，零业务知识）。在 `update/config.ts` 注册两个 migrator：`autoCheck → isAutoCheckEnabled`、`allowPrerelease → isPrereleaseAllowed`。`UpdateConfigManager.loadConfig()` 行为变化：`JSON.parse → applyMigrators → {...defaultConfig, ...raw, ...migrated} → 若 migrated 非空则 saveConfig 回写新 schema`，幂等。所有错误（migrator 抛异常、saveConfig 失败）仅 logger.warn 不阻塞主流程。

**产出（Produces）：**
- 文件：`src/main/core/config-migration.ts` — 通用迁移框架
- 文件：`src/main/core/__tests__/config-migration.test.ts` — 框架测试
- 模块：`ConfigMigrator<T>`（type alias）、`applyMigrators<T>()`（function）
- 修改：`UpdateConfigManager.loadConfig()` 行为（签名不变）

**消费（Consumes）：**
- Task 1.1：`UpdateConfig`（已统一为 shared/types.ts 唯一源）
- 现有：`core/logger.ts`（logger.warn）

**文件：**
- 创建：`src/main/core/config-migration.ts`
- 创建：`src/main/core/__tests__/config-migration.test.ts`
- 修改：`src/main/update/config.ts`（在 loadConfig 内调用 applyMigrators + 注册 2 个 migrator）
- 修改：`src/main/update/__tests__/config.test.ts`（扩展 7 个测试用例覆盖错误处理场景）

**验收标准：**
- [ ] `applyMigrators<T>(raw, migrators)` 函数存在且类型签名正确：`(raw: unknown, migrators: ConfigMigrator<T>[]) => Partial<T>`
- [ ] `ConfigMigrator<T>` 是 `(raw: unknown) => Partial<T>` 的 type alias
- [ ] `config-migration.test.ts` 全部用例通过：`npx vitest run src/main/core/__tests__/config-migration.test.ts --config vitest.backend.config.ts`
- [ ] `config.test.ts` 全部用例通过，含：
  - [ ] 文件不存在 → 返回 defaultConfig
  - [ ] 旧字段全集 `{autoCheck:false, allowPrerelease:true}` → 迁移后字段正确
  - [ ] 仅旧 `autoCheck` → 仅迁移该字段
  - [ ] 新字段直读 → 原值不变
  - [ ] 新旧共存 `{autoCheck:false, isAutoCheckEnabled:true}` → **新字段优先**（结果 true）
  - [ ] 迁移触发回写 → 二次读取，磁盘文件已含新字段名
  - [ ] 已迁移文件 → 不再触发回写（幂等）
  - [ ] 损坏 JSON → fallback 到 default，无 throw，调 logger.warn
  - [ ] migrator 内部抛异常 → fallback 到 default，无 throw
  - [ ] saveConfig 写盘失败 → logger.warn 调用，不阻塞主流程
- [ ] `npx tsc --noEmit` 通过
- [ ] commit message 中文，不含 AI 署名

**步骤：**
1. 编写 `config-migration.test.ts` 失败测试（applyMigrators 空数组/单 migrator/多 migrator 覆盖/raw 非对象）
2. 运行测试，验证失败
3. 实现 `config-migration.ts` 使测试通过
4. **提交 commit 1：`feat: 引入 JSON 配置迁移框架 core/config-migration.ts`**（框架与业务分离，便于回滚和 review）
5. 编写 `config.test.ts` 扩展用例（10 个场景）的失败测试
6. 运行测试，验证失败
7. 修改 `config.ts` 的 `loadConfig`：注册 2 个 migrator + 调用 applyMigrators + 条件回写
8. 运行测试，验证全部通过
9. 跑 `npm run test:backend` 整套验证无回归
10. **提交 commit 2：`fix: update-config.json 字段迁移修复升级用户偏好丢失`**

---

### Task 1.3: 修 UpdateButton.tsx error 路径

**目标：** 修复"网络/反序列化失败被误报为已是最新版本"的 UI BUG。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#44-修改接口updatebuttonhandlecheck`

**需求描述：**
当前 `handleCheck` 中 `if (result.isAvailable && result.version) ... else { toast.info('当前已是最新版本') }` 把所有非 available 路径都视为"最新版本"，包括 `result.error` 存在的失败场景。修改为：优先识别 `result.error` 字段，存在时 `toast.error('检查更新失败：' + result.error)` 并 early return；catch 块中也展示具体 e.message 而非通用文案。

**产出（Produces）：**
- 修改：`UpdateButton.handleCheck` 行为（签名不变）

**消费（Consumes）：**
- Task 1.1：`UpdateCheckResult`（统一类型）
- 现有：`sonner` 的 `toast`、`useCheckUpdate` mutation

**文件：**
- 修改：`src/renderer/features/update/components/UpdateButton.tsx`
- 修改：`src/renderer/features/update/components/__tests__/UpdateButton.test.tsx`

**验收标准：**
- [ ] `result.error` 非空时调用 `toast.error` 并展示具体错误信息（含 error 字符串内容）
- [ ] `mutateAsync` reject 时调用 `toast.error` 并包含 `e.message`
- [ ] `result.isAvailable=true && version` 时调用 `onUpdateAvailable(version)`
- [ ] `result.error=undefined && isAvailable=false` 时显示 `toast.info("当前已是最新版本")`
- [ ] `UpdateButton.test.tsx` 4 个用例全绿：`npx vitest run src/renderer/features/update/components/__tests__/UpdateButton.test.tsx`
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run lint` 通过
- [ ] **手动验收（端到端）**：在断网状态下点击"检查更新"按钮，toast 显示具体错误信息（如 `检查更新失败：connect ETIMEDOUT ...`）而非"当前已是最新版本"。此项为设计 §10.1 第 8 项端到端验证，必须人工执行
- [ ] commit message 中文，不含 AI 署名

**步骤：**
1. 在 `UpdateButton.test.tsx` 增加 2 个失败测试：result.error 存在 → toast.error；mutateAsync reject → toast.error
2. 运行测试，验证失败
3. 修改 `UpdateButton.tsx` 的 `handleCheck`：增加 `if (result.error)` 分支 + 优化 catch
4. 运行测试，验证全部通过
5. 跑 `npm run test:frontend && npm run lint` 整套验证
6. 提交

---

### Task 1.4: update-manager logger 写文件

**目标：** 给在线更新添加用户可见日志，让出错时能定位真实原因。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#45-修改接口updatemanager-内部-logger`

**需求描述：**
当前 `update-manager` 的 logger 仅输出 stdout，packaged Electron 用户永远看不到（`%APPDATA%/llm-gateway/` 下无 .log 文件）。改为在 `UpdateManager` constructor 内构造 logger 时传入 file transport：`{ file: path.join(app.getPath('userData'), 'logs', 'update.log'), truncate: false }`。注意 logger 必须延迟到 constructor 内创建（不能在模块顶层），因为 `app.getPath()` 需 app ready 后才能调用。日志格式遵循 `core/logger.ts` 既有规范：`[ISO 时间戳] [级别] [模块] 消息 {结构化 JSON metadata}`。

**产出（Produces）：**
- 修改：`UpdateManager` 内部 logger 构造方式
- 文件副作用：`%APPDATA%/llm-gateway/logs/update.log` 在用户机器上自动生成

**消费（Consumes）：**
- Task 1.1：因 Task 1.1 已修改 `manager.ts` 删除 `UpdateCheckResult` 重复定义，本任务在同一文件继续修改 logger 创建方式，必须在 Task 1.1 之后执行（同一文件冲突）
- 现有：`core/logger.ts` 的 `createLogger(moduleName, FileTransportOptions)`
- 现有：Electron `app.getPath('userData')`

**文件：**
- 修改：`src/main/update/manager.ts`
- 修改：`src/main/update/__tests__/manager.test.ts`

**验收标准：**
- [ ] logger 在 `UpdateManager` constructor 内创建（不在模块顶层）
- [ ] logger 创建参数包含 `file: path.join(app.getPath('userData'), 'logs', 'update.log')` 和 `truncate: false`
- [ ] `manager.test.ts` 已有用例全部保持通过：`npx vitest run src/main/update/__tests__/manager.test.ts --config vitest.backend.config.ts`
- [ ] 新增 1 个用例：mock `createLogger`，断言被调用时传入正确的 file 路径
- [ ] `npx tsc --noEmit` 通过
- [ ] commit message 中文，不含 AI 署名

**步骤：**
1. 在 `manager.test.ts` 增加 1 个失败测试：mock createLogger，断言传入 file 路径正确
2. 运行测试，验证失败
3. 修改 `manager.ts`：将 logger 创建从模块顶层移到 constructor，传入 FileTransportOptions
4. 运行测试，验证全部通过
5. 跑 `npm run test:backend` 验证无回归
6. 提交

---

### Task 1.5: 补 readConfigFile 类型声明

**目标：** 修复 `tsc -p tsconfig.web.json --noEmit` 的 TS2339 报错。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#46-新增接口windowelectronapiagentsreadconfigfile`

**需求描述：**
`src/preload/index.ts:175` 通过 `contextBridge` 暴露了 `electronAPI.agents.readConfigFile`，`src/preload/types.ts:143` 也定义了类型，但 `src/renderer/lib/types.ts:158-170` 的 `Window.electronAPI.agents` 子接口遗漏了该方法声明，导致 `src/renderer/lib/queries/agents.ts:81` 调用 `api.agents.readConfigFile(agentId!)` 触发 TS2339 编译错误。运行时该方法实际可用（preload 已暴露），仅类型声明缺失。修复仅在 `renderer/lib/types.ts` agents 子接口加一行 `readConfigFile: (agentId: number) => Promise<string>`，与 `preload/types.ts:143` 签名对齐。

**产出（Produces）：**
- 修改：`Window.electronAPI.agents` 类型声明完整化
- 文件：`src/renderer/lib/__tests__/types.test-d.ts` — type-only 测试

**消费（Consumes）：**
- 现有：`Window.electronAPI` 接口（在 renderer/lib/types.ts 定义）

**文件：**
- 修改：`src/renderer/lib/types.ts`
- 创建：`src/renderer/lib/__tests__/types.test-d.ts`

**验收标准：**
- [ ] `Window.electronAPI.agents` 接口包含 `readConfigFile: (agentId: number) => Promise<string>`
- [ ] `src/renderer/lib/queries/agents.ts:81` 调用处不再报 TS2339
- [ ] `tsc -p tsconfig.web.json --noEmit` 通过（无 TS2339 错误）
- [ ] `types.test-d.ts` 用例通过：`npx vitest run src/renderer/lib/__tests__/types.test-d.ts`
- [ ] `npx tsc --noEmit` 通过
- [ ] commit message 中文，不含 AI 署名

**步骤：**
1. 创建 `types.test-d.ts`：用 `expectTypeOf` 断言 `Window['electronAPI']['agents']['readConfigFile']` 类型签名为 `(agentId: number) => Promise<string>`
2. 运行测试，验证失败
3. 修改 `renderer/lib/types.ts` 的 agents 子接口添加该方法
4. 运行测试，验证通过
5. 跑 `tsc -p tsconfig.web.json --noEmit` 验证 TS2339 已消除
6. 提交

---

### Task 1.6: package.json 版本号 → 1.0.4

**目标：** 完成 v1.0.4 发版前最后一步版本号 bump。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#10-验收标准`

**需求描述：**
将 `package.json` 中 `"version": "1.0.3"` 改为 `"version": "1.0.4"`。这是发版前的最后步骤，必须在 1.1-1.5 全部完成、所有测试通过、整套验收 checklist 全绿后再做。

**产出（Produces）：**
- 修改：`package.json` 版本号

**消费（Consumes）：**
- Task 1.1-1.5：所有前置任务必须完成且验收通过

**文件：**
- 修改：`package.json`

**验收标准：**
- [ ] `package.json` 中 `"version"` 字段为 `"1.0.4"`
- [ ] `npm test` 全绿
- [ ] `npm run lint` 通过
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 成功（产出 `out/main`、`out/preload`、`out/renderer`）
- [ ] commit message 中文（建议 `chore: 版本号更新至 v1.0.4`），不含 AI 署名

**步骤：**
1. 验证 1.1-1.5 全部 commit 已存在
2. 修改 `package.json` 版本号
3. 跑全套验收：`npm test && npm run lint && npx tsc --noEmit && npm run build`
4. 提交

---

## 批次 2 — Repository 测试改写（CI 修复）

### Task 2.1: 改写 db/__tests__ 4 个 Repository 单测

**目标：** 修复因 Repository 重构导致的 4 个单元测试 import 失效问题，恢复 `npm run test:backend` 通过。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#72-批次-2-测试改写参照范式`

**需求描述：**
提交 `7e022a9` "统一 Repository 模式" 把 `db/*.ts` 从裸函数 export（如 `createProvider/listProviders`）改为工厂模式 `createXxxRepository(db)`，但 4 个测试文件未同步：`providers.test.ts`、`api-keys.test.ts`、`conversations.test.ts`、`logs.test.ts` 仍 import 已不存在的裸函数，`tsc` 报 TS2305、`vitest` 抛 `TypeError: createXxx is not a function`。本任务参照已正确实现的 `agents.test.ts` 范式，将 4 个测试文件全部改写为 `const repo = createXxxRepository(db); await repo.list()` 模式。注意所有调用必须 async/await 化。

**产出（Produces）：**
- 修改：4 个测试文件全部改为 Repository 模式
- 副作用：`npm run test:backend` 恢复通过

**消费（Consumes）：**
- 现有：`createProviderRepository`/`createApiKeyRepository`/`createConversationRepository`/`createLogRepository`（已存在）
- 范式：`src/main/db/__tests__/agents.test.ts` 作为参考样板

**文件：**
- 重写：`src/main/db/__tests__/providers.test.ts`
- 重写：`src/main/db/__tests__/api-keys.test.ts`
- 重写：`src/main/db/__tests__/conversations.test.ts`
- 重写：`src/main/db/__tests__/logs.test.ts`

**验收标准：**
- [ ] 4 个测试文件 import 仅来自 Repository 工厂（不含 `createProvider`/`createApiKey` 等已删除符号）
- [ ] 每个测试文件覆盖：`create + findById 一致性 / list 排序 / update 部分字段 / remove 后 findById null / 边界（空 db、不存在 id、unique 冲突）`
- [ ] `npx vitest run src/main/db/__tests__/ --config vitest.backend.config.ts` 全绿
- [ ] `npm run test:backend` 全绿
- [ ] `npx tsc --noEmit` 通过
- [ ] 每个文件独立 commit（4 个 commit），中文 message，不含 AI 署名

**步骤：**
1. Read `src/main/db/__tests__/agents.test.ts` 完整代码，理解 Repository 模式测试范式（内存 SQLite 初始化 + beforeEach 重置 + async/await 调用）
2. 对每个文件重复以下流程（先 providers 后 api-keys 后 conversations 后 logs）：
   1. 删除旧 import 和测试函数体
   2. 按 agents.test.ts 范式重写 import + setup + 全部 it 块
   3. 跑 `npx vitest run <该文件> --config vitest.backend.config.ts` 验证全绿
   4. 跑 `npx tsc --noEmit` 验证类型
   5. commit
3. 全部 4 个文件完成后跑 `npm run test:backend` 整体回归

---

### Task 2.2: 改写 proxy/__tests__ 3 个集成测试

**目标：** 修复 proxy 层 3 个集成测试因 Repository 重构导致的 import 失效。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#72-批次-2-测试改写参照范式`

**需求描述：**
proxy 层的 3 个集成测试文件（`integration.test.ts`、`server.test.ts`、`router.test.ts`）也 import 已不存在的裸函数（如 `createProvider`/`createApiKey` 用于测试数据准备）。改写为 `createXxxRepository(db)` 模式。这 3 个测试涉及完整 Hono 应用 + 上游 mock，比 db 层单测复杂，注意 fixture 数据准备方式同步更新。

**产出（Produces）：**
- 修改：3 个集成测试文件改为 Repository 模式

**消费（Consumes）：**
- Task 2.1 完成后再做（依赖 Repository 模式范式已稳定）
- 现有：所有 Repository 工厂

**文件：**
- 重写：`src/main/proxy/__tests__/integration.test.ts`
- 重写：`src/main/proxy/__tests__/server.test.ts`
- 重写：`src/main/proxy/__tests__/router.test.ts`

**验收标准：**
- [x] 3 个测试文件 import 不含已删除的裸函数符号（实际改写 5 个文件含 router/models.service ripple，`integration.test.ts` 实际位于 `src/main/ipc/__tests__/`）
- [x] 测试 fixture 数据通过 Repository 工厂创建
- [x] `npx vitest run src/main/proxy/__tests__/ --config vitest.backend.config.ts` 全绿
- [x] `npm run test:backend` 全绿（仅剩 11 个 sse-parser 失败为 pre-existing，与本任务无关）
- [x] `npx tsc --noEmit` 通过
- [x] 每个文件独立 commit，中文 message，不含 AI 署名（额外 1 commit 修生产代码异步 BUG，用户已授权扩展）

**步骤：**
1. Read 3 个测试文件，识别 fixture 数据准备方式
2. 对每个文件重复：
   1. 替换 fixture 数据准备代码为 Repository 工厂调用
   2. 跑 `npx vitest run <该文件> --config vitest.backend.config.ts` 验证全绿
   3. 跑 `npx tsc --noEmit`
   4. commit
3. 全部完成后跑 `npm run test:backend` 整体回归

---

### Task 2.3: 新增 Repository 模式防回归冒烟

**目标：** 防止未来类似的"重构遗失 export"再次悄无声息地断 CI。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#73-批次-2-防回归冒烟`

**需求描述：**
新增 `src/main/db/__tests__/repository-pattern-smoke.test.ts`，仅 import 所有 5 个 `createXxxRepository` 工厂，断言为 function 且工厂返回对象含约定方法（`list`/`findById`/`create`/`update`/`remove` 视各 Repository 实际接口而定）。后续任何 Repository 重构遗失 export，import 阶段即被冒烟测试捕获，CI 立即失败。

**产出（Produces）：**
- 文件：`src/main/db/__tests__/repository-pattern-smoke.test.ts`

**消费（Consumes）：**
- 现有：所有 `createXxxRepository` 工厂（实际为 7 个：providers/apiKeys/conversations/logs/agents/agent-configs/modelMappings；设计 §7.3 写"5 个"是描述性近似，本任务以 LSP 实际扫描结果为准）

**文件：**
- 创建：`src/main/db/__tests__/repository-pattern-smoke.test.ts`

**验收标准：**
- [x] 测试文件 import 全部 Repository 工厂（7 个）
- [x] 断言每个工厂 `typeof === 'function'`
- [x] 用 mock db 实例化每个 Repository，断言关键方法（视各 Repository 实际签名）存在
- [x] `npx vitest run src/main/db/__tests__/repository-pattern-smoke.test.ts --config vitest.backend.config.ts` 全绿（7 tests）
- [x] `npm run test:backend` 全绿（446/457，仅 11 个 sse-parser 为 pre-existing 失败）
- [x] `npx tsc --noEmit` 通过
- [x] commit message 中文，不含 AI 署名

**步骤：**
1. 用 LSP `documentSymbols` 列出 `src/main/db/*.ts` 所有 export 名为 `create*Repository` 的工厂
2. 编写测试：依次 import + 断言为 function + mock db 实例化 + 断言关键方法存在
3. 跑测试，验证全绿
4. 跑 `npm run test:backend` 整体回归
5. 提交

---

## 批次 3 — proxy.restart 死代码清理

### Task 3.1: 删除 proxy.restart 死代码

**目标：** 移除 6 处 `proxy.restart`/`proxy:restart`/`restartProxy` 相关定义（已 grep 验证零调用方）。

**设计文档索引：** `docs/superpowers/specs/2026-06-13-rename-debt-fix-design.md#103-批次-3-验收`

**需求描述：**
Workflow 验证 `proxy.restart` 在 renderer 层零调用，`useToggleProxy` 已通过 `stop() + setPort() + start()` 自行实现重启语义。本任务删除 6 处定义：`main/proxy/manager.ts` 的 `restartProxy` 函数、`main/ipc/proxy.ts` 的 import 和 handler、`preload/index.ts` 的 `restart` bridge 方法、`preload/types.ts` 的类型声明、`renderer/lib/types.ts` 的类型声明、`renderer/pages/__tests__/Chat.test.tsx` 的测试 mock。删除后再次 grep 三个 token 确认零命中。

**产出（Produces）：**
- 修改：6 个文件中的相关代码段被删除

**消费（Consumes）：**
- 已 grep 验证零调用（详见设计文档 §批次 3 前置验证步骤）

**文件：**
- 修改：`src/main/proxy/manager.ts`
- 修改：`src/main/ipc/proxy.ts`
- 修改：`src/preload/index.ts`
- 修改：`src/preload/types.ts`
- 修改：`src/renderer/lib/types.ts`
- 修改：`src/renderer/pages/__tests__/Chat.test.tsx`

**验收标准：**
- [ ] 删除前再次执行 `grep -rE "(proxy\.restart|proxy:restart|restartProxy)" src/` 确认调用方仍为 0（仅命中即将删除的定义点和 mock）
- [ ] 删除后 `grep -rE "(proxy\.restart|proxy:restart|restartProxy)" src/` 零命中
- [ ] `npm test` 全绿
- [ ] `npm run lint` 通过
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 成功
- [ ] 单 commit 完成（6 处删除属于同一逻辑变更），中文 message（建议 `refactor: 删除未使用的 proxy.restart 死代码`），不含 AI 署名

**步骤：**
1. 跑 `grep -rE "(proxy\.restart|proxy:restart|restartProxy)" src/` 记录初始命中清单（应为 6 处定义点 + mock，零调用方）
2. 按顺序删除：
   1. `main/proxy/manager.ts`：删 `restartProxy` 函数定义
   2. `main/ipc/proxy.ts`：删 `restartProxy` import 和 `proxy:restart` handler 注册
   3. `preload/index.ts`：删 `restart` bridge 方法
   4. `preload/types.ts`：删 `restart` 类型声明
   5. `renderer/lib/types.ts`：删 `restart` 类型声明
   6. `renderer/pages/__tests__/Chat.test.tsx`：删 `restart: vi.fn()` mock 项
3. 跑 `grep -rE "(proxy\.restart|proxy:restart|restartProxy)" src/` 确认零命中
4. 跑 `npm test && npm run lint && npx tsc --noEmit && npm run build`
5. 提交单 commit

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 1.1: 字段同源化 | 无 | — |
| L1 | Task 1.2: JSON 迁移框架 + update-config 迁移器 | Task 1.1 | — |
| L2 | Task 1.3: 修 UpdateButton.tsx error 路径 | Task 1.1 | ✅ |
| L2 | Task 1.4: update-manager logger 写文件 | Task 1.1 | ✅ |
| L2 | Task 1.5: 补 readConfigFile 类型声明 | 无（与 1.1 不冲突） | ✅ |
| L3 | Task 1.6: package.json 版本号 → 1.0.4 | Task 1.1, 1.2, 1.3, 1.4, 1.5 | — |
| L4 | Task 2.1: 改写 db/__tests__ 4 个 Repository 单测 | Task 1.6（v1.0.4 发布后） | — |
| L5 | Task 2.2: 改写 proxy/__tests__ 3 个集成测试 | Task 2.1 | — |
| L6 | Task 2.3: 新增 Repository 模式防回归冒烟 | Task 2.1, 2.2 | — |
| L4 | Task 3.1: 删除 proxy.restart 死代码 | Task 1.6（v1.0.4 发布后） | ✅（与 2.x 并行） |

> **批次 1 内部分层说明**：
> - **L0**：1.1（字段同源化）必须先做，是后续所有任务的类型基础
> - **L1**：1.2（迁移框架）依赖 1.1 统一后的 `UpdateConfig` 类型源
> - **L2**：1.3 / 1.4 / 1.5 三者修改不同文件，无相互依赖，可并行执行
>   - 1.3 修 UpdateButton.tsx + 测试（renderer 层）
>   - 1.4 修 manager.ts + 测试（main 层）
>   - 1.5 修 renderer/lib/types.ts + 新增 type-only 测试（renderer 层）
>   - 注意：1.3 和 1.5 都改 renderer 层但不同文件，安全
> - **L3**：1.6 必须最后做，依赖前面所有任务全部完成且验证通过

> **批次间依赖**：批次 2 与批次 3 可以并行（L4），但都必须等 v1.0.4 发布（Task 1.6 完成）后再开始，避免改动堆叠影响发版稳定性。
