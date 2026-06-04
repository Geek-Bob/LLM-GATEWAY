---
description: 目录边界、导入规则、类型治理，始终加载
---

# 目录结构
```
src/
├── main/                      # Electron 主进程
│   ├── index.ts               # 入口：窗口/Tray/启动
│   ├── ipc/index.ts           # IPC handler 注册（全部业务 CRUD 在此）
│   ├── db/                    # sql.js 数据库层
│   │   ├── connection.ts      # 连接管理
│   │   ├── schema.ts          # 建表
│   │   ├── providers.ts       # Provider CRUD
│   │   ├── api-keys.ts        # API Key CRUD
│   │   ├── conversations.ts   # Conversation CRUD
│   │   └── logs.ts            # NDJSON 日志写入/查询
│   ├── domains/               # 业务逻辑层
│   │   └── {name}/
│   │       ├── {name}.service.ts   # 业务入口
│   │       ├── {name}.schema.ts    # Zod 校验（create/update 必须）
│   │       └── {name}.types.ts     # 类型定义
│   ├── proxy/                 # HTTP 代理层（仅 Chat 用）
│   │   ├── server.ts          # Hono 应用 + 代理端点
│   │   ├── manager.ts         # 代理生命周期管理
│   │   ├── router.ts          # 模型→供应商路由
│   │   ├── forwarder.ts       # URL/Header 构建
│   │   ├── converter/         # OpenAI ↔ Anthropic 协议转换
│   │   │   ├── types.ts       # StreamContext、ProtocolFormat 共享类型
│   │   │   ├── request.ts     # convertRequest() 双向请求转换
│   │   │   ├── response.ts    # convertResponse() 非流式响应转换
│   │   │   ├── sse.ts         # convertSSEEvent() + SSE 状态机
│   │   │   └── index.ts       # barrel export，保持向前兼容
│   │   ├── middleware.ts      # Auth 中间件
│   │   └── rate-limiter.ts    # 限流
│   ├── core/                  # 通用工具（不含业务逻辑）
│   │   └── logger.ts          # 统一日志（支持 file transport）
│   └── update/                # 自动更新模块
├── preload/                   # contextBridge 桥接
│   └── index.ts
├── renderer/                  # React 前端
│   ├── App.tsx                # 根组件（路由 + 更新检测）
│   ├── pages/                 # 页面组件
│   │   ├── Dashboard.tsx
│   │   ├── Providers.tsx
│   │   ├── ApiKeys.tsx
│   │   ├── Logs.tsx
│   │   ├── Chat.tsx
│   │   └── Settings.tsx
│   ├── features/              # 功能模块（单向，互不引用）
│   │   └── {name}/
│   │       ├── components/    # 纯 UI（props + 回调）
│   │       ├── hooks/         # IPC 封装
│   │       └── queries/       # TanStack Query hooks
│   ├── components/            # 共享 UI 组件
│   ├── lib/
│   │   ├── ipc.ts             # window.electronAPI 快捷导出
│   │   ├── types.ts           # 类型 + Window 全局声明
│   │   └── queries/           # TanStack Query hooks
│   └── shared/
│       └── lib/
│           └── api-client.ts  # 仅 Chat HTTP 请求（SSE 流）
└── shared/                    # 主/渲染进程共享
    └── types.ts               # 核心实体类型（ProviderEntity 等）
```

# 导入方向（单向依赖）
  domain/{name}.service.ts → core/ + proxy/ （domain 不再有 .router.ts，走 IPC handler）
  features/{name}/hooks/ → lib/ipc.ts → preload IPC → main/ipc/index.ts
  features/{name}/queries/ → lib/ipc.ts → preload IPC → main/ipc/index.ts
  features/{name}/components/ → 纯 UI，只接收 props + 回调
  例外：features/chat/hooks/useChatStream → shared/lib/api-client.ts → HTTP (8080) → proxy（/v1/chat/completions 或 /v1/messages）

# 类型治理
- 核心实体基础接口只在 `shared/types.ts` 定义（ProviderEntity、ApiKeyEntity 等）
- 各层通过 type alias 或 `Omit`/`Pick` 派生，禁止重新定义同名 interface
- renderer 层用 `Omit<ProviderEntity, 'apiKey'>` 保护敏感字段

# 禁止
- `renderer/` 导入 `main/` 任何文件（编译隔离）
- `core/` 导入 `domains/` 任何文件（下层不能依赖上层）
- `proxy/` 导入 `domains/` 任何文件（工具层不含业务）
- `shared/` 导入 `features/` 或 `domains/`（共享层不依赖业务）
- 在多层重复定义相同实体的 interface（基础类型统一在 `shared/types.ts`）
