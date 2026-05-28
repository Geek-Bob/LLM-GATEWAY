# UI Redesign: shadcn/ui + macOS 26 风格

**日期**: 2026-05-28
**状态**: 已批准
**方案**: A — 全量 shadcn/ui 重构

---

## 1. 目标

将 LLM Gateway 的渲染进程 UI 从自定义 CSS 类体系迁移到 shadcn/ui 组件库，采用 macOS 26 视觉风格，同时引入现代路由和数据层。

### 成功标准

- 所有页面使用 shadcn/ui 组件，移除 `cyber-*` 自定义 CSS 类
- 所有 inline style 替换为 Tailwind 类 + CSS 变量
- 路由通过 react-router-dom v7 管理
- 数据获取通过 TanStack Query 管理
- 模态框/弹窗具备完整键盘无障碍支持（Radix 原语）
- 暗色主题通过 shadcn CSS 变量系统统一管理

---

## 2. 主题系统

### CSS 变量（shadcn/ui 标准格式）

替换 `index.css` 中现有的 `:root` 变量：

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 7%;
    /* ... light mode (保留，暂不启用) */
  }
  .dark {
    --background: 222 47% 7%;        /* 深空灰 #080a0e */
    --foreground: 210 40% 96%;       /* 主文字 #f1f5f9 */
    --card: 222 30% 10%;             /* 卡片背景 #161b22 */
    --card-foreground: 210 40% 96%;
    --popover: 222 30% 10%;
    --popover-foreground: 210 40% 96%;
    --primary: 217 91% 60%;          /* 蓝色强调 #3b82f6 */
    --primary-foreground: 0 0% 100%;
    --secondary: 217 20% 17%;        /* 次要表面 #1c2330 */
    --secondary-foreground: 210 40% 96%;
    --muted: 217 20% 17%;
    --muted-foreground: 215 10% 55%; /* 次要文字 #64748b */
    --accent: 217 20% 17%;
    --accent-foreground: 210 40% 96%;
    --destructive: 0 84% 60%;        /* 红色 #ef4444 */
    --destructive-foreground: 0 0% 100%;
    --border: 217 20% 18%;           /* 边框 #21262d */
    --input: 217 20% 18%;
    --ring: 217 91% 60%;
    --radius: 0.75rem;
  }
}
```

### Tailwind 扩展

Tailwind CSS v4 使用 CSS-first 配置。在 `index.css` 中用 `@theme` 指令定义设计令牌：

```css
@import "tailwindcss";

