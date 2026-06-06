---
description: Feature 模式 + 数据流规范，始终加载
---

# Feature Pattern

## 文件结构
每个 feature 必须包含：components/（纯 UI）、hooks/（复杂逻辑）、queries/（TanStack Query hooks）、index.ts（可选导出）。

## 数据流
- 所有 CRUD 数据请求通过 `lib/queries/` 封装，页面禁止直接调用 `useQuery` / `useMutation`
- `shared/lib/api-client.ts` 仅封装 Chat 代理 HTTP 请求（SSE 流），不用于业务 CRUD
- hooks/ 用于非 CRUD 复杂逻辑（SSE 流管理、状态机），简单 CRUD 不写 hooks/

## queryKey 格式
采用 `['domain', 'action', ...params]` 层级化数组格式，禁止简单字符串数组。

## 错误处理
- 禁止 `.catch(() => {})` 静默吞没错误
- 必须通过 `toast.error()` 或 `logger.error()` 记录错误

## 禁止
- hooks/ 返回 JSX（纯数据层）
- components/ 中使用 useQuery（走 queries/）
- 组件内直接 IPC 调用（封装在 hooks/ 或 queries/）
- 跨 feature 导入组件或 hooks
- 业务 CRUD 使用 apiFetch（仅 Chat 流用 HTTP）
- Tailwind 任意值 `h-[13px]` / `w-[27px]` 等
