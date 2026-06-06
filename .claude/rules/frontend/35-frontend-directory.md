---
description: 目录结构与模块边界规范，始终加载
---

# 目录结构
- `pages/` — 薄层组合层，不包含复杂业务逻辑
- `features/{name}/components/` — 功能域纯 UI 组件
- `features/{name}/hooks/` — 功能域复杂逻辑
- `features/{name}/queries/` — 功能域 TanStack Query hooks
- `components/ui/` — 共享原子组件（shadcn/ui）
- `hooks/` — 全局通用 hooks
- `lib/` — 工具函数、动画常量、IPC 导出、queries
- `shared/lib/` — 跨进程共享实现（如 api-client）

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