@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);
}
```

这样 `bg-background`, `text-foreground`, `rounded-lg` 等 Tailwind 类即可直接使用 CSS 变量。不创建 `tailwind.config.ts`。

---

## 3. 组件替换映射

### shadcn/ui 组件引入列表

通过 `npx shadcn@latest add <component>` 引入到 `src/renderer/components/ui/`。

| 组件 | 替换对象 | 使用页面 |
|------|----------|----------|
| `button` | `.btn-cyber`, `.btn-ghost`, `.btn-danger` | 全部 |
| `input` | `.cyber-input` | Providers, ApiKeys, Chat, Dashboard |
| `card` | `.cyber-card`, `.cyber-card-elevated` | 全部 |
| `badge` | `.cyber-badge` | Providers, Logs |
| `table` | `.cyber-table` | Dashboard, Providers, ApiKeys, Logs |
| `dialog` | `modal-backdrop` + 手动模态框 | Providers, ApiKeys |
| `popover` | `createPortal` popover | Providers (API Key 查看) |
| `select` | `.cyber-select` | Chat, Logs |
| `switch` | 手写 toggle switch | Dashboard, Logs |
| `tabs` | 手写 tab 切换 | Logs (如有) |
| `tooltip` | title 属性 | 全部 |
| `separator` | 手写 border div | Layout |
| `scroll-area` | 手写 overflow-auto | Layout, Chat |
| `dropdown-menu` | 右键/操作菜单 | Providers, ApiKeys |
| `skeleton` | `.skeleton` | 全部加载态 |
| `sonner` 或 `toast` | `alert()` / `window.confirm()` | 全部 |

### 自定义 CSS 类移除清单

移除 `index.css` 中以下类（替换为 shadcn 组件 Tailwind 类）：

- `.cyber-card` → `<Card>`
- `.cyber-card-elevated` → `<Card className="shadow-2xl">`
- `.cyber-input` → `<Input>`
- `.cyber-select` → `<Select>`
- `.btn-cyber` → `<Button>`
- `.btn-ghost` → `<Button variant="ghost">`
- `.btn-danger` → `<Button variant="destructive">`
- `.cyber-table` → `<Table>`
- `.cyber-badge` → `<Badge>`
- `.modal-backdrop` → `<Dialog>` (Radix 内置 overlay)
- `.skeleton` → `<Skeleton>`
- `.drag` / `.no-drag` — 保留（Electron 窗口拖拽必需）
- `::-webkit-scrollbar` — 保留但调整为与新主题一致

---

## 4. 路由迁移

### 从手动路由到 react-router-dom v7

`react-router-dom v7.15` 已安装，直接使用。

**App.tsx**:

```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
// HashRouter 用于 Electron（file:// 协议不支持 BrowserRouter）

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="chat" element={<ChatPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
```

> 选择 `HashRouter` 而非 `BrowserRouter`，因为 Electron 加载的是本地文件，`file://` 协议下 HTML5 History API 不可用。

**Layout.tsx**:

```tsx
import { NavLink, Outlet } from 'react-router-dom'
// 导航按钮改为 <NavLink>，active 状态由 router 管理
// 子内容区改为 <Outlet />
```

**TitleBar.tsx**:

- 保留现有逻辑（Electron 窗口控制）
- macOS 26 风格：毛玻璃效果 `backdrop-blur-xl bg-background/60`

---

## 5. 数据层 — TanStack Query

### 安装

```
npm install @tanstack/react-query
```

### QueryClient 配置

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 秒内不重新请求
      refetchOnWindowFocus: false,  // Electron 切 tab 不自动刷新
    },
  },
})
```

### Query Hooks

每个数据域创建自定义 hook，放在 `src/renderer/lib/queries/` 下：

| Hook | 查询键 | 数据源 |
|------|--------|--------|
| `useProviders()` | `['providers']` | `api.providers.list()` |
| `useDashboardStats()` | `['stats', '7d']` | `api.logs.stats('7d')` |
| `useHourlyStats()` | `['stats', '24h']` | `api.logs.statsDetailed('24h')` |
| `useDailyStats()` | `['stats', '30d']` | `api.logs.statsDetailed('30d')` |
| `useProxyStatus()` | `['proxy', 'status']` | `api.proxy.status()` |
| `useLogs(page, filters)` | `['logs', page, filters]` | `api.logs.query(...)` |
| `useApiKeys()` | `['apiKeys']` | `api.keys.list()` |

### Mutations

| Hook | 操作 | 失效查询 |
|------|------|----------|
| `useCreateProvider()` | `api.providers.create()` | `['providers']` |
| `useUpdateProvider()` | `api.providers.update()` | `['providers']` |
| `useDeleteProvider()` | `api.providers.delete()` | `['providers']` |
| `useCreateApiKey()` | `api.keys.create()` | `['apiKeys']` |
| `useDeleteApiKey()` | `api.keys.delete()` | `['apiKeys']` |
| `useToggleProxy()` | `api.proxy.start/stop()` | `['proxy', 'status']` |

---

## 6. macOS 26 视觉风格

### 核心设计语言

macOS 26 的视觉特征：深度层级、毛玻璃、柔和光感、大圆角、宽松留白。

### 侧边栏

```
backdrop-blur-xl bg-background/60
border-r border-border/50
w-60 (从 w-56 增加)
```

- 毛玻璃半透明背景
- 导航项使用 `NavLink` 的 `isActive` 状态
- 选中项：`bg-primary/10 text-primary` + 左侧指示条（保留 framer-motion `layoutId`）
- 图标：emoji 替换为 Lucide 图标（`LayoutDashboard`, `Building2`, `Key`, `ScrollText`, `MessageSquare`）

### 标题栏

```
backdrop-blur-xl bg-background/60
h-10 (从 h-11 微调)
```

- 应用名 + 版本号保留
- 窗口控制按钮保留现有图标风格（Minus / Square / X），因为 Electron 无边框窗口不支持 macOS 原生红绿黄圆点
- `-webkit-app-region: drag` 保留

### 卡片

```
bg-card border border-border/50 rounded-xl
shadow-sm hover:shadow-md transition-shadow
```

- 去掉硬边框，改用 `border-border/50` 半透明边框
- 圆角从 `rounded-lg` 升级到 `rounded-xl`
- hover 时轻微阴影提升

### 按钮

```
// Primary
bg-primary text-primary-foreground rounded-lg px-4 py-2

