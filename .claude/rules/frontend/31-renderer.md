---
description: 数据流规范（TanStack Query、hooks、queryKey、错误处理），始终加载
---

# 数据流

## CRUD 数据请求
- 所有 CRUD 数据请求通过 `lib/queries/` 封装，页面禁止直接调用 `useQuery` / `useMutation`
- `lib/api-client.ts` 仅封装 Chat 代理 HTTP 请求（SSE 流），不用于业务 CRUD

## hooks 职责
- hooks/ 的目录归属和层级定位见 `frontend/35-frontend-directory.md`
- hooks/ 返回纯数据，禁止返回 JSX
- 简单 CRUD 不写 hooks/（直接在 queries/ 中实现）

## queryKey 格式
采用 `['domain', 'action', ...params]` 层级化数组格式，禁止简单字符串数组。

```typescript
// ✅ 正确
queryKey: ['providers', 'list']
queryKey: ['conversations', 'getById', id]
queryKey: ['apiKeys', 'list', { providerId }]

// ❌ 错误
queryKey: ['providers']           // 缺少 action
queryKey: 'providers'             // 字符串格式
queryKey: ['all-providers']       // 非层级化
```

queryKey 包含对象时必须保证字段顺序稳定（按字母排序）且原始值不可变；推荐用基本类型展开（如 [domain, action, providerId, status]）而不是嵌对象，避免上游每次重建对象导致缓存失效

## 类型保护
- 查询列表/卡片展示场景必须通过 Omit/Pick 排除敏感字段（如 list 接口返回 `Omit<ProviderEntity, 'apiKey'>`）；编辑表单场景因业务需要读取 apiKey，可使用完整实体，但必须通过 `useEditProvider` 等专用 hook 获取，且禁止在公共列表组件中渲染 apiKey 字段

## 错误处理
- 禁止 `.catch(() => {})` 静默吞没错误
- 必须通过 `toast.error()` 上报用户可见错误；后台/调试错误使用 `console.error` 并附固定模块前缀（如 `[ChatStream] 'failed to ...'`）便于 DevTools 过滤；禁止 `.catch(() => {})` 静默吞错

## 禁止
- components/ 中使用 useQuery 或 useMutation（走 queries/）
- 业务 CRUD 使用 apiFetch（仅 Chat 流用 HTTP）
- 组件内直接 IPC 调用（必须封装在 hooks/ 或 queries/ 中）

```typescript
// ❌ 错误：组件内直接 useQuery
function ProviderList() {
  const { data } = useQuery({ queryKey: ['providers'], queryFn: () => api.providers.list() })
  return <Table data={data} />
}

// ❌ 错误：业务 CRUD 用 apiFetch
const providers = await apiFetch('/api/providers')

// ❌ 错误：组件内直接 IPC
const providers = await window.electronAPI.invoke('providers:list')

// ✅ 正确：通过 queries/ 封装
// lib/queries/providers.ts
export function useProviders() {
  return useQuery({ queryKey: ['providers', 'list'], queryFn: () => api.providers.list() })
}
// components/ProviderList.tsx
function ProviderList() {
  const { data } = useProviders()
  return <Table data={data} />
}
```
