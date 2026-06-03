---
description: 全局禁止项和必须项，覆盖所有目录和文件类型
---

# 禁止
- console.log → 用 `core/logger.ts`
- 组件内直接 IPC 调用 → 封装在 hooks/ 或 queries/
- 跨 feature 导入（`features/chat` → `features/dashboard`）
- `core/` 中引入业务逻辑
- Tailwind 任意值 `h-[13px]` / `w-[27px]` 等
- 代理层/IPC 层使用 `fs.appendFileSync` / `fs.readFileSync` — 统一用 `core/logger.ts` 的 file transport
- IPC handler 中写业务逻辑（Map 聚合、数据转换等）— 委托给 domain service
- 单文件超过 500 行时必须按职责拆分（参考 converter.ts → converter/ 目录模式）

# 必须
- 数据请求走 TanStack Query（`queries/`），不得绕过
- 业务 CRUD 全部走 IPC（preload → ipcMain.handle）：providers / logs / stats / conversations / apiKeys
- 每个 domain 有且仅有一个 `service.ts` 作为业务入口
- 新功能 SDD（spec）→ TDD（Red → Green → Refactor），无例外
- `shared/lib/api-client.ts` 仅封装 Chat 代理 HTTP 请求（SSE 流），不用于业务 CRUD
- 所有代码必须加注释：导出函数/类必须有 JSDoc，关键逻辑分支必须有行内注释说明意图
- 技术架构变更后必须更新 `docs/ARCHITECTURE.md`：目录结构、数据流、模块职责描述与实际代码保持一致
