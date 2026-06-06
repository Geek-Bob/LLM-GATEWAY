---
description: 前端目录结构与导入规则（仅 renderer）
---

# 目录结构
```
src/renderer/
├── App.tsx                # 根组件（路由 + 更新检测）
├── pages/                 # 页面组件
│   ├── Dashboard.tsx
│   ├── Providers.tsx
│   ├── ApiKeys.tsx
│   ├── Logs.tsx
│   ├── Chat.tsx
│   └── Settings.tsx
├── features/              # 功能模块（单向，互不引用）
│   └── {name}/
│       ├── components/    # 纯 UI（props + 回调）
│       ├── hooks/         # IPC 封装
│       └── queries/       # TanStack Query hooks
├── components/            # 共享 UI 组件
│   └── ui/               # 基础 UI 组件（Button、Input 等）
├── hooks/                 # 通用 Hooks
├── lib/
│   ├── ipc.ts             # window.electronAPI 快捷导出
│   ├── types.ts           # 类型 + Window 全局声明
│   ├── utils.ts           # 工具函数
│   ├── animations.ts      # 动画常量
│   └── queries/           # TanStack Query hooks
└── shared/
    └── lib/
        └── api-client.ts  # 仅 Chat HTTP 请求（SSE 流）
```

# 导入规则
- 统一使用 `@/` 别名（映射到 `src/renderer/*`）
- 禁止使用相对路径（`../`、`../../`）
- 例外：`shared/types.ts` 使用 `../../shared/types`（不在 renderer 目录内）

# 导入方向（单向依赖）
- `features/{name}/hooks/` → `lib/ipc.ts` → preload IPC → main/ipc/index.ts
- `features/{name}/queries/` → `lib/ipc.ts` → preload IPC → main/ipc/index.ts
- `features/{name}/components/` → 纯 UI，只接收 props + 回调
- 例外：`features/chat/hooks/useChatStream` → `shared/lib/api-client.ts` → HTTP (8080) → proxy

# 类型保护
- renderer 层用 `Omit<ProviderEntity, 'apiKey'>` 保护敏感字段
