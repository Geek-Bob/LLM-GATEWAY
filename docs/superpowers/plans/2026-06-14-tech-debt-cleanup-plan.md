# 技术债清理批次 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 修复 4 个独立技术债，让 `tsconfig.web.json` 全绿 + `sse-parser.test.ts` 11 个失败转绿。

**架构：** 4 个并行任务（文件零交集）+ 1 个合并验证任务。每个任务严格只动一个文件，不顺手重构。Task A 修生产代码（`extractFromAnthropicSSE` 行为对齐 JSDoc），Task B 重命名磁盘文件（绕过 Windows `core.ignorecase`），Task C 补测试 mock 缺失字段，Task D 补类型 re-export。

**技术栈：** TypeScript 6 + Vitest 4 + Electron 42 + electron-vite 5

**设计文档：** `docs/superpowers/specs/2026-06-14-tech-debt-cleanup-design.md`

---

## 文件结构（任务边界锁定）

```
本计划涉及 5 个文件，每个文件唯一归属一个任务（Task E 仅做合并验证，不改代码）：

src/main/ipc/sse-parser.ts                                  → Task A 独占
src/renderer/lib/queries/apikeys.ts → apiKeys.ts            → Task B 独占（git mv）
src/renderer/pages/__tests__/Chat.test.tsx                  → Task C 独占
src/renderer/lib/types.ts                                   → Task D 独占
（无新增文件）                                              → Task E 仅运行验证命令
```

---

## Task 1: SSE Parser 同时提取 thinking + text

**目标：** `extractFromAnthropicSSE` 行为对齐其 JSDoc 描述「提取所有文本片段」，使 `parseAnthropicSSE` 同时输出 `thinking_delta` 与 `text_delta` 内容。

**设计文档索引：** `docs/superpowers/specs/2026-06-14-tech-debt-cleanup-design.md#3-task-a--sse-parser-行为对齐` — spec-reviewer 对照原始规格验证

**需求描述：**
模块职责：`extractFromAnthropicSSE(jsonStr: string): string` 解析单行 SSE data 的 JSON，返回其中的文本内容。当前实现只看 `text_delta`，丢弃 `thinking_delta`，与函数 JSDoc 描述不一致，且导致 `parseAnthropicSSE` 在 deepseek/claude reasoning 场景下丢失推理过程文本。修复方式：复用文件内已有的 `tryExtractText(obj)`（已支持 text_delta + thinking_delta），让 `extractFromAnthropicSSE` 走 `JSON.parse` → `tryExtractText` 路径，对非法 JSON 返回 `''`。函数签名 `(jsonStr: string): string` 保持不变。约束：不改 `tryExtractText`、不改 `parseAnthropicSSE`、不改 `parseSSELine` 任何签名或实现；不动 `shared/sse-utils.ts`。

**产出（Produces）：**
- 文件：`src/main/ipc/sse-parser.ts` — 仅修改 `extractFromAnthropicSSE` 函数体（约 5-8 行）
- 模块：`extractFromAnthropicSSE`（签名不变，行为对齐 JSDoc）

**消费（Consumes）：**
- 无（Task 1 不依赖其他任务）

**文件：**
- 修改：`src/main/ipc/sse-parser.ts`
- 测试：`src/main/ipc/__tests__/sse-parser.test.ts`（既有，不修改）

**验收标准：**
- [x] `extractFromAnthropicSSE` 对 `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}` 返回 `"hello"`
- [x] `extractFromAnthropicSSE` 对 `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" Let me think"}}` 返回 `" Let me think"`
- [x] `extractFromAnthropicSSE` 对非法 JSON（如 `"not json"`）返回 `""`
- [x] `extractFromAnthropicSSE` 对其他类型（如 `message_start`、`ping`）返回 `""`
- [x] `parseAnthropicSSE` 对完整 SSE 文本（含 thinking_delta + text_delta）返回的数组**长度等于 thinking_delta 数量 + text_delta 数量**
- [x] `npx vitest run --config vitest.backend.config.ts src/main/ipc/__tests__/sse-parser.test.ts` 全部 27/27 通过
- [x] 函数签名 `(jsonStr: string): string` 不变
- [x] `tryExtractText` 与 `parseAnthropicSSE` 函数体不被本任务修改
- [x] `shared/sse-utils.ts` 不被本任务修改

