---
description: 数据流规范（TanStack Query、hooks、queryKey、错误处理），始终加载
---

# 数据流

## CRUD 数据请求
- 所有 CRUD 数据请求通过 `lib/queries/` 封装，页面禁止直接调用 `useQuery` / `useMutation`
- `lib/api-client.ts` 仅封装 Chat 代理 HTTP 请求（SSE 流），不用于业务 CRUD

## hooks 职责
- hooks/ 用于非 CRUD 复杂逻辑（SSE 流管理、状态机）
- 简单 CRUD 不写 hooks/（直接在 queries/ 中实现）
- hooks/ 返回纯数据，禁止返回 JSX

## queryKey 格式
采用 `['domain', 'action', ...params]` 层级化数组格式，禁止简单字符串数组。

## 类型保护
- renderer 层用 `Omit<ProviderEntity, 'apiKey'>` 保护敏感字段

## 错误处理
- 禁止 `.catch(() => {})` 静默吞没错误
- 必须通过 `toast.error()` 或 `logger.error()` 记录错误

## 禁止
- components/ 中使用 useQuery（走 queries/）
- 业务 CRUD 使用 apiFetch（仅 Chat 流用 HTTP）
