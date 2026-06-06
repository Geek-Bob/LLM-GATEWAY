---
description: 前端目录结构与导入规则（仅 renderer）
---

# 目录结构
```
src/renderer/
├── App.tsx                # 根组件（路由 + 更新检测）
├── pages/                 # 页面组件（薄层组合层，不包含复杂业务逻辑）
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
├── hooks/                 # 全局通用 hooks（useClipboard、useDeleteWithToast 等）
├── lib/
│   ├── ipc.ts             # window.electronAPI 快捷导出
│   ├── types.ts           # 类型 + Window 全局声明
│   ├── utils.ts           # 工具函数
│   ├── animations.ts      # 动画常量
│   └── queries/           # TanStack Query hooks（按域分文件）
└── shared/
    └── lib/
        └── api-client.ts  # 仅 Chat HTTP 请求（SSE 流）
```

# 导入规则
- 统一使用 `@/` 别名（映射到 `src/renderer/*`）
- 禁止使用相对路径（`../`、`../../`）
- 例外：`shared/types.ts` 使用 `../../shared/types`（不在 renderer 目录内）

# 导入方向（单向依赖）
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

# 类型保护
- renderer 层用 `Omit<ProviderEntity, 'apiKey'>` 保护敏感字段

# 检查清单
- [ ] `components/ui/` 仅放共享原子组件，不放功能域组件
- [ ] 功能域组件放在 `features/{name}/components/`
- [ ] 功能域 hooks 放在 `features/{name}/hooks/`
- [ ] 全局通用 hooks 放在 `hooks/`
- [ ] `pages/` 是薄层组合层，不包含复杂业务逻辑
- [ ] `lib/queries/` 按域分文件
- [ ] 新增页面时同步创建对应的 `features/{name}/` 目录
