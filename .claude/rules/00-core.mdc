---
description: 全局禁止项和必须项，覆盖所有目录和文件类型
---

# 禁止
- console.log → 用 `core/logger.ts`
- IPC handler 暴露业务 CRUD（仅 apikey CRUD 除外）
- 组件内直接 fetch / IPC 调用 → 封装在 hooks/
- 跨 feature 导入（`features/chat` → `features/dashboard`）
- `core/` 中引入业务逻辑
- Tailwind 任意值 `h-[13px]` / `w-[27px]` 等

# 必须
- 数据请求走 TanStack Query（`queries/`），不得绕过
- 每个 domain 有且仅有一个 `service.ts` 作为业务入口
- 新功能遵循 TDD：Red → Green → Refactor
- Hono 路由：参数提取 → 调 service → 返回 Response（不超过 50 行）
- `shared/lib/api-client.ts` 统一封装所有 HTTP 请求
