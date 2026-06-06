# LLM Gateway UI 规范文档

> 本文件为 LLM Gateway 渲染层（`src/renderer/`）的 UI 开发规范。
> 所有新增/修改 UI 代码必须遵循本文档，Code Review 时以此为准。
>
> 基线版本：2026-06-06 | 当前主题：Dark-only（深空灰 + 冷蓝调）

---

## 目录

1. [视觉风格](#1-视觉风格)
2. [样式系统](#2-样式系统)
3. [组件体系](#3-组件体系)
4. [目录结构](#4-目录结构)
5. [模块边界](#5-模块边界)
6. [数据流](#6-数据流)
7. [复用规则](#7-复用规则)
8. [动效规范](#8-动效规范)

---

## 1. 视觉风格

### 规范描述

所有颜色必须使用 `index.css` 中定义的 CSS 变量（如 `bg-background`、`text-muted-foreground`），禁止硬编码 Tailwind 色值（如 `bg-slate-900`、`text-gray-400`）。圆角使用 `rounded-xl`（与 Card 组件一致）为默认值，`rounded-lg` 仅用于小型内部元素。

页面头部统一使用 `PageHeader` 组件，禁止手写 `flex items-center gap-3` 布局。

### 代码示例

**颜色使用**

```tsx
// ❌ 硬编码色值
<div className="bg-slate-900 text-slate-400">...</div>

// ✅ 使用主题变量
<div className="bg-background text-muted-foreground">...</div>
```

**页面头部**

```tsx
// ❌ 手写布局（Agents.tsx、Settings.tsx 当前问题）
<motion.div variants={childVariants} className="flex items-center gap-3">
  <SettingsIcon className="h-6 w-6 text-muted-foreground" />
  <div>
    <h1 className="text-2xl font-bold">设置</h1>
    <p className="text-sm text-muted-foreground">管理应用配置和偏好</p>
  </div>
</motion.div>

// ✅ 使用 PageHeader 组件
<PageHeader
  title="设置"
  description="管理应用配置和偏好"
  action={<Button>新建</Button>}
/>
```

**圆角一致性**

```tsx
// ❌ Card 内部元素使用 rounded-lg，与 Card 自身 rounded-xl 不一致
<div className="border rounded-lg">...</div>

// ✅ 与 Card 统一使用 rounded-xl
<div className="border border-border rounded-xl">...</div>
```

**内联 style**

```tsx
// ❌ 使用内联 style 设置样式
<textarea style={{ maxHeight: 200, fontFamily: 'inherit' }} />

// ✅ 使用 Tailwind 类
<textarea className="max-h-[200px] font-inherit" />
```

### 检查清单

- [ ] 所有颜色使用 `bg-*` / `text-*` 主题变量，无硬编码 `slate`/`gray`/`zinc` 等
- [ ] 页面头部使用 `PageHeader` 组件
- [ ] 容器圆角使用 `rounded-xl`，内部小元素可用 `rounded-md` / `rounded-sm`
- [ ] 无内联 `style={{ }}` 设置颜色、间距、尺寸（`maxHeight` 等应改用 Tailwind 类）
- [ ] 启动画面（`App.tsx` backendReady=false 分支）使用 `bg-background text-muted-foreground`

---

## 2. 样式系统

### 规范描述

当前仅支持 Dark 模式（`document.documentElement.classList.add('dark')` 硬编码于 `main.tsx`），这是 Electron 桌面应用的设计决策，不做 Light 模式切换。

所有样式通过 Tailwind CSS + CSS 变量体系实现。字体统一使用系统字体栈。阴影分 3 级：Card 使用 `shadow`（sm），Popover/Select 使用 `shadow-md`，Dialog 使用 `shadow-xl` / `shadow-2xl`。

### CSS 变量参考

```
主题色板（Dark 模式）:
  --background:   220 14% 9%    深空灰底色
  --foreground:   210 20% 92%   主文字
  --card:         220 12% 13%   卡片底色
  --primary:      217 91% 60%   主色调（冷蓝）
  --muted:        220 10% 17%   次要背景
  --muted-foreground: 220 8% 52%  次要文字
  --destructive:  0 72% 55%     危险操作红
  --border:       220 10% 20%   边框色
  --radius:       0.75rem       基础圆角
```

### 代码示例

**阴影层级**

```tsx
// ❌ 阴影使用不统一
<Card className="shadow-2xl">...</Card>       // Card 过重
<DialogContent className="shadow-md">...</DialogContent>  // Dialog 过轻

// ✅ 三级阴影规范
<Card className="shadow">...</Card>            // 1级: shadow（默认 sm）
<SelectContent className="shadow-md">...</SelectContent>  // 2级: shadow-md
<DialogContent className="shadow-2xl">...</DialogContent>  // 3级: shadow-2xl
```

**字体声明**

```css
/* ❌ 无字体声明，依赖浏览器默认 */

/* ✅ 在 index.css body 中统一声明 */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

### 检查清单

- [ ] Dark-only 策略不被破坏（不添加 Light 模式切换 UI）
- [ ] 阴影使用遵循 3 级规范：Card/shadow、Popover/shadow-md、Dialog/shadow-xl
- [ ] 所有圆角从 `--radius` 派生，不使用任意像素值（如 `rounded-[13px]`）
- [ ] 字体通过 `body` 声明统一系统字体栈，组件内不覆盖 `font-family`
- [ ] 自定义 keyframes（`animate-pulse-cyan`、`animate-heartbeat`）在 `index.css` 中集中定义

---

## 3. 组件体系

### 规范描述

UI 组件位于 `src/renderer/components/ui/`，基于 shadcn/ui + Radix UI 原语构建。所有页面优先使用已有 UI 组件，禁止重复造轮子。

shadcn/ui 生成的组件使用 `React.forwardRef`，此为第三方库代码，豁免 `10-tech-stack.md` 中禁止 `forwardRef` 的规则。应用自定义组件（`features/`、`components/` 根目录）禁止使用 `forwardRef`。

### 现有组件清单

| 组件 | 路径 | 用途 |
|------|------|------|
| Button | `ui/button.tsx` | 按钮（6 variant + 4 size） |
| Card | `ui/card.tsx` | 卡片容器（Card/Header/Title/Description/Content/Footer） |
| Input | `ui/input.tsx` | 文本输入框 |
| Textarea | `ui/textarea.tsx` | 多行文本输入 |
| Select | `ui/select.tsx` | 下拉选择 |
| Dialog | `ui/dialog.tsx` | 模态对话框 |
| AlertDialog | `ui/alert-dialog.tsx` | 确认对话框（替代原生 confirm） |
| Table | `ui/table.tsx` | 表格 |
| Badge | `ui/badge.tsx` | 标签 |
| StatusBadge | `ui/status-badge.tsx` | 状态标签 |
| Switch | `ui/switch.tsx` | 开关 |
| Checkbox | `ui/checkbox.tsx` | 复选框 |
| Label | `ui/label.tsx` | 表单标签 |
| PageHeader | `ui/page-header.tsx` | 页面头部 |
| EmptyState | `ui/empty-state.tsx` | 空状态占位 |
| TableSkeleton | `ui/table-skeleton.tsx` | 表格加载骨架屏 |
| Skeleton | `ui/skeleton.tsx` | 通用骨架屏 |
| Pagination | `ui/pagination.tsx` | 分页 |
| Popover | `ui/popover.tsx` | 弹出层 |
| ScrollArea | `ui/scroll-area.tsx` | 滚动区域 |
| Separator | `ui/separator.tsx` | 分隔线 |
| Progress | `ui/progress.tsx` | 进度条 |
| CodeEditor | `ui/code-editor.tsx` | 代码编辑器 |
| Markdown | `ui/markdown.tsx` | Markdown 渲染 |
| DropdownMenu | `ui/dropdown-menu.tsx` | 下拉菜单（已有，待使用） |
| Tooltip | `ui/tooltip.tsx` | 工具提示（已有，待使用） |
| Mermaid | `ui/mermaid.tsx` | Mermaid 图表（已有，待使用） |

### 代码示例

**使用 UI 组件 vs 原生元素**

```tsx
// ❌ 原生 textarea（ChatInput.tsx 当前问题）
<textarea
  className="flex-1 min-h-9 w-full rounded-md border border-input..."
  style={{ maxHeight: 200 }}
/>

// ✅ 使用 UI textarea 组件 + Tailwind 类
import { Textarea } from '@/components/ui/textarea'
<Textarea className="max-h-[200px] resize-none" />
```

```tsx
// ❌ 原生 motion.button（ConversationSidebar 当前问题）
<motion.button className="..." onClick={onNew}>
  <Plus className="w-4 h-4" />
  新建会话
</motion.button>

// ✅ 使用 Button 组件
<Button variant="outline" size="sm" onClick={onNew}>
  <Plus className="w-4 h-4" />
  新建会话
</Button>
```

**EmptyState 扩展**

```tsx
// ❌ EmptyState 外部再包裹操作按钮
<EmptyState icon={<Bot />} title="暂无 Agent" description="..." />
<Button className="mt-4">新建 Agent</Button>

// ✅ EmptyState 支持 action prop
<EmptyState
  icon={<Bot />}
  title="暂无 Agent"
  description="..."
  action={<Button onClick={onCreate}>新建 Agent</Button>}
/>
```

### 检查清单

- [ ] 使用已有 UI 组件而非原生 HTML 元素（textarea -> Textarea, button -> Button）
- [ ] 页面入场动画使用 `pageVariants` + `childVariants`，不内联定义
- [ ] 表单布局使用 Label + Input 组件，label 通过 `htmlFor` 关联 input
- [ ] 删除确认使用 `AlertDialog`，禁止 `window.confirm()`
- [ ] 空状态使用 `EmptyState` 组件
- [ ] 加载态使用 `Skeleton` / `TableSkeleton` 组件
- [ ] 新增 shadcn/ui 组件前先检查是否已存在

---

## 4. 目录结构

### 规范描述

`src/renderer/` 严格遵循分层架构：

```
components/
├── ui/              # 共享 UI 原子组件（shadcn/ui）
├── update/          # 更新功能域组件（待迁移到 features/update/）
├── Layout.tsx       # 全局布局
├── TitleBar.tsx     # 标题栏
├── ErrorBoundary.tsx
├── ChatInput.tsx        # ⚠️ 应迁移到 features/chat/components/
├── ChatMessage.tsx      # ⚠️ 应迁移到 features/chat/components/
├── ConversationSidebar.tsx  # ⚠️ 应迁移到 features/chat/components/
├── StatsCard.tsx        # ⚠️ 应迁移到 features/dashboard/components/
├── StatsCharts.tsx      # ⚠️ 应迁移到 features/dashboard/components/
├── StatusBar.tsx        # ⚠️ 应迁移到 features/dashboard/components/

features/
├── chat/
│   ├── components/    # ChatInput, ChatMessage, ConversationSidebar, ChatToolbar
│   └── hooks/         # useChatStream, useConversationManager
├── dashboard/
│   └── components/    # StatsCard, StatsCharts, StatusBar
├── update/
│   └── components/    # UpdateDialog, UpdateButton, DownloadProgress

pages/             # 路由页面（薄层，组合 features 组件）
hooks/             # 全局通用 hooks（useClipboard, useDeleteWithToast, useSavingAction）
lib/
├── ipc.ts         # IPC 快捷导出
├── types.ts       # 类型定义
├── utils.ts       # 工具函数
├── animations.ts  # 动画常量
└── queries/       # TanStack Query hooks（按域分文件）
```

### 代码示例

**正确的 feature 目录结构**

```
features/
├── chat/
│   ├── components/
│   │   ├── ChatInput.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ConversationSidebar.tsx
│   │   └── ChatToolbar.tsx
│   └── hooks/
│       ├── useChatStream.ts
│       └── useConversationManager.ts
├── dashboard/
│   └── components/
│       ├── StatsCard.tsx
│       ├── StatsCharts.tsx
│       └── StatusBar.tsx
```

**错误的目录放置**

```
// ❌ 功能域组件放在 components/ 根目录
components/ChatInput.tsx        // 属于 chat 功能域
components/StatsCard.tsx        // 属于 dashboard 功能域
components/StatusBar.tsx        // 属于 dashboard 功能域
components/update/UpdateDialog.tsx  // 属于 update 功能域

// ✅ 功能域组件放在 features/{name}/components/
features/chat/components/ChatInput.tsx
features/dashboard/components/StatsCard.tsx
features/dashboard/components/StatusBar.tsx
features/update/components/UpdateDialog.tsx
```

### 检查清单

- [ ] `components/ui/` 仅放共享原子组件，不放功能域组件
- [ ] 功能域组件放在 `features/{name}/components/`
- [ ] 功能域 hooks 放在 `features/{name}/hooks/`
- [ ] 全局通用 hooks 放在 `hooks/`（`useClipboard`、`useDeleteWithToast` 等）
- [ ] `pages/` 是薄层组合层，不包含复杂业务逻辑
- [ ] `lib/queries/` 按域分文件（`providers.ts`、`agents.ts`、`stats.ts` 等）
- [ ] 新增页面时同步创建对应的 `features/{name}/` 目录

---

## 5. 模块边界

### 规范描述

模块间单向依赖，禁止反向引用：

```
pages/ → features/{name}/components/ + lib/queries/
features/{name}/components/ → components/ui/ + features/{name}/hooks/
features/{name}/hooks/ → lib/ipc.ts → preload IPC
features/{name}/queries/ → lib/ipc.ts → preload IPC
components/ui/ → 无外部依赖（仅 Radix + Tailwind）
```

**禁止的导入方向：**

- `components/ui/` 不得导入 `features/`、`pages/`、`lib/queries/`
- `pages/` 不得直接导入 `shared/lib/`（应通过 `features/` 封装）
- `features/` 之间不得交叉导入

### 代码示例

**跨层依赖违规**

```tsx
// ❌ pages/Chat.tsx 直接导入 shared 层
import { setApiKey } from '@/shared/lib/api-client'

// ✅ 通过 features/chat/hooks/ 封装
// features/chat/hooks/useChatApi.ts
import { setApiKey } from '@/shared/lib/api-client'
export function useChatApi() { ... }

// pages/Chat.tsx
import { useChatApi } from '@/features/chat/hooks/useChatApi'
```

```tsx
// ❌ components/ui/markdown.tsx 直接导入 shared 层实现细节
import { highlight } from '@/shared/lib/shiki'

// ✅ 通过 renderer lib 层封装
// lib/shiki.ts
export { highlight } from '@/shared/lib/shiki'

// components/ui/markdown.tsx
import { highlight } from '@/lib/shiki'
```

```tsx
// ❌ ModelMappings 页面内直接定义 useQuery
function ModelMappingsPage() {
  const { data } = useQuery({
    queryKey: ['modelMappings'],
    queryFn: () => api.modelMappings.list(),
  })
  // ...
}

// ✅ 抽取到 lib/queries/modelMappings.ts
// lib/queries/modelMappings.ts
export function useModelMappings() {
  return useQuery({
    queryKey: ['modelMappings'],
    queryFn: () => api.modelMappings.list(),
  })
}

// pages/ModelMappings.tsx
import { useModelMappings } from '@/lib/queries/modelMappings'
```

### 检查清单

- [ ] `pages/` 不直接导入 `shared/lib/`（通过 `features/` 或 `lib/` 封装）
- [ ] `components/ui/` 不导入业务层代码
- [ ] 页面内的 `useQuery` / `useMutation` 全部抽取到 `lib/queries/`
- [ ] `features/` 之间不交叉导入组件或 hooks
- [ ] shared 层的实现细节（如 shiki）通过 `lib/` 中间层封装

---

## 6. 数据流

### 规范描述

业务 CRUD 全部通过 TanStack Query 走 IPC。`lib/queries/` 是数据请求的唯一入口，页面和组件禁止直接调用 `useQuery` / `useMutation`。

queryKey 采用 `['domain', 'action', ...params]` 格式，便于未来缓存管理。

错误处理：禁止静默吞没错误（`.catch(() => {})`），必须通过 `toast.error()` 或 `logger.error()` 记录。

### 代码示例

**queryKey 规范**

```tsx
// ❌ 简单字符串数组
queryKey: ['providers']
queryKey: ['logs']

// ✅ 层级化数组（推荐，便于 invalidation 粒度控制）
queryKey: ['providers', 'list']
queryKey: ['providers', 'detail', id]
queryKey: ['logs', 'list', page, pageSize]
queryKey: ['stats', 'hourly']
```

**错误处理**

```tsx
// ❌ 静默吞没错误（Chat.tsx 当前问题）
api.conversations.addMessage(...)
  .then(() => { ... })
  .catch(() => {})

// ✅ 记录错误并提示用户
api.conversations.addMessage(...)
  .then(() => { ... })
  .catch((error) => {
    logger.error('Failed to save message', { error })
    toast.error('保存消息失败')
  })
```

**IPC 类型安全**

```tsx
// ❌ 隐式 any
ipcMain.handle('modelMappings:list', async (_event, data) => { ... })

// ✅ 显式类型
ipcMain.handle('modelMappings:list', async (_event: IpcMainInvokeEvent) => { ... })
```

### 检查清单

- [ ] 所有 CRUD 数据请求通过 `lib/queries/` 封装
- [ ] 页面不直接调用 `useQuery` / `useMutation`
- [ ] queryKey 使用数组格式 `['domain', 'action', ...params]`
- [ ] `.catch()` 中记录错误（toast 或 logger），不静默吞没
- [ ] IPC handler 的 `data` 参数有显式类型标注（禁止隐式 `any`）
- [ ] `QueryClient` 的 `defaultOptions.queries.retry` 错误订阅使用具体类型（非 `any`）

---

## 7. 复用规则

### 规范描述

重复出现 3 次以上的 UI 模式必须抽取为共享组件或 hook。已有的 hooks 和工具必须被使用，禁止重复造轮子。

### 重点复用场景

| 重复模式 | 抽取方案 | 涉及文件 |
|---------|---------|---------|
| 编辑/删除按钮组 | `ActionButtons` 组件 | Providers.tsx, ApiKeys.tsx, Agents.tsx |
| Dialog 表单布局 | `FormDialog` 组件 | Providers.tsx, ApiKeys.tsx, Agents.tsx, ModelMappings.tsx |
| 剪贴板复制 | `useClipboard` hook | ApiKeys.tsx（内联 navigator.clipboard） |
| 页面入场动画 | `pageVariants` + `childVariants` | Providers.tsx, ApiKeys.tsx, Logs.tsx, ModelMappings.tsx |
| Proxy 状态展示 | 合并 Dashboard + StatusBar | Dashboard.tsx, StatusBar.tsx |

### 代码示例

**ActionButtons 组件（建议）**

```tsx
// components/ui/action-buttons.tsx
interface ActionButtonsProps {
  onEdit: () => void
  onDelete: () => void
  editLabel?: string
  deleteLabel?: string
}

export function ActionButtons({ onEdit, onDelete, editLabel = '编辑', deleteLabel = '删除' }: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" size="icon" onClick={onEdit} title={editLabel}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onDelete} title={deleteLabel} className="text-destructive hover:text-destructive">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  )
}
```

```tsx
// ❌ 每个页面重复手写操作按钮
<div className="flex items-center justify-end gap-2">
  <Button variant="ghost" size="icon" onClick={handleEdit}>
    <Pencil className="w-4 h-4" />
  </Button>
  <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:text-destructive">
    <Trash2 className="w-4 h-4" />
  </Button>
</div>

// ✅ 使用 ActionButtons 组件
<ActionButtons onEdit={handleEdit} onDelete={handleDelete} />
```

**useClipboard 复用**

```tsx
// ❌ ApiKeys.tsx 内联 clipboard 逻辑
navigator.clipboard.writeText(value).then(() => {
  setCopiedId(id)
  setTimeout(() => setCopiedId(null), 2000)
})

// ✅ 使用已有 useClipboard hook
import { useClipboard } from '@/hooks/useClipboard'
const { copied, copy } = useClipboard()
// copy(value) 即可
```

**页面入场动画统一**

```tsx
// ❌ 每个页面内联动画定义（Providers.tsx, Logs.tsx, ModelMappings.tsx）
<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>

// ✅ 使用共享动画常量
import { pageVariants, childVariants } from '@/lib/animations'
<motion.div variants={pageVariants} initial="hidden" animate="show">
  <motion.div variants={childVariants}>...</motion.div>
</motion.div>
```

### 检查清单

- [ ] 剪贴板操作使用 `useClipboard` hook，不内联 `navigator.clipboard`
- [ ] 编辑/删除按钮组使用统一的 `ActionButtons` 组件
- [ ] Dialog 表单布局使用统一的 `FormDialog` 模式
- [ ] 页面入场动画使用 `pageVariants` + `childVariants`
- [ ] 新增 UI 模式前先搜索是否已有可复用的组件/hook
- [ ] 出现 3 次以上的重复模式必须抽取

---

## 8. 动效规范

### 规范描述

项目使用两套动画系统，职责边界明确：

| 系统 | 用途 | 范围 |
|------|------|------|
| **framer-motion** | 页面入场、列表交错、布局动画 | `pages/`、`features/` 组件 |
| **tailwindcss-animate** | Radix 原语的显隐动画 | `Dialog`、`Select`、`Popover`、`AlertDialog` |

### 时长标准

| 场景 | duration | easing |
|------|----------|--------|
| 页面入场 | 0.3s | `[0.16, 1, 0.3, 1]`（ease-out-expo） |
| 子元素入场 | 0.2s | `'easeOut'` |
| 交互反馈（hover/press） | 0.15s | `'easeOut'` |
| 列表行交错 | 0.2s + `delay: idx * 0.03` | `'easeOut'` |

### 代码示例

**页面入场动画**

```tsx
// ❌ 内联动画定义（3 种风格不统一）
// 风格 1: Dashboard/Settings — pageVariants+childVariants
<motion.div variants={pageVariants} initial="hidden" animate="show">

// 风格 2: Providers/Logs — 内联 initial/animate
<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>

// 风格 3: Chat — 简单 opacity
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

// ✅ 全部统一为 pageVariants + childVariants
import { pageVariants, childVariants } from '@/lib/animations'

<motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
  <motion.div variants={childVariants}>
    <PageHeader title="..." />
  </motion.div>
  <motion.div variants={childVariants}>
    {/* 页面内容 */}
  </motion.div>
</motion.div>
```

**列表行入场**

```tsx
// ❌ 手写行动画
<motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}>

// ✅ 使用 rowFadeIn 工具函数
import { rowFadeIn } from '@/lib/animations'
<motion.tr {...rowFadeIn(idx)}>
```

**两套动画系统分工**

```tsx
// ❌ 页面使用 tailwindcss-animate 的 animate-in 类
<div className="animate-in fade-in slide-in-from-bottom-4 duration-300">

// ❌ Dialog 使用 framer-motion
<motion.div animate={{ opacity: 1 }}><DialogContent>...</DialogContent></motion.div>

// ✅ 页面用 framer-motion
<motion.div variants={pageVariants} initial="hidden" animate="show">

// ✅ Dialog 用 tailwindcss-animate（已内置于 Radix 原语的 data-[state] 属性）
<DialogContent> {/* DialogContent 已内置 animate-in/animate-out */} </DialogContent>
```

**自定义 keyframes 管理**

```css
/* ❌ 散落在各处或仅用一次的 keyframes */
@keyframes heartbeat { ... }  /* 仅 Dashboard StatsCard 使用一次 */

/* ✅ 仅保留高频使用的全局 keyframes（index.css）
   低频使用的动画内联到使用处或移入 animations.ts */
/* 保留: animate-pulse-cyan — StatusBar 使用 */
/* 移除: animate-heartbeat — 改为 StatsCard 内联 */
```

```tsx
// StatsCard.tsx 内联 heartbeat 动画（仅此一处使用）
const heartbeatStyle = {
  animation: 'heartbeat 2.5s ease-in-out infinite',
}
```

### 检查清单

- [ ] 页面入场使用 `pageVariants` + `childVariants`，不内联 initial/animate/transition
- [ ] 列表行入场使用 `rowFadeIn(idx)` 工具函数
- [ ] Radix 原语（Dialog/Select/Popover）的动画由 `tailwindcss-animate` 的 `data-[state]` 属性控制
- [ ] 页面/列表动画由 `framer-motion` 控制
- [ ] duration 遵循标准：页面 0.3s、子元素 0.2s、交互 0.15s
- [ ] easing 遵循标准：页面 `[0.16, 1, 0.3, 1]`、子元素 `'easeOut'`
- [ ] `index.css` 中的自定义 keyframes 仅保留全局高频使用的
- [ ] 低频动画内联到使用处或移入 `lib/animations.ts`

---

## 附录：待迁移清单

以下是代码审查发现的待迁移项，按优先级排列：

| 优先级 | 当前位置 | 目标位置 | 说明 |
|--------|---------|---------|------|
| P0 | `components/ChatInput.tsx` | `features/chat/components/` | chat 功能域组件 |
| P0 | `components/ChatMessage.tsx` | `features/chat/components/` | chat 功能域组件 |
| P0 | `components/ConversationSidebar.tsx` | `features/chat/components/` | chat 功能域组件 |
| P1 | `components/StatsCard.tsx` | `features/dashboard/components/` | dashboard 功能域组件 |
| P1 | `components/StatsCharts.tsx` | `features/dashboard/components/` | dashboard 功能域组件 |
| P1 | `components/StatusBar.tsx` | `features/dashboard/components/` | dashboard 功能域组件 |
| P1 | `components/update/` | `features/update/components/` | 功能域目录 |
| P2 | `hooks/` | `lib/hooks/` 或保持现状 | hooks 与 lib 平级的合理性待定 |
| P2 | ApiKeys.tsx 内联 clipboard | 使用 `useClipboard` | 已有 hook 未使用 |
| P2 | 4 个页面内联动画定义 | 使用 `pageVariants` | 已有动画常量未使用 |
| P3 | 新增 Tabs 组件 | `components/ui/tabs.tsx` | Logs Debug 开关、Settings 分区 |
| P3 | 新增 Accordion 组件 | `components/ui/accordion.tsx` | Dashboard/Agents 展开收起 |
| P3 | 新增 Form 组件 | `components/ui/form.tsx` | 表单布局统一 |
