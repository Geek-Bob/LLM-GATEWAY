---
description: 目录结构与模块边界规范，始终加载
---

# 目录结构

```
src/renderer/
├── App.tsx                    # 入口层：路由定义 + 全局 Provider
├── main.tsx                   # 入口层：应用挂载 + Dark 模式
├── pages/                     # 入口层：路由页面（薄层组合，不含业务逻辑）
│   ├── Dashboard.tsx
│   ├── Providers.tsx
│   ├── ApiKeys.tsx
│   ├── Agents.tsx
│   ├── Chat.tsx
│   ├── Logs.tsx
│   ├── ModelMappings.tsx
│   └── Settings.tsx
├── features/                  # 业务层：按功能域划分
│   └── {name}/
│       ├── components/            # 功能域纯 UI 组件
│       └── hooks/                 # 功能域复杂逻辑（SSE 流、状态机）
├── components/
│   ├── ui/                    # 表现层：共享原子组件（shadcn/ui）
│   ├── Layout.tsx             # 入口层：全局布局
│   ├── TitleBar.tsx           # 入口层：标题栏
│   └── ErrorBoundary.tsx      # 入口层：错误边界
├── hooks/                     # 基础设施层：全局通用 hooks
├── lib/
│   ├── queries/               # 数据层：TanStack Query hooks（按域分文件）
│   ├── ipc.ts                 # 数据层：IPC 快捷导出
│   ├── types.ts               # 数据层：类型定义
│   ├── utils.ts               # 基础设施层：工具函数
│   └── animations.ts          # 表现层：动画常量
└── shared/lib/                # 基础设施层：跨进程共享实现
```

# 导入规则
- 统一使用 `@/` 别名（映射到 `src/renderer/*`）
- 禁止使用相对路径（`../`、`../../`）
- 例外：`shared/types.ts` 使用 `../../shared/types`

# 模块边界（单向依赖）
依赖方向：`pages/` → `features/` + `lib/queries/` → `components/ui/` + `lib/ipc.ts`

## 禁止的导入方向
- `components/ui/` 不得导入 `features/`、`pages/`、`lib/queries/`
- `pages/` 不得直接导入 `shared/lib/`（应通过 `features/` 或 `lib/` 封装）
- `features/` 之间不得交叉导入

## 跨层封装
- `shared/lib/` 中的实现细节应通过 `lib/` 中间层封装
- `pages/` 不得直接导入 `shared/lib/`，应通过 `features/` 封装

# 类型保护
- renderer 层用 `Omit<ProviderEntity, 'apiKey'>` 保护敏感字段

# 检查清单
- `components/ui/` 仅放共享原子组件，不放功能域组件
- 功能域组件放在 `features/{name}/components/`
- 全局通用 hooks 放在 `hooks/`
- `lib/queries/` 按域分文件
- 新增页面时同步创建对应的 `features/{name}/` 目录
