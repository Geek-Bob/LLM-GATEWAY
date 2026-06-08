---
description: 前端目录结构、导入规则与模块边界规范，始终加载
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
│       ├── hooks/                 # 功能域复杂逻辑（SSE 流、状态机）
│       └── index.ts               # 可选导出
├── components/
│   ├── ui/                    # 表现层：纯 UI 原子组件（shadcn/ui）
│   ├── shared/                # 表现层：通用业务组件（action-buttons、form-dialog 等）
│   ├── Layout.tsx             # 入口层：全局布局
│   ├── TitleBar.tsx           # 入口层：标题栏
│   └── ErrorBoundary.tsx      # 入口层：错误边界
├── hooks/                     # 基础设施层：全局通用 hooks
├── lib/
│   ├── queries/               # 数据层：TanStack Query hooks（按域分文件）
│   ├── ipc.ts                 # 数据层：IPC 快捷导出
│   ├── types.ts               # 数据层：类型定义
│   ├── utils.ts               # 基础设施层：工具函数
│   ├── animations.ts          # 表现层：动画常量
│   ├── api-client.ts          # 基础设施层：HTTP 封装（仅 Chat SSE 流）
│   └── shiki.ts               # 表现层：代码高亮辅助
```

# 导入规则
- 统一使用 `@/` 别名（映射到 `src/renderer/*`）
- 禁止使用相对路径（`../`、`../../`）
- 例外：`src/shared/types.ts` 使用 `../../shared/types`

```typescript
// ✅ 正确
import { Button } from '@/components/ui/button'
import { useProviders } from '@/lib/queries/providers'

// ❌ 错误
import { Button } from '../../components/ui/button'
import { useProviders } from '../queries/providers'
```

# 模块边界（单向依赖）
依赖方向：`pages/` → `features/` + `lib/queries/` → `components/ui/` + `components/shared/` + `lib/ipc.ts`

## 禁止的导入方向
- `components/ui/` 和 `components/shared/` 不得导入 `features/`、`pages/`、`lib/queries/`
- `features/` 之间不得交叉导入组件或 hooks（当两个 feature 需要共享逻辑时，将共享部分提升到 `hooks/` 或 `components/shared/`）
- 组件内禁止直接数据访问（数据操作规则见 `frontend/31-renderer.md` 禁止项）

# 文件放置规则
- `components/ui/`：纯 UI 原子组件，复用规则见 `frontend/32-component-reuse.md`
- `components/shared/`：通用业务组件（含中文文案、业务状态判断、或组合 2+ 原子组件）
- 功能域组件放在 `features/{name}/components/`
- 全局通用 hooks 放在 `hooks/`（被 2 个及以上 feature 使用的逻辑，或非 UI 相关的通用工具 hook）
- `lib/queries/` 按域分文件
- 新增页面时同步创建对应的 `features/{name}/` 目录