// Secondary
bg-secondary text-secondary-foreground rounded-lg

// Ghost
hover:bg-accent hover:text-accent-foreground rounded-lg

// Destructive
bg-destructive text-destructive-foreground rounded-lg
```

### 模态框（Dialog）

```
bg-popover rounded-2xl shadow-2xl
backdrop:bg-black/50 backdrop:backdrop-blur-sm
```

- 圆角从 `rounded-xl` 升级到 `rounded-2xl`
- 背景使用 backdrop-blur 模糊
- 内容区 padding 增加到 `p-6`

### 表格

```
bg-card rounded-xl overflow-hidden
```

- 表头 `text-xs font-semibold text-muted-foreground uppercase tracking-wider`
- 行 hover `bg-muted/50`
- 去掉竖线，只保留底部分隔线

### 间距系统

- 页面 padding: `p-8` (从 `p-6`)
- 卡片间距: `gap-6` (从 `gap-4`)
- 卡片内 padding: `p-6` (从 `p-4`)
- 标题与内容间距: `mb-8` (从 `mb-6`)

---

## 7. Framer Motion 动画

### 保留

- 侧边栏指示条 `layoutId="activeNav"` — 保留
- 页面入场 `initial/animate` — 保留但统一为 AnimatePresence + 路由切换
- 列表项 `staggerChildren` — 保留
- 模态框缩放动画 — 保留

### 增强

- **页面切换**: 路由变更时 AnimatePresence + crossfade
- **Toast 通知**: 替换 `alert()` 为 Sonner toast，带滑入动画
- **卡片 hover**: 微妙的 `scale(1.005)` + shadow 变化
- **侧边栏折叠**: ConversationSidebar 的展开/收起保留现有动画

---

## 8. 图标系统

### Lucide React

替换所有手写 SVG 为 Lucide 图标：

```
npm install lucide-react
```

| 现有 SVG | Lucide 图标 |
|----------|------------|
| 最小化 | `Minus` |
| 最大化 | `Square` / `Maximize2` |
| 关闭 | `X` |
| 添加 | `Plus` |
| 编辑 | `Pencil` |
| 删除 | `Trash2` |
| 复制 | `Copy` |
| 查看 | `Eye` / `EyeOff` |
| 搜索 | `Search` |
| 设置 | `Settings` |
| 刷新 | `RefreshCw` |
| 展开/收起 | `ChevronDown` / `ChevronRight` |

---

## 9. 新增依赖

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.81.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.0",
    "lucide-react": "^0.511.0",
    "sonner": "^2.0.3"
  }
}
```

shadcn/ui 组件通过 CLI 引入到 `src/renderer/components/ui/`，不作为 npm 依赖。Radix 依赖（`@radix-ui/react-dialog` 等）随组件自动安装。

---

## 10. 文件结构变更