**步骤：**
1. 阅读 `src/main/ipc/sse-parser.ts` 全文，理解 `tryExtractText` 与 `extractFromAnthropicSSE` 的现有实现差异
2. 阅读 `src/main/ipc/__tests__/sse-parser.test.ts` 了解 27 个用例（特别是 §142 起的 `parseAnthropicSSE - full stream with deepseek thinking` 与 §246 起的 `extracts thinking_delta content`）期望的语义
3. 运行 `npx vitest run --config vitest.backend.config.ts src/main/ipc/__tests__/sse-parser.test.ts` 确认 11 个用例失败、16 个用例通过（Red 基线）
4. 修改 `extractFromAnthropicSSE` 改为基于 `tryExtractText`：JSON.parse + try-catch 兜底非法 JSON
5. 再次运行测试，确认 27/27 全部通过（Green）
6. 通过 `git diff src/main/ipc/sse-parser.ts` 自审：未动 `tryExtractText` / `parseAnthropicSSE` 主体、未动 import、未引入新工具函数
7. 提交（commit message 范例：`fix(sse): extractFromAnthropicSSE 同时提取 thinking_delta 与 text_delta`）

---

## Task 2: apiKeys.ts 大小写归位

**目标：** 将 git index 与磁盘文件名统一为 camelCase `apiKeys.ts`，消除 TS1261 错误。

**设计文档索引：** `docs/superpowers/specs/2026-06-14-tech-debt-cleanup-design.md#4-task-b--apikeysts-大小写归位` — spec-reviewer 对照原始规格验证

**需求描述：**
模块职责：本任务不修改任何源代码逻辑，仅做文件重命名。Windows 默认 `git config core.ignorecase=true` 导致 git index 保留驼峰 `apiKeys.ts`，但 checkout 后磁盘被覆盖为小写 `apikeys.ts`，触发 `tsconfig.web.json` 的 `forceConsistentCasingInFileNames` 检测报 TS1261。修复方式：使用两步 `git mv`（先改临时名 `.tmp.ts`，再改回最终名 `apiKeys.ts`），强制 git 识别为重命名操作。两个 import 路径（`useChatPage.ts:23`、`ApiKeys.tsx:12`）已用驼峰 `'@/lib/queries/apiKeys'`，无需修改。命名规则参照 `.claude/rules/common/00-global.md:17`「工具 .ts 用 camelCase」。

**产出（Produces）：**
- 文件：`src/renderer/lib/queries/apiKeys.ts`（从 `apikeys.ts` 重命名而来，内容字节级不变）

**消费（Consumes）：**
- 无（Task 2 不依赖其他任务）

**文件：**
- 重命名：`src/renderer/lib/queries/apikeys.ts` → `src/renderer/lib/queries/apiKeys.ts`（git mv 两步）
- 不修改：`useChatPage.ts`、`ApiKeys.tsx`（import 路径已是驼峰）

**验收标准：**
- [x] `git ls-files | grep -i "lib/queries/apikey"` 仅输出 `src/renderer/lib/queries/apiKeys.ts`（一行，驼峰）
- [x] `node -e "console.log(require('fs').readdirSync('src/renderer/lib/queries').filter(x => x.toLowerCase().includes('apikey')))"` 输出 `[ 'apiKeys.ts' ]`（驼峰）
- [x] 文件内容与重命名前**字节级一致**（用 `git log --follow --stat src/renderer/lib/queries/apiKeys.ts` 确认仅有 rename 操作，无内容变化）
- [x] `useChatPage.ts:23` 和 `ApiKeys.tsx:12` 的 import 语句**未被修改**（grep 验证仍是 `'@/lib/queries/apiKeys'`）
- [x] `npx tsc --noEmit -p tsconfig.web.json` 不再报 TS1261 错误（其他 TS2xxx 错误本任务不负责消除）
- [x] `npm run dev` 与 `npm run build` 不引入新错误（构建产物完整）

