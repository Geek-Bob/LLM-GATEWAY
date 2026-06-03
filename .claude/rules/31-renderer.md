---
paths:
  - "src/renderer/**"
---

# Feature Pattern（每个 feature 必须遵循）

## 文件结构
features/{name}/
├── components/   # 纯 UI 组件（props + 回调，无数据请求）
├── hooks/        # 复杂逻辑封装（非查询类，如 useChatStream、useConversationManager）
├── queries/      # TanStack Query hooks（useQuery/useMutation，所有 CRUD 走这里）
└── index.ts      # 公共导出（可选）

## queries/ 模板（CRUD 数据请求首选）
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'

export function use{Name}s() {
  return useQuery({
    queryKey: ['{name}s'],
    queryFn: () => api.{name}s.list(),
  })
}

export function useCreate{Name}() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateInput) => api.{name}s.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['{name}s'] })
  })
}
```

## hooks/ 使用场景
- hooks/ 用于**非 CRUD 复杂逻辑**（如 SSE 流管理、状态机、副作用协调）
- 简单 CRUD 数据请求不写 hooks/，直接用 queries/

# 禁止
- hooks/ 返回 JSX（纯数据层）
- components/ 中使用 useQuery（走 queries/）
- 跨 feature 导入组件或 hooks
- 业务 CRUD 使用 apiFetch（仅 Chat 流用 HTTP）
