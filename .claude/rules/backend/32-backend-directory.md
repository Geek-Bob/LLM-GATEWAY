---
description: 后端目录结构与导入规则（仅 main 进程）
---

# 目录结构
```
src/main/
├── index.ts               # 入口：窗口/Tray/启动
├── ipc/index.ts           # IPC handler 注册（全部业务 CRUD 在此）
├── db/                    # sql.js 数据库层
│   ├── connection.ts      # 连接管理
│   ├── schema.ts          # 建表
│   ├── providers.ts       # Provider CRUD
│   ├── api-keys.ts        # API Key CRUD
│   ├── conversations.ts   # Conversation CRUD
│   └── logs.ts            # NDJSON 日志写入/查询
├── domains/               # 业务逻辑层
│   └── {name}/
│       ├── {name}.service.ts   # 业务入口
│       ├── {name}.schema.ts    # Zod 校验（create/update 必须）
│       └── {name}.types.ts     # 类型定义
├── proxy/                 # HTTP 代理层（仅 Chat 用）
│   ├── server.ts          # Hono 应用 + 代理端点
│   ├── manager.ts         # 代理生命周期管理
│   ├── router.ts          # 模型→供应商路由
│   ├── forwarder.ts       # URL/Header 构建
│   ├── converter/         # OpenAI ↔ Anthropic 协议转换
│   │   ├── types.ts       # StreamContext、ProtocolFormat 共享类型
│   │   ├── request.ts     # convertRequest() 双向请求转换
│   │   ├── response.ts    # convertResponse() 非流式响应转换
│   │   ├── sse.ts         # convertSSEEvent() + SSE 状态机
│   │   └── index.ts       # barrel export，保持向前兼容
│   ├── middleware.ts      # Auth 中间件
│   └── rate-limiter.ts    # 限流
├── core/                  # 通用工具（不含业务逻辑）
│   └── logger.ts          # 统一日志（支持 file transport）
└── update/                # 自动更新模块
```

# 导入规则
- `domain/{name}.service.ts` → `core/` + `proxy/`（domain 不再有 .router.ts，走 IPC handler）
- `core/` 禁止导入 `domains/`（下层不能依赖上层）
- `proxy/` 禁止导入 `domains/`（工具层不含业务）

# Domain Pattern
- 每个 domain 有且仅一个 `service.ts` 作为业务入口
- 代理层/IPC 层禁止 `fs.appendFileSync` / `fs.readFileSync` — 统一用 `core/logger.ts` 的 file transport
