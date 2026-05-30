---
paths:
  - "src/renderer/**"
---

# Feature Pattern（每个 feature 必须遵循）

## 文件结构
features/{name}/
├── components/   # 纯 UI 组件（props + 回调，无数据请求）
├── hooks/        # fetch/IPC 封装，返回 { data, error, isLoading }
├── queries/      # TanStack Query hooks（useQuery/useMutation）
└── index.ts      # 公共导出（可选）

## hooks/ 模板
```typescript
import { useState, useEffect } from 'react'
import { apiFetch } from '@/shared/lib/api-client'

export function use{Name}() {
  const [data, setData] = useState<Item[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setIsLoading(true)
    apiFetch('/v1/admin/{name}')
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false))
  }, [])

  return { data, isLoading, error }
}
```

## queries/ 模板
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/shared/lib/api-client'

export function use{Name}s() {
  return useQuery({
    queryKey: ['{name}s'],
    queryFn: () => apiFetch('/v1/admin/{name}s').then(r => r.json()),
  })
}
```

# 禁止
- 组件中直接调用 `fetch()` 或 `window.electronAPI`
- hooks/ 返回 JSX（纯数据层）
- components/ 中使用 useQuery（走 queries/）
- 跨 feature 导入组件或 hooks