**步骤：**
1. 运行 `git status -s` 确认工作树干净（无未提交变更）
2. 运行 `git ls-files src/renderer/lib/queries/` 与 `node -e "console.log(require('fs').readdirSync('src/renderer/lib/queries'))"` 记录现状（git 视角驼峰、磁盘视角小写）
3. 运行 `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep TS1261` 确认 1 处 TS1261（Red 基线）
4. 执行第一步重命名：`git mv src/renderer/lib/queries/apikeys.ts src/renderer/lib/queries/apiKeys.tmp.ts`
5. 执行第二步重命名：`git mv src/renderer/lib/queries/apiKeys.tmp.ts src/renderer/lib/queries/apiKeys.ts`
6. 运行 `git status` 确认 git 识别为 `renamed: apikeys.ts -> apiKeys.ts`
7. 运行 `git ls-files | grep -i apikey` 与 readdir 命令再次验证
8. 运行 `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep TS1261` 确认 TS1261 已消除（Green）
9. 运行 `grep -rn "queries/apikeys\|queries/apiKeys" src/renderer` 确认 import 路径未被改动
10. 提交（commit message 用 `refactor(queries): apiKeys.ts 大小写归位（修复 Windows core.ignorecase 漂移）`）

---

## Task 3: Chat.test.tsx mock 补齐 backend / models / agents

**目标：** 补齐 `window.electronAPI` mock 的 3 个缺失子接口，消除 `Chat.test.tsx` 的 TS2739 错误。

**设计文档索引：** `docs/superpowers/specs/2026-06-14-tech-debt-cleanup-design.md#5-task-c--chattesttsx-mock-补齐` — spec-reviewer 对照原始规格验证

**需求描述：**
模块职责：本任务不修改业务代码与 UI 行为，仅补齐测试 mock。`src/renderer/pages/__tests__/Chat.test.tsx:61` 的 `window.electronAPI = { ... }` 漏了 3 个子接口（`backend`、`models`、`agents`），导致类型不满足 `Window['electronAPI']` 触发 TS2739。修复方式：按 `src/renderer/lib/types.ts:90-170` 的 `Window['electronAPI']` 接口签名，在 mock 对象中补齐 3 个子接口的所有方法（用 `vi.fn()`，必要的方法给 `mockResolvedValue` 默认值），字段顺序与接口声明顺序保持一致便于阅读对照。约束：不改既有的 `_providerList`/`_apiKeyList` 等 mock 引用、不改 21 个测试用例本身、不改业务代码。

**产出（Produces）：**
- 文件：`src/renderer/pages/__tests__/Chat.test.tsx` — 仅在 `window.electronAPI = { ... }` 对象内补 3 个子接口

**消费（Consumes）：**
- 无（Task 3 不依赖其他任务）

**文件：**
- 修改：`src/renderer/pages/__tests__/Chat.test.tsx`

**验收标准：**
- [x] `window.electronAPI` mock 包含 `backend` 子接口，含 `isReady` 与 `onReady` 两个方法
- [x] `window.electronAPI` mock 包含 `models` 子接口，含 `list` 与 `mapping`（`mapping` 内含 `find`/`list`/`create`/`update`/`delete` 五方法）
- [x] `window.electronAPI` mock 包含 `agents` 子接口，含全部 12 个方法（`list`/`get`/`create`/`update`/`delete`/`listConfigs`/`getConfig`/`createConfig`/`updateConfig`/`deleteConfig`/`readConfigFile`/`switchConfig`）
- [x] mock 对象字段顺序与 `Window['electronAPI']` 接口声明顺序一致（`debug` → `backend` → `providers` → `apiKeys` → `logs` → `proxy`/或 `models`/`agents` → ... → `update`）
- [x] `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep "Chat.test.tsx"` 不再报 TS2739
- [x] `npx vitest run src/renderer/pages/__tests__/Chat.test.tsx` 通过用例数 ≥ 修复前通过用例数（不引入新失败）
- [x] 既有 `_providerList`/`_apiKeyList`/`_conversations*` 等 mock 引用变量未被改名或删除
- [x] 未新增 import、未删除 import

**步骤：**
1. 阅读 `src/renderer/lib/types.ts:84-173` 完整的 `Window['electronAPI']` 接口声明，列出所有子接口与方法
2. 阅读 `src/renderer/pages/__tests__/Chat.test.tsx:61-90` 现有 mock，标记出缺失的 3 个子接口
3. 运行 `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep "Chat.test.tsx"` 确认 TS2739（Red 基线）
4. 在 mock 对象中按接口声明顺序插入 `backend`/`models`/`agents` 三个子接口
5. 运行 `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep "Chat.test.tsx"` 确认 TS2739 消除（Green）
6. 运行 `npx vitest run src/renderer/pages/__tests__/Chat.test.tsx` 确认既有测试不被破坏
7. `git diff` 自审：未改动 mock 对象之外的内容
8. 提交（commit message 用 `test(chat): 补齐 window.electronAPI mock 缺失的 backend/models/agents 子接口`）

