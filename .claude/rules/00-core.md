---
description: 全局禁止项和必须项，覆盖所有目录和文件类型
---

# 禁止
- console.log → 用 `core/logger.ts`
- 组件内直接 IPC 调用 → 封装在 hooks/ 或 queries/
- 跨 feature 导入（`features/chat` → `features/dashboard`）
- `core/` 中引入业务逻辑
- Tailwind 任意值 `h-[13px]` / `w-[27px]` 等
- 业务数据 CRUD 走 HTTP（唯一例外：Chat 对话流走代理 HTTP 8080 验证代理能力）

# 必须
- 数据请求走 TanStack Query（`queries/`），不得绕过
- 业务 CRUD 全部走 IPC（preload → ipcMain.handle）：providers / logs / stats / conversations / apiKeys
- 每个 domain 有且仅有一个 `service.ts` 作为业务入口
- 新功能遵循 TDD：Red → Green → Refactor
- `shared/lib/api-client.ts` 仅封装 Chat 代理 HTTP 请求（SSE 流），不用于业务 CRUD
