---
description: 模块边界规范（导入方向、编译隔离、类型共享）
---

# 单向依赖原则
模块间单向依赖，禁止反向引用。

```
pages/ → features/{name}/components/ + lib/queries/
features/{name}/components/ → components/ui/ + features/{name}/hooks/
features/{name}/hooks/ → lib/ipc.ts → preload IPC
features/{name}/queries/ → lib/ipc.ts → preload IPC
components/ui/ → 无外部依赖（仅 Radix + Tailwind）
```

# 禁止的导入方向
- `components/ui/` 不得导入 `features/`、`pages/`、`lib/queries/`
- `pages/` 不得直接导入 `shared/lib/`（应通过 `features/` 封装）
- `features/` 之间不得交叉导入

# 跨层依赖处理

## shared 层封装
`shared/lib/` 中的实现细节（如 `api-client.ts`、`shiki.ts`）应通过 `lib/` 中间层封装，再由 `components/ui/` 或 `features/` 导入。

```tsx
// ❌ components/ui/markdown.tsx 直接导入 shared 层实现细节
import { highlight } from '@/shared/lib/shiki'

// ✅ 通过 renderer lib 层封装
// lib/shiki.ts
export { highlight } from '@/shared/lib/shiki'

// components/ui/markdown.tsx
import { highlight } from '@/lib/shiki'
```

## pages 层封装
`pages/` 不得直接导入 `shared/lib/`，应通过 `features/` 封装。

```tsx
// ❌ pages/Chat.tsx 直接导入 shared 层
import { setApiKey } from '@/shared/lib/api-client'

// ✅ 通过 features/chat/hooks/ 封装
// features/chat/hooks/useChatApi.ts
import { setApiKey } from '@/shared/lib/api-client'
export function useChatApi() { ... }

// pages/Chat.tsx
import { useChatApi } from '@/features/chat/hooks/useChatApi'
```

# 检查清单
- [ ] `pages/` 不直接导入 `shared/lib/`（通过 `features/` 或 `lib/` 封装）
- [ ] `components/ui/` 不导入业务层代码
- [ ] 页面内的 `useQuery` / `useMutation` 全部抽取到 `lib/queries/`
- [ ] `features/` 之间不交叉导入组件或 hooks
- [ ] shared 层的实现细节通过 `lib/` 中间层封装