---

## Task 4: types.ts re-export AgentEntity / AgentConfigEntity

**目标：** `src/renderer/lib/types.ts` 对外 re-export `AgentEntity` 与 `AgentConfigEntity`，消除 3 处 TS2459。

**设计文档索引：** `docs/superpowers/specs/2026-06-14-tech-debt-cleanup-design.md#6-task-d--typests-re-export-agent-实体` — spec-reviewer 对照原始规格验证

**需求描述：**
模块职责：本任务仅在 `src/renderer/lib/types.ts` 顶部 import 块下方追加一行 `export type { AgentEntity, AgentConfigEntity }`，将两个 Agent 实体类型对外透传。当前 `types.ts:8-12` 已 `import type { ..., AgentEntity, AgentConfigEntity, ... } from '../../shared/types'`，但仅本地使用未对外暴露，导致 `features/agent/components/AgentList.tsx`、`AgentFormDialog.tsx`、`pages/Agents.tsx` 三处 `import type { AgentEntity, AgentConfigEntity } from '@/lib/types'` 触发 TS2459（"declares 'X' locally, but it is not exported"）。约束：保留既有的 `AgentResponse`/`AgentConfigResponse` 别名（其他文件仍在用），仅新增 export，不删除任何既有 export，不改 import 顺序。

**产出（Produces）：**
- 文件：`src/renderer/lib/types.ts` — 新增一行 `export type { AgentEntity, AgentConfigEntity }`

**消费（Consumes）：**
- 无（Task 4 不依赖其他任务）

**文件：**
- 修改：`src/renderer/lib/types.ts`

**验收标准：**
- [x] `src/renderer/lib/types.ts` 包含 `export type { AgentEntity, AgentConfigEntity }` 语句
- [x] `import type { AgentEntity, AgentConfigEntity } from '@/lib/types'` 在其他文件能成功解析（`features/agent/components/AgentList.tsx`、`AgentFormDialog.tsx`、`pages/Agents.tsx` 三处）
- [x] 既有 `export type AgentResponse = AgentEntity` 与 `export type AgentConfigResponse = AgentConfigEntity` **未被删除**
- [x] 既有 import 块（`import type { ProviderEntity, ApiKeyEntity, ..., AgentEntity, AgentConfigEntity, ..., ModelMapping, ModelInfo } from '../../shared/types'`）保持原样
- [x] `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep TS2459` 不再有 `AgentEntity` 或 `AgentConfigEntity` 相关错误
- [x] 不引入新 import（`AgentEntity` 与 `AgentConfigEntity` 已在 import 列表中）
- [x] 未修改 `types.ts` 内的接口定义（`LogEntry`、`DashboardStats`、`Window` 等）

**步骤：**
1. 阅读 `src/renderer/lib/types.ts:1-20` 现有 import 与 export 结构
2. 运行 `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep TS2459` 确认 3 处错误（Red 基线）
3. 在合适位置（`import type` 之后、`AgentResponse` 别名之前）追加 `export type { AgentEntity, AgentConfigEntity }` 一行
4. 运行 `npx tsc --noEmit -p tsconfig.web.json 2>&1 | grep TS2459` 确认相关错误消除（Green）
5. 运行 `grep -n "AgentResponse\|AgentConfigResponse" src/renderer/lib/types.ts` 确认两个别名仍在
6. `git diff src/renderer/lib/types.ts` 自审：仅新增 1 行 export
7. 提交（commit message 用 `fix(types): renderer/lib/types.ts re-export AgentEntity 与 AgentConfigEntity`）

---

## Task 5: 合并验证（五连绿门）

**目标：** 确认 4 个并行任务汇总后，五连绿门全部通过；版本提交点稳定可发布。

**设计文档索引：** `docs/superpowers/specs/2026-06-14-tech-debt-cleanup-design.md#10-验收标准汇总` — spec-reviewer 对照原始规格验证

**需求描述：**
模块职责：本任务不修改任何代码，仅做端到端集成验证。在 Task 1-4 全部完成后，运行五个验证命令并确认全部通过：(1) `npm test` 后端+前端测试全绿；(2) `npx tsc --noEmit` 主 tsc 0 错误；(3) `npx tsc --noEmit -p tsconfig.web.json` web tsc 0 错误（关键门）；(4) `npm run lint` 0 errors；(5) `npm run build` 三产物（main/preload/renderer）完整。任意一项失败 → 回退到对应 Task 修复 → 重新跑此任务。约束：不改任何源文件；不修复未在原 4 任务范围内的错误（如发现新增 TS 错误，记录但不动手，作为后续独立任务）。