```
src/renderer/
├── components/
│   ├── ui/                          # [新增] shadcn/ui 组件
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── table.tsx
│   │   ├── badge.tsx
│   │   ├── select.tsx
│   │   ├── switch.tsx
│   │   ├── popover.tsx
│   │   ├── tooltip.tsx
│   │   ├── separator.tsx
│   │   ├── scroll-area.tsx
│   │   ├── skeleton.tsx
│   │   ├── sonner.tsx
│   │   └── dropdown-menu.tsx
│   ├── Layout.tsx                   # [修改] Outlet + NavLink + 毛玻璃
│   ├── TitleBar.tsx                 # [修改] macOS 26 风格
│   ├── StatusBar.tsx                # [修改] 使用 shadcn 组件
│   ├── ConversationSidebar.tsx      # [修改] 使用 shadcn 组件
│   ├── ChatMessage.tsx              # [修改] 使用 shadcn 组件
│   ├── ChatInput.tsx                # [修改] 使用 shadcn 组件
│   ├── StatsCard.tsx                # [修改] 使用 Card + Badge
│   └── StatsCharts.tsx              # [修改] 图表颜色适配新主题
├── lib/
│   ├── ipc.ts                       # [不变]
│   ├── types.ts                     # [不变]
│   ├── utils.ts                     # [新增] cn() 工具函数
│   └── queries/                     # [新增] TanStack Query hooks
│       ├── providers.ts
│       ├── stats.ts
│       ├── logs.ts
│       ├── apiKeys.ts
│       └── proxy.ts
├── pages/
│   ├── Dashboard.tsx                # [重写]
│   ├── Providers.tsx                # [重写]
│   ├── ApiKeys.tsx                  # [重写]
│   ├── Logs.tsx                     # [重写]
│   └── Chat.tsx                     # [重写]
├── App.tsx                          # [重写] HashRouter + Routes + QueryClient
├── index.css                        # [重写] shadcn 主题变量 + Tailwind
└── main.tsx                         # [修改] 挂载不变
```

---

## 11. 实施顺序

| 阶段 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | 基础设施：shadcn init + 主题 + Tailwind 令牌 + cn() + 第一批组件 (Button, Input, Card, Badge, Skeleton) | `index.css`, `lib/utils.ts`, `components/ui/*` |
| 2 | Layout + TitleBar：毛玻璃 + react-router-dom + NavLink + Outlet + Lucide 图标 | `App.tsx`, `Layout.tsx`, `TitleBar.tsx` |
| 3 | Dashboard：Card + Table + Switch + 图表主题 + TanStack Query | `Dashboard.tsx`, `StatsCard.tsx`, `StatsCharts.tsx`, `lib/queries/stats.ts`, `lib/queries/proxy.ts`, `lib/queries/providers.ts` |
| 4 | Providers：Dialog + Popover + Table + Form + TanStack Query | `Providers.tsx`, `lib/queries/providers.ts` |
| 5 | ApiKeys：Dialog + Table + 复用 Providers 模式 + TanStack Query | `ApiKeys.tsx`, `lib/queries/apiKeys.ts` |
| 6 | Logs：Table + 详情面板 + Badge + TanStack Query | `Logs.tsx`, `lib/queries/logs.ts` |
| 7 | Chat：整体重设计 + Sidebar + Input + Message 组件 | `Chat.tsx`, `ConversationSidebar.tsx`, `ChatMessage.tsx`, `ChatInput.tsx` |
| 8 | 清理：移除 `cyber-*` CSS 类、替换 `alert()`/`confirm()` 为 Sonner/Dialog、全量测试 | `index.css`, 全部页面 |

---

## 12. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| shadcn/ui CLI 的 `init` 命令可能与 Tailwind v4 的 CSS-first 配置不完全兼容 | 阶段 1 手动配置 `@theme` + 手动引入组件，不依赖 `shadcn init` 的自动配置 |
| Electron + HashRouter 下 react-router 行为异常 | 阶段 2 实施时验证，备选方案保留手动路由但用 NavLink |
| shadcn/ui 的某些 Radix 组件在 Electron 中有焦点/键盘问题 | 逐组件验证，必要时添加 Electron 特定的焦点管理 |
| recharts 主题颜色需要与新 CSS 变量对齐 | 阶段 3 统一处理，使用 `hsl(var(--primary))` 等引用 |
| 大量文件同时修改导致测试失败 | 按阶段实施，每阶段完成后运行 `npm test` + `npm run lint` |
