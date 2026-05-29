# 代码样式与架构规范

## 目录结构（不可越界）

```
src/
├── main/                  # Electron 主进程
│   ├── db/                # sql.js 数据库操作
│   ├── ipc/               # IPC handlers
│   ├── proxy/             # Hono 代理服务器
│   ├── update/            # 自动更新
│   └── utils/             # 工具函数
├── preload/               # contextBridge 暴露 window.electronAPI
├── shared/                # 主进程/渲染进程共享类型
└── renderer/              # React 渲染进程
    ├── components/        # 通用 UI 组件
    │   ├── ui/            # shadcn/ui 原语（CLI 引入，不手动改）
    │   └── update/        # 更新相关组件
    ├── lib/
    │   ├── queries/       # TanStack Query hooks，按数据域分文件
    │   ├── types.ts       # 渲染进程类型定义
    │   ├── utils.ts       # cn() 等工具函数
    │   └── ipc.ts         # api = window.electronAPI 薄封装
    ├── pages/             # 路由页面组件（数据获取 + 业务逻辑 + UI 拼装）
    └── main.tsx           # 入口：QueryClient + dark class + StrictMode
```

**职责边界：**
- `components/ui/` — shadcn/ui 原语，只做 UI，不碰数据
- `components/` — 通用业务组件，接收 props + 回调，不直接调 IPC
- `lib/queries/` — 所有数据获取逻辑，每个文件导出 useXxx hooks
- `pages/` — 路由页面，组装 queries + components，可含页面级状态
- `shared/types.ts` — 主进程/渲染进程共享类型，避免重复定义

## 禁止事项（防屎山铁律）

### 严禁直接 IPC 调用散落各处
```tsx
// ❌ 组件内直接调 IPC
const data = await window.electronAPI.logs.query({ ... })

// ✅ 通过 TanStack Query hook
const { data } = useLogs(filters)
```
所有 IPC 调用必须封装在 `lib/queries/` 的 hooks 中，组件只消费 hook。

### 严禁 useEffect + useState 手动管理异步状态
```tsx
// ❌ 手动 loading/error/data 状态
const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)
useEffect(() => {
  api.logs.query().then(setData).finally(() => setLoading(false))
}, [])

// ✅ TanStack Query
const { data, isLoading } = useLogs(filters)
```
例外：IPC 事件监听（如 `update.onAvailable`）可用 useEffect + useState，因为这是订阅模式而非请求。

### 严禁在组件内写业务逻辑
```tsx
// ❌ 页面组件里做数据转换
const filtered = logs.filter(l => l.status_code >= 400)
const sorted = filtered.sort((a, b) => ...)

// ✅ 抽到 hook 或工具函数
const { filteredLogs } = useFilteredLogs(logs, filters)
```

### 严禁硬编码魔法值
```tsx
// ❌ 魔法数字/字符串
if (status === 429) { ... }
bg-[#1a2b3c]

// ✅ 常量 + 设计令牌
if (status === HTTP_STATUS.TOO_MANY_REQUESTS) { ... }
bg-card  // 使用 CSS 变量
```

### 严禁 props drilling 超过 2 层
穿透 3 层以上时使用 Context 或状态管理方案。

## TypeScript

- 严格模式，所有函数参数和返回值必须有类型注解
- 接口优先于 type（除非需要联合类型或交叉类型）
- 枚举用 `as const` 对象替代 `enum`：
  ```ts
  const PROVIDER_TYPES = ['anthropic', 'openai'] as const
  type ProviderType = (typeof PROVIDER_TYPES)[number]
  ```
- 导入共享类型从 `../../shared/types`，不重复定义
- 新代码不允许引入 any 类型（历史遗留 `@typescript-eslint/no-explicit-any: warn` 逐步清理）

## React 组件

- 函数组件 + 具名导出（`export function Page()`），不用 default export（除 App.tsx）
- 组件文件名 PascalCase，hook 文件名 camelCase
- Props 接口命名为 `ComponentNameProps`
- 超过 300 行的组件必须拆分（子组件或自定义 hook）

## TanStack Query

- hooks 放 `lib/queries/`，按数据域分文件（stats.ts, logs.ts, providers.ts 等）
- queryKey 使用数组常量：`['stats', '24h']`、`['logs', filters]`
- 全局 staleTime: 30s（已在 main.tsx 配置），单个查询可覆盖
- Mutation 使用 `useMutation` + `onSuccess` 中 `queryClient.invalidateQueries`

## 样式（Tailwind CSS v4）

- 使用 CSS 变量令牌：`bg-background`、`text-foreground`、`border-border`
- 禁止任意值：`p-[23px]` → 用 `p-6`；`text-[#fff]` → 用 `text-foreground`
- 合并类名用 `cn()`（clsx + tailwind-merge）
- 超过 4 行 className 考虑提取为子组件或 cva 变体

## 视觉设计系统（macOS 26 Liquid Glass）

### 色彩
所有颜色引用 CSS 变量（已在 index.css 定义），不硬编码 hex/hsl：
```tsx
bg-background      // 主背景：深空灰 hsl(220,14%,9%)
bg-card            // 卡片：略浅 hsl(220,12%,13%)
border-border      // 边框：冷蓝调 hsl(220,10%,20%)
text-foreground    // 主文字
text-muted-foreground  // 次要文字
```

### 毛玻璃
侧边栏、顶栏、弹窗背景：
```tsx
backdrop-blur-xl bg-background/60 border-r border-border/50
```

### 圆角
统一使用 `rounded-xl`（12px）或 `rounded-2xl`（16px）。
shadcn/ui 默认 `--radius: 0.75rem` 已配置，组件自动继承。

### 间距
- 页面边距：`p-8`（Layout.tsx 已用）
- 卡片间距：`gap-4` ~ `gap-6`
- 模块间距：`gap-8` ~ `gap-12`
- 严禁拥挤布局，宁可多留白

### 阴影
```tsx
shadow-sm shadow-black/5    // 轻微浮起
shadow-md shadow-black/10   // 弹窗/下拉
// ❌ 禁止厚重黑阴影
```

### 动画（Framer Motion）
- 过渡时长：0.15s ~ 0.3s
- 缓动：`ease-out` 或 `[0.16, 1, 0.3, 1]`
- 列表项：stagger 100ms
- 弹窗：`scale(0.95) + opacity(0)` → `scale(1) + opacity(1)`
- 侧边栏收起：`animate={{ width: collapsed ? 52 : 240 }}`
- 导航指示器：`layoutId="activeNav"` 共享布局动画

### 滚动条
已在 index.css 全局定义（6px 宽、圆角、透明轨道），无需组件内重复。

### 深色模式
默认深色（`document.documentElement.classList.add('dark')`）。
浅色模式变量已定义但当前未启用，如需支持需在 `<html>` 上切换 class。