**产出（Produces）：**
- 文件：无（仅执行验证命令）
- 制品：`out/main`、`out/preload`、`out/renderer` 三个构建产物（验证用，不入 git）
- 报告：合并验证摘要，附在最终提交消息中

**消费（Consumes）：**
- Task 1：`extractFromAnthropicSSE`（行为对齐后的 sse-parser）
- Task 2：`apiKeys.ts`（重命名后的查询文件）
- Task 3：`Chat.test.tsx`（mock 补齐后的测试）
- Task 4：`types.ts`（re-export 后的类型文件）

**文件：**
- 不修改任何源文件
- 测试：依赖 Task 1-4 各自验收标准内的测试

**验收标准：**
- [x] `npm test` 退出码 0（前端 + 后端全部测试通过）
- [x] `npx tsc --noEmit` 退出码 0（主 tsconfig 无错误）
- [x] `npx tsc --noEmit -p tsconfig.web.json` 退出码 0（web tsconfig 无错误，包括 TS1261/TS2459/TS2739 全部消除）
- [x] `npm run lint` 退出码 0（0 errors，warnings 数量不增长）
- [x] `npm run build` 退出码 0，且 `out/main/index.js`、`out/preload/index.js`、`out/renderer/index.html` 三文件存在
- [x] `git log --oneline -5` 显示 Task 1-4 的 4 个提交（commit message 符合中文规范）
- [x] 工作树干净（`git status -s` 无输出）
- [x] 撰写最终验证摘要（粘贴五条命令的退出码与关键指标）

**步骤：**
1. 确认 Task 1-4 全部已 commit（`git log --oneline -10` 应见 4 个新 commit）
2. 运行 `git status -s` 确认工作树干净
3. 串行运行五个门控命令，各自记录退出码与关键输出
4. 任一失败：识别失败归属哪个 Task → 暂停本任务 → 回退该 Task 派修复实现者 → 重新进入 Task 5
5. 全部通过：撰写五连绿摘要（命令 + 退出码 + 测试通过数 + tsc 错误数 + lint warnings 数 + build 产物大小）
6. 不需要新提交（本任务无源文件变更），直接更新本计划文件 checkbox 后向 Controller 报告完成

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 1: SSE Parser 同时提取 thinking + text | 无 | ✅ |
| L0 | Task 2: apiKeys.ts 大小写归位 | 无 | ✅ |
| L0 | Task 3: Chat.test.tsx mock 补齐 | 无 | ✅ |
| L0 | Task 4: types.ts re-export | 无 | ✅ |
| L1 | Task 5: 合并验证（五连绿门） | Task 1, 2, 3, 4 | — |

**并行性证明：**
- Task 1 修改 `src/main/ipc/sse-parser.ts`
- Task 2 重命名 `src/renderer/lib/queries/apikeys.ts → apiKeys.ts`
- Task 3 修改 `src/renderer/pages/__tests__/Chat.test.tsx`
- Task 4 修改 `src/renderer/lib/types.ts`

四个任务文件路径**两两无交集**，且 Consumes 列表均为空（不引用其他任务的 Produces）→ 安全并行。

Task 5 必须在 4 个 L0 任务完成后才能跑（验证命令依赖所有修改），属于自然 L1。

---

## 计划自审检查表

| 项 | 状态 |
|---|------|
| 所有任务有明确 Produces/Consumes 声明 | ✅ |
| 设计文档索引精确指向章节锚点（非整文件、非占位符） | ✅ |
| 无 TBD/TODO/「稍后实现」占位符 | ✅ |
| 验收标准用 checkbox（`- [ ]`），步骤用纯有序列表 | ✅ |
| 验收标准可被自动化验证（grep / vitest / tsc / build） | ✅ |
| 步骤不写实现代码，只描述工作流 | ✅ |
| Task 5 的 Consumes 引用真实存在的 Task 1/2/3/4 | ✅ |
| 计划与设计文档 §1.3 任务拆分一致（4 + 1） | ✅ |
| 计划与设计文档 §11 执行分层一致（L0 × 4 + L1 × 1） | ✅ |
| 命名规则引用准确（common/00-global.md:17） | ✅ |
