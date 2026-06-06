---
description: 数据流规范（TanStack Query、IPC 调用、状态管理）
---

# TanStack Query 规范

## 数据请求入口
所有 CRUD 数据请求通过 `lib/queries/` 封装，页面和组件禁止直接调用 `useQuery` / `useMutation`。

```tsx
// ❌ 页面内直接定义 useQuery
function ModelMappingsPage() {
  const { data } = useQuery({
    queryKey: ['modelMappings'],
    queryFn: () => api.modelMappings.list(),
  })
}

// ✅ 抽取到 lib/queries/modelMappings.ts
// lib/queries/modelMappings.ts
export function useModelMappings() {
  return useQuery({
    queryKey: ['modelMappings', 'list'],
    queryFn: () => api.modelMappings.list(),
  })
}

// pages/ModelMappings.tsx
import { useModelMappings } from '@/lib/queries/modelMappings'
```

## queryKey 格式
采用 `['domain', 'action', ...params]` 格式，便于未来缓存管理。

```tsx
// ❌ 简单字符串数组
queryKey: ['providers']
queryKey: ['logs']

// ✅ 层级化数组
queryKey: ['providers', 'list']
queryKey: ['providers', 'detail', id]
queryKey: ['logs', 'list', page, pageSize]
queryKey: ['stats', 'hourly']
```

# 错误处理规范
禁止静默吞没错误（`.catch(() => {})`），必须通过 `toast.error()` 或 `logger.error()` 记录。

```tsx
// ❌ 静默吞没错误
api.conversations.addMessage(...)
  .then(() => { ... })
  .catch(() => {})

// ✅ 记录错误并提示用户
api.conversations.addMessage(...)
  .then(() => { ... })
  .catch((error) => {
    logger.error('Failed to save message', { error })
    toast.error('保存消息失败')
  })
```

# IPC 类型安全
IPC handler 的 `data` 参数必须有显式类型标注，禁止隐式 `any`。

```tsx
// ❌ 隐式 any
ipcMain.handle('modelMappings:list', async (_event, data) => { ... })

// ✅ 显式类型
ipcMain.handle('modelMappings:list', async (_event: IpcMainInvokeEvent) => { ... })
```

# 检查清单
- [ ] 所有 CRUD 数据请求通过 `lib/queries/` 封装
- [ ] 页面不直接调用 `useQuery` / `useMutation`
- [ ] queryKey 使用数组格式 `['domain', 'action', ...params]`
- [ ] `.catch()` 中记录错误（toast 或 logger），不静默吞没
- [ ] IPC handler 的 `data` 参数有显式类型标注
