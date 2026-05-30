---
paths:
  - "src/main/**"
---

# Domain Pattern（每个 domain 必须遵循）

## 文件结构
domain/{name}/
├── {name}.service.ts   # 业务逻辑，唯一入口
├── {name}.router.ts    # Hono 路由（≤50 行）
├── {name}.schema.ts    # Zod 校验（可选）
└── {name}.types.ts     # 类型定义（可选）

## service.ts 模板
```typescript
import { getDatabase } from '../../core/database'

export function create{Name}Service(db: ReturnType<typeof getDatabase>) {
  return {
    list: async () => { ... },
    getById: async (id: number) => { ... },
    create: async (data: CreateInput) => { ... },
    update: async (id: number, data: UpdateInput) => { ... },
    remove: async (id: number) => { ... },
  }
}

export type {Name}Service = ReturnType<typeof create{Name}Service>
```

## router.ts 模板
```typescript
import { Hono } from 'hono'
import type { {Name}Service } from './{name}.service'

export function create{Name}Router(service: {Name}Service) {
  const router = new Hono()

  router.get('/', async (c) => {
    const items = await service.list()
    return c.json(items)
  })

  router.post('/', async (c) => {
    const body = await c.req.json()
    const item = await service.create(body)
    return c.json(item, 201)
  })

  return router
}
```

# 禁止
- router 中直接操作数据库（必须走 service）
- service 中直接操作 Request/Response（纯数据层）
- 在 `server/` 中写任何业务路由逻辑
