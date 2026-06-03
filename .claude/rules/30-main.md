---
paths:
  - "src/main/**"
---

# Domain Pattern（每个 domain 必须遵循）

## 文件结构
domain/{name}/
├── {name}.service.ts   # 业务逻辑，唯一入口
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

## IPC handler 注册（ipc/index.ts）
```typescript
ipcMain.handle('{name}:list', async () => service.list())
ipcMain.handle('{name}:create', async (_event, data) => service.create(data))
ipcMain.handle('{name}:update', async (_event, id, data) => service.update(id, data))
ipcMain.handle('{name}:delete', async (_event, id) => service.remove(id))
```

# Proxy 路由约定（仅 Chat 代理端点使用 Hono）

> 业务 CRUD 全部走 IPC，不使用 Hono。以下仅适用 proxy 代理端点。

- 代理类：`/v1/chat/completions`（OpenAI 格式）、`/v1/messages`（Anthropic 格式）
- 工具类：`/v1/models`、`/health`
- 响应格式：成功直接返回 JSON，错误 `{ error: string }` + HTTP 状态码，流式 SSE

# 禁止
- IPC handler 中直接操作数据库（必须走 service）
- service 中直接操作 Request/Response（纯数据层）
- domain 目录中包含 Hono 路由文件（仅 proxy/server.ts 使用 Hono）
- IPC handler 的 data 参数使用隐式 any（必须有显式类型标注）
- IPC create/update handler 入口缺少 Zod `.parse()` 验证（schema.ts 为必须）
