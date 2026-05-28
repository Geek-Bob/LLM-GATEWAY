# UI Redesign: shadcn/ui + macOS 26 风格 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LLM Gateway 的渲染进程 UI 从自定义 CSS 类体系迁移到 shadcn/ui 组件库 + macOS 26 视觉风格 + TanStack Query 数据层 + react-router-dom 路由。

**Architecture:** shadcn/ui 组件 copy-to 项目 `src/renderer/components/ui/`，通过 Tailwind v4 的 `@theme` 指令定义设计令牌。路由从手动 switch 迁移到 react-router-dom v7 HashRouter。数据层从 useEffect+useState 迁移到 TanStack Query。

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Radix), framer-motion, recharts, TanStack Query, react-router-dom v7, Lucide React, Sonner

**Spec:** `docs/superpowers/specs/2026-05-28-ui-redesign-shadcn-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/renderer/lib/utils.ts` | `cn()` 工具函数 (clsx + tailwind-merge) |
| `src/renderer/lib/queries/providers.ts` | Provider 查询/mutation hooks |
| `src/renderer/lib/queries/stats.ts` | Dashboard 统计查询 hooks |
| `src/renderer/lib/queries/logs.ts` | 日志查询 hooks |
| `src/renderer/lib/queries/apiKeys.ts` | API Key 查询/mutation hooks |
| `src/renderer/lib/queries/proxy.ts` | 代理状态查询 hooks |
| `src/renderer/lib/queries/conversations.ts` | 会话查询/mutation hooks |
| `src/renderer/components/ui/button.tsx` | shadcn Button |
| `src/renderer/components/ui/input.tsx` | shadcn Input |
| `src/renderer/components/ui/card.tsx` | shadcn Card |
| `src/renderer/components/ui/badge.tsx` | shadcn Badge |
| `src/renderer/components/ui/table.tsx` | shadcn Table |
| `src/renderer/components/ui/dialog.tsx` | shadcn Dialog |
| `src/renderer/components/ui/popover.tsx` | shadcn Popover |
| `src/renderer/components/ui/select.tsx` | shadcn Select |
| `src/renderer/components/ui/switch.tsx` | shadcn Switch |
| `src/renderer/components/ui/skeleton.tsx` | shadcn Skeleton |
| `src/renderer/components/ui/sonner.tsx` | shadcn Toaster wrapper |
| `src/renderer/components/ui/separator.tsx` | shadcn Separator |
| `src/renderer/components/ui/scroll-area.tsx` | shadcn ScrollArea |
| `src/renderer/components/ui/dropdown-menu.tsx` | shadcn DropdownMenu |
| `src/renderer/components/ui/tooltip.tsx` | shadcn Tooltip |

### Modified Files
| File | Change |
|------|--------|
| `package.json` | 新增依赖 |
| `src/renderer/index.css` | 替换为 shadcn 主题系统 |
| `src/renderer/main.tsx` | 添加 QueryClientProvider |
| `src/renderer/App.tsx` | HashRouter + Routes |
| `src/renderer/components/Layout.tsx` | Outlet + NavLink + 毛玻璃 |
| `src/renderer/components/TitleBar.tsx` | macOS 26 风格 |
| `src/renderer/components/StatusBar.tsx` | shadcn 组件 |
| `src/renderer/components/StatsCard.tsx` | shadcn Card |
| `src/renderer/components/StatsCharts.tsx` | 适配新主题色 |
| `src/renderer/components/ConversationSidebar.tsx` | shadcn 组件 |
| `src/renderer/components/ChatMessage.tsx` | shadcn 组件 |
| `src/renderer/components/ChatInput.tsx` | shadcn Input + Button |
| `src/renderer/pages/Dashboard.tsx` | 全量重写 |
| `src/renderer/pages/Providers.tsx` | 全量重写 |
| `src/renderer/pages/ApiKeys.tsx` | 全量重写 |
| `src/renderer/pages/Logs.tsx` | 全量重写 |
| `src/renderer/pages/Chat.tsx` | 全量重写 |

---

## Task 1: 安装依赖 + shadcn/ui 初始化

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装运行时依赖**

```bash
npm install @tanstack/react-query class-variance-authority clsx tailwind-merge lucide-react sonner
```

- [ ] **Step 2: 安装 shadcn/ui 的 Radix peer 依赖**

```bash
npm install @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-separator @radix-ui/react-scroll-area @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-slot
```

- [ ] **Step 3: 验证安装**

Run: `npm run build`
Expected: 构建成功，无新增错误

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json
git commit -m "deps: 添加 shadcn/ui + TanStack Query + Lucide + Sonner 依赖"
```

---

## Task 2: 主题系统 + cn() 工具

**Files:**
- Rewrite: `src/renderer/index.css`
- Create: `src/renderer/lib/utils.ts`

- [ ] **Step 1: 创建 cn() 工具函数**

创建 `src/renderer/lib/utils.ts`：

```ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: 重写 index.css 主题系统**

替换 `src/renderer/index.css` 全部内容：

```css
@import "tailwindcss";

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 7%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 7%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 7%;
    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14% 96%;
    --secondary-foreground: 222 47% 7%;
    --muted: 220 14% 96%;
    --muted-foreground: 220 9% 46%;
    --accent: 220 14% 96%;
    --accent-foreground: 222 47% 7%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 217 91% 60%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 222 47% 7%;
    --foreground: 210 40% 96%;
    --card: 222 30% 10%;
    --card-foreground: 210 40% 96%;
    --popover: 222 30% 10%;
    --popover-foreground: 210 40% 96%;
    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217 20% 17%;
    --secondary-foreground: 210 40% 96%;
    --muted: 217 20% 17%;
    --muted-foreground: 215 10% 55%;
    --accent: 217 20% 17%;
    --accent-foreground: 210 40% 96%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 217 20% 18%;
    --input: 217 20% 18%;
    --ring: 217 91% 60%;
    --radius: 0.75rem;
  }
}

@theme inline {
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

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    -webkit-user-select: none;
    user-select: none;
    -webkit-font-smoothing: antialiased;
  }
}

.drag { -webkit-app-region: drag; }
.no-drag { -webkit-app-region: no-drag; }

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb:active { background: hsl(var(--muted-foreground) / 0.3); }
::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }

@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.animate-pulse-cyan { animation: pulse-dot 2s ease-in-out infinite; }

@keyframes heartbeat { 0%, 100% { opacity: 0.6; box-shadow: 0 0 4px currentColor; } 50% { opacity: 1; box-shadow: 0 0 14px currentColor; } }
.animate-heartbeat { animation: heartbeat 2.5s ease-in-out infinite; }
```

- [ ] **Step 3: 验证编译**

Run: `npm run build`
Expected: 编译通过（Tailwind v4 的 `@theme` 语法可能需要验证 electron-vite 兼容性，如有问题将 `@theme inline` 改为 `@theme`）

- [ ] **Step 4: 提交**

```bash
git add src/renderer/index.css src/renderer/lib/utils.ts
git commit -m "feat: shadcn/ui 主题系统 + cn() 工具函数"
```

---

## Task 3: shadcn/ui 基础组件

**Files:**
- Create: `src/renderer/components/ui/button.tsx`
- Create: `src/renderer/components/ui/input.tsx`
- Create: `src/renderer/components/ui/card.tsx`
- Create: `src/renderer/components/ui/badge.tsx`
- Create: `src/renderer/components/ui/table.tsx`
- Create: `src/renderer/components/ui/skeleton.tsx`
- Create: `src/renderer/components/ui/separator.tsx`
- Create: `src/renderer/components/ui/switch.tsx`

手动创建这些组件（不依赖 `shadcn init` CLI，避免 Tailwind v4 兼容问题）。每个组件遵循 shadcn/ui 的标准实现模式。

- [ ] **Step 1: 创建 Button 组件**

创建 `src/renderer/components/ui/button.tsx`：

```tsx
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

- [ ] **Step 2: 创建 Input 组件**

创建 `src/renderer/components/ui/input.tsx`：

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
```

- [ ] **Step 3: 创建 Card 组件**

创建 `src/renderer/components/ui/card.tsx`：

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground shadow', className)} {...props} />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

- [ ] **Step 4: 创建 Badge 组件**

创建 `src/renderer/components/ui/badge.tsx`：

```tsx
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
```

- [ ] **Step 5: 创建 Table 组件**

创建 `src/renderer/components/ui/table.tsx`：

```tsx
import * as React from 'react'
import { cn } from '../../lib/utils'

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  )
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
)
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
  )
)
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
  )
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />
  )
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('p-4 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />
  )
)
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  )
)
TableCaption.displayName = 'TableCaption'

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
```

- [ ] **Step 6: 创建 Skeleton 组件**

创建 `src/renderer/components/ui/skeleton.tsx`：

```tsx
import { cn } from '../../lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-primary/10', className)} {...props} />
}

export { Skeleton }
```

- [ ] **Step 7: 创建 Separator 组件**

创建 `src/renderer/components/ui/separator.tsx`：

```tsx
import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '../../lib/utils'

const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]', className)}
    {...props}
  />
))
Separator.displayName = SeparatorPrimitive.Root.displayName

export { Separator }
```

- [ ] **Step 8: 创建 Switch 组件**

创建 `src/renderer/components/ui/switch.tsx`：

```tsx
import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cn } from '../../lib/utils'

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn('pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0')}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
```

- [ ] **Step 9: 验证编译**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 10: 提交**

```bash
git add src/renderer/components/ui/ src/renderer/lib/utils.ts
git commit -m "feat: 添加 shadcn/ui 基础组件 (Button, Input, Card, Badge, Table, Skeleton, Separator, Switch)"
```

---

## Task 4: Dialog, Popover, Select, DropdownMenu, Tooltip, ScrollArea, Sonner 组件

**Files:**
- Create: `src/renderer/components/ui/dialog.tsx`
- Create: `src/renderer/components/ui/popover.tsx`
- Create: `src/renderer/components/ui/select.tsx`
- Create: `src/renderer/components/ui/dropdown-menu.tsx`
- Create: `src/renderer/components/ui/tooltip.tsx`
- Create: `src/renderer/components/ui/scroll-area.tsx`
- Create: `src/renderer/components/ui/sonner.tsx`

这些组件代码较长，标准 shadcn/ui 实现。核心逻辑由 Radix 原语处理，组件壳负责样式类映射。

- [ ] **Step 1: 创建 Dialog 组件**

创建 `src/renderer/components/ui/dialog.tsx`，遵循 shadcn/ui 标准实现：`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`。`DialogContent` 使用 `fixed inset-0 z-50` 全屏 overlay + `fixed left-[50%] top-[50%]` 居中面板。圆角 `rounded-2xl`，背景 `bg-popover`，阴影 `shadow-2xl`。

具体代码参考 shadcn/ui 官方 Dialog 源码：https://ui.shadcn.com/docs/components/dialog

- [ ] **Step 2: 创建 Popover 组件**

创建 `src/renderer/components/ui/popover.tsx`，标准实现：`Popover`, `PopoverTrigger`, `PopoverContent`。`PopoverContent` 使用 `w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-md`。

- [ ] **Step 3: 创建 Select 组件**

创建 `src/renderer/components/ui/select.tsx`，标准实现：`Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`。`SelectTrigger` 圆角 `rounded-lg`。

- [ ] **Step 4: 创建 DropdownMenu 组件**

创建 `src/renderer/components/ui/dropdown-menu.tsx`，标准实现：`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuLabel`。

- [ ] **Step 5: 创建 Tooltip 组件**

创建 `src/renderer/components/ui/tooltip.tsx`，标准实现：`TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`。

- [ ] **Step 6: 创建 ScrollArea 组件**

创建 `src/renderer/components/ui/scroll-area.tsx`，标准实现：`ScrollArea`, `ScrollBar`。

- [ ] **Step 7: 创建 Sonner Toaster 包装**

创建 `src/renderer/components/ui/sonner.tsx`：

```tsx
import { Toaster } from 'sonner'

export function Sonner() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'hsl(var(--popover))',
          color: 'hsl(var(--popover-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      }}
    />
  )
}
```

- [ ] **Step 8: 验证编译**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 9: 提交**

```bash
git add src/renderer/components/ui/
git commit -m "feat: 添加 shadcn/ui 复杂组件 (Dialog, Popover, Select, DropdownMenu, Tooltip, ScrollArea, Sonner)"
```

---

## Task 5: TanStack Query Hooks

**Files:**
- Create: `src/renderer/lib/queries/providers.ts`
- Create: `src/renderer/lib/queries/stats.ts`
- Create: `src/renderer/lib/queries/logs.ts`
- Create: `src/renderer/lib/queries/apiKeys.ts`
- Create: `src/renderer/lib/queries/proxy.ts`
- Create: `src/renderer/lib/queries/conversations.ts`

- [ ] **Step 1: 创建 providers 查询 hooks**

创建 `src/renderer/lib/queries/providers.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { Provider } from '../types'

export function useProviders() {
  return useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => api.providers.list(),
  })
}

export function useCreateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; providerType: string; baseUrl: string; apiKey: string; models: string[] }) =>
      api.providers.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

export function useUpdateProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.providers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}

export function useDeleteProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.providers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })
}
```

- [ ] **Step 2: 创建 stats 查询 hooks**

创建 `src/renderer/lib/queries/stats.ts`：

```ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../ipc'
import type { DashboardStats, ProviderStatsGroup } from '../types'

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['stats', '7d'],
    queryFn: () => api.logs.stats('7d'),
  })
}

export function useHourlyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', '24h'],
    queryFn: () => api.logs.statsDetailed('24h'),
  })
}

export function useDailyStats() {
  return useQuery<ProviderStatsGroup[]>({
    queryKey: ['stats', '30d'],
    queryFn: () => api.logs.statsDetailed('30d'),
  })
}
```

- [ ] **Step 3: 创建 logs 查询 hooks**

创建 `src/renderer/lib/queries/logs.ts`：

```ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../ipc'
import type { LogEntry } from '../types'

interface LogsResult {
  logs: LogEntry[]
  total: number
}

export function useLogs(page: number, limit: number) {
  return useQuery<LogsResult>({
    queryKey: ['logs', page, limit],
    queryFn: () => api.logs.query({ page, limit }),
  })
}
```

- [ ] **Step 4: 创建 apiKeys 查询 hooks**

创建 `src/renderer/lib/queries/apiKeys.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { ApiKey } from '../types'

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['apiKeys'],
    queryFn: () => api.apiKeys.list(),
  })
}

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, rateLimit }: { name: string; rateLimit?: number }) =>
      api.apiKeys.create(name, rateLimit),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.apiKeys.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apiKeys'] }),
  })
}
```

- [ ] **Step 5: 创建 proxy 查询 hooks**

创建 `src/renderer/lib/queries/proxy.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { ProxyStatus } from '../types'

export function useProxyStatus() {
  return useQuery<ProxyStatus>({
    queryKey: ['proxy', 'status'],
    queryFn: () => api.proxy.status(),
  })
}

export function useToggleProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ running, port }: { running: boolean; port: number }) => {
      if (running) {
        await api.proxy.stop()
      } else {
        await api.proxy.setPort(port)
        await api.proxy.start(port)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'status'] }),
  })
}

export function useDebugMode() {
  return useQuery<boolean>({
    queryKey: ['proxy', 'debugMode'],
    queryFn: () => api.proxy.getDebugMode(),
  })
}

export function useSetDebugMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => api.proxy.setDebugMode(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'debugMode'] }),
  })
}
```

- [ ] **Step 6: 创建 conversations 查询 hooks**

创建 `src/renderer/lib/queries/conversations.ts`：

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { Conversation } from '../types'

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: () => api.conversations.list(),
  })
}

export function useCreateConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) =>
      api.conversations.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}

export function useDeleteConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.conversations.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  })
}
```

- [ ] **Step 7: 验证编译**

Run: `npm run build`
Expected: 编译通过

- [ ] **Step 8: 提交**

```bash
git add src/renderer/lib/queries/
git commit -m "feat: 添加 TanStack Query hooks (providers, stats, logs, apiKeys, proxy, conversations)"
```

---

## Task 6: App.tsx + Layout + TitleBar + Router 迁移

**Files:**
- Rewrite: `src/renderer/App.tsx`
- Rewrite: `src/renderer/main.tsx`
- Rewrite: `src/renderer/components/Layout.tsx`
- Rewrite: `src/renderer/components/TitleBar.tsx`

- [ ] **Step 1: 重写 main.tsx — 添加 QueryClientProvider**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 2: 重写 App.tsx — HashRouter**

```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ProvidersPage } from './pages/Providers'
import { ApiKeysPage } from './pages/ApiKeys'
import { LogsPage } from './pages/Logs'
import { ChatPage } from './pages/Chat'
import { Sonner } from './components/ui/sonner'

function App() {
  return (
    <>
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
      <Sonner />
    </>
  )
}

export default App
```

- [ ] **Step 3: 重写 Layout.tsx — Outlet + NavLink + 毛玻璃**

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Building2, Key, ScrollText, MessageSquare } from 'lucide-react'
import { TitleBar } from './TitleBar'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard },
  { to: '/providers', label: '供应商', icon: Building2 },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/logs', label: '请求日志', icon: ScrollText },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
]

export function Layout() {
  return (
    <div className="dark h-screen flex flex-col bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — macOS 26 毛玻璃 */}
        <nav className="w-60 shrink-0 flex flex-col py-3 backdrop-blur-xl bg-background/60 border-r border-border/50">
          <div className="px-4 pb-3 mb-2 border-b border-border/50">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">导航</p>
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 mx-2 px-4 py-2.5 text-sm text-left rounded-xl transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="activeNav"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <motion.main
          className="flex-1 overflow-auto p-8"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 重写 TitleBar.tsx — macOS 26 风格**

```tsx
import { api } from '../lib/ipc'
import { Minus, Square, X } from 'lucide-react'
import { cn } from '../lib/utils'

export function TitleBar() {
  const handleMinimize = () => api.window.minimize()
  const handleMaximize = () => api.window.maximize()
  const handleClose = () => api.window.close()

  return (
    <div className="drag flex items-center justify-between h-10 px-4 shrink-0 backdrop-blur-xl bg-background/60 border-b border-border/50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" />
          <span className="text-sm font-bold tracking-tight text-foreground">LLM Gateway</span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary">
          v1.0
        </span>
      </div>
      <div className="no-drag flex items-center gap-1">
        {[
          { action: handleMinimize, icon: Minus, label: '最小化', hoverBg: 'hover:bg-accent' },
          { action: handleMaximize, icon: Square, label: '最大化', hoverBg: 'hover:bg-accent' },
          { action: handleClose, icon: X, label: '关闭', hoverBg: 'hover:bg-destructive/15 hover:text-destructive' },
        ].map(({ action, icon: Icon, label, hoverBg }) => (
          <button
            key={label}
            onClick={action}
            className={cn('w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200 text-muted-foreground', hoverBg)}
            aria-label={label}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 验证编译 + 路由**

Run: `npm run build`
Expected: 编译通过。注意此时页面内容还用旧组件（Dashboard 等），但路由和布局已生效。

- [ ] **Step 6: 提交**

```bash
git add src/renderer/App.tsx src/renderer/main.tsx src/renderer/components/Layout.tsx src/renderer/components/TitleBar.tsx
git commit -m "feat: react-router-dom HashRouter + TanStack QueryProvider + macOS 26 Layout"
```

---

## Task 7: Dashboard 页面重写

**Files:**
- Rewrite: `src/renderer/pages/Dashboard.tsx`
- Rewrite: `src/renderer/components/StatsCard.tsx`
- Modify: `src/renderer/components/StatsCharts.tsx`

- [ ] **Step 1: 重写 StatsCard — 使用 shadcn Card + Lucide**

```tsx
import { Card, CardContent } from './ui/card'
import { cn } from '../lib/utils'
import { motion } from 'framer-motion'

interface StatsCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
}

export function StatsCard({ title, value, icon }: StatsCardProps) {
  return (
    <motion.div whileHover={{ y: -2, transition: { duration: 0.2 } }}>
      <Card className="relative overflow-hidden group transition-shadow hover:shadow-md border-border/50">
        <div className="absolute top-0 left-0 w-full h-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-primary to-primary/60" />
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-3">
            <span className="text-muted-foreground">{icon}</span>
          </div>
          <p className="text-xs font-medium mb-1 text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
```

- [ ] **Step 2: 更新 StatsCharts — 使用 CSS 变量颜色**

修改 `src/renderer/components/StatsCharts.tsx`，将硬编码颜色替换为 CSS 变量引用：

- `fill="#3b82f6"` → `fill="hsl(var(--primary))"`
- `stroke="#3b82f6"` → `stroke="hsl(var(--primary))"`
- `fill: '#8b949e'` → `fill: 'hsl(var(--muted-foreground))'`
- `contentStyle` 背景和边框改用 `hsl(var(--card))` 和 `hsl(var(--border))`

- [ ] **Step 3: 重写 Dashboard 页面**

使用 shadcn Card + Table + Switch + TanStack Query hooks 重写。关键变更：
- `useDashboardStats()`, `useHourlyStats()`, `useDailyStats()`, `useProviders()`, `useProxyStatus()` 替换 useEffect+useState
- 代理开关使用 shadcn `Switch` 组件
- 统计卡片使用新的 `StatsCard` + Lucide 图标（`BarChart3`, `Coins`, `Building2`, `Zap`）
- 调用统计表使用 shadcn Table 组件
- 时间趋势手风琴使用 shadcn Card + AnimatePresence
- 所有 inline style 替换为 Tailwind 类

- [ ] **Step 4: 验证页面效果**

Run: `npm run dev`，在浏览器中检查 Dashboard 页面：
- 统计卡片正确渲染
- 代理开关工作正常
- 图表颜色与主题一致
- 表格样式正确

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: 测试通过（如有 Dashboard 相关测试需更新）

- [ ] **Step 6: 提交**

```bash
git add src/renderer/pages/Dashboard.tsx src/renderer/components/StatsCard.tsx src/renderer/components/StatsCharts.tsx
git commit -m "feat: Dashboard 页面 shadcn/ui 重写 + TanStack Query"
```

---

## Task 8: Providers 页面重写

**Files:**
- Rewrite: `src/renderer/pages/Providers.tsx`

- [ ] **Step 1: 重写 Providers 页面**

使用 shadcn 组件重写，关键变更：
- `useProviders()`, `useCreateProvider()`, `useUpdateProvider()`, `useDeleteProvider()` 替换手动 fetch
- 模态框：`createPortal` + `motion.div` → shadcn `Dialog` (Radix 原语，自带无障碍)
- API Key 查看：`createPortal` popover → shadcn `Popover`
- 表格：`.cyber-table` → shadcn `Table` 组件
- 按钮：`.btn-cyber` / `.btn-ghost` / `.btn-danger` → `<Button variant="default|ghost|destructive">`
- Badge：`.cyber-badge` → `<Badge variant="secondary">`
- 表单输入：`.cyber-input` → `<Input>`
- 删除确认：`window.confirm()` → shadcn `AlertDialog` 或保留 `confirm()`（如引入 AlertDialog 过重）
- 所有 inline style 替换为 Tailwind 类
- Lucide 图标替换手写 SVG

- [ ] **Step 2: 验证页面效果**

Run: `npm run dev`，检查：
- 供应商列表正确渲染
- 添加/编辑模态框工作正常，键盘 Tab 可导航
- API Key popover 显示/隐藏正常
- 删除操作正常

- [ ] **Step 3: 运行测试**

Run: `npm test`
Expected: 测试通过

- [ ] **Step 4: 提交**

```bash
git add src/renderer/pages/Providers.tsx
git commit -m "feat: Providers 页面 shadcn/ui 重写 (Dialog + Popover + Table)"
```

---

## Task 9: ApiKeys 页面重写

**Files:**
- Rewrite: `src/renderer/pages/ApiKeys.tsx`

- [ ] **Step 1: 重写 ApiKeys 页面**

使用 shadcn 组件重写，关键变更：
- `useApiKeys()`, `useCreateApiKey()`, `useDeleteApiKey()` 替换手动 fetch
- 两步模态框：shadcn `Dialog`，step='form' 和 step='result' 切换
- API Key 查看 popover：shadcn `Popover` 替代 `createPortal`
- 表格：shadcn Table
- 按钮/输入：shadcn Button/Input
- 复制反馈使用 `toast()` from sonner 替代手动状态管理

- [ ] **Step 2: 验证页面效果**

Run: `npm run dev`，检查：
- 创建 API Key 流程（表单 → 显示密钥 → 复制）
- 删除 API Key
- 列表显示正确

- [ ] **Step 3: 提交**

```bash
git add src/renderer/pages/ApiKeys.tsx
git commit -m "feat: ApiKeys 页面 shadcn/ui 重写 (Dialog + Popover + Table)"
```

---

## Task 10: Logs 页面重写

**Files:**
- Rewrite: `src/renderer/pages/Logs.tsx`

- [ ] **Step 1: 重写 Logs 页面**

使用 shadcn 组件重写，关键变更：
- `useLogs()`, `useDebugMode()`, `useSetDebugMode()` 替换手动 fetch
- Debug 开关：shadcn `Switch` 替代手写 toggle
- 表格：shadcn Table
- Badge：状态码和格式使用 shadcn Badge
- 分页按钮：shadcn Button (ghost variant)
- 详情面板：保留右侧滑出设计，但用 shadcn Card + Tailwind 替换 inline style
- `DebugSection` / `DebugKV` / `DebugJSON` 子组件改用 Tailwind 类

- [ ] **Step 2: 验证页面效果**

Run: `npm run dev`，检查：
- 日志列表分页正常
- Debug 开关切换正常
- 点击行展开详情面板
- Debug 详情 JSON 格式化显示正确

- [ ] **Step 3: 提交**

```bash
git add src/renderer/pages/Logs.tsx
git commit -m "feat: Logs 页面 shadcn/ui 重写 (Table + Switch + Badge)"
```

---

## Task 11: Chat 页面 + 子组件重写

**Files:**
- Rewrite: `src/renderer/pages/Chat.tsx`
- Rewrite: `src/renderer/components/ConversationSidebar.tsx`
- Rewrite: `src/renderer/components/ChatMessage.tsx`
- Rewrite: `src/renderer/components/ChatInput.tsx`

- [ ] **Step 1: 重写 ChatInput — shadcn Input + Button**

```tsx
import { useRef } from 'react'
import { Button } from './ui/button'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const el = inputRef.current
    if (!el) return
    const trimmed = el.value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    el.value = ''
    el.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="输入消息... (Shift+Enter 换行)"
        rows={1}
        disabled={disabled}
        className="flex-1 min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        style={{ maxHeight: 200, fontFamily: 'inherit' }}
      />
      <Button onClick={handleSend} disabled={disabled} size="default" className="px-4 py-2.5">
        <Send className="w-4 h-4" />
        发送
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: 重写 ChatMessage — Tailwind 类替换 inline style**

将所有 `style={{ color: '#...', background: '#...' }}` 替换为 Tailwind 类：
- 用户消息：`bg-primary/10 border-primary/20`
- 助手消息：`bg-muted/30 border-border/50`
- 错误消息：`bg-destructive/10 border-destructive/20`
- 思考过程折叠区域：`bg-muted/50 border-border/50`
- Lucide 图标替换手写 SVG（`ChevronDown`, `Square` 等）

- [ ] **Step 3: 重写 ConversationSidebar — Tailwind + Lucide**

将 inline style 替换为 Tailwind 类：
- 侧边栏背景：`border-r border-border/50`
- 选中项：`bg-primary/10 border-primary/20`
- Lucide 图标：`Plus`, `PanelLeftClose`, `PanelLeft`, `Trash2`

- [ ] **Step 4: 重写 Chat 页面**

关键变更：
- `useProviders()`, `useApiKeys()`, `useConversations()` 替换 useEffect+useState
- 工具栏 `<select>` → shadcn `Select` 组件
- 底部输入区：shadcn Card
- 停止按钮：shadcn Button (destructive variant)
- 空状态：shadcn Card + Lucide 图标

- [ ] **Step 5: 验证 Chat 功能**

Run: `npm run dev`，检查：
- 会话侧边栏折叠/展开
- 新建/删除/切换会话
- 供应商/模型/API Key 选择
- 发送消息 + 流式响应
- 思考过程折叠/展开
- 停止生成

- [ ] **Step 6: 运行全量测试**

Run: `npm test`
Expected: 测试通过（如有 Chat 相关测试需更新）

- [ ] **Step 7: 提交**

```bash
git add src/renderer/pages/Chat.tsx src/renderer/components/ConversationSidebar.tsx src/renderer/components/ChatMessage.tsx src/renderer/components/ChatInput.tsx
git commit -m "feat: Chat 页面 + 子组件 shadcn/ui 重写 (Select + Input + Button)"
```

---

## Task 12: StatusBar 更新 + 全局清理

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/index.css` (清理残留)

- [ ] **Step 1: 重写 StatusBar — shadcn Card + Badge + Lucide**

```tsx
import { useState } from 'react'
import { api } from '../lib/ipc'
import { useProxyStatus } from '../lib/queries/proxy'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'
import { Copy, Check, Wifi, WifiOff } from 'lucide-react'
import { motion } from 'framer-motion'

export function StatusBar() {
  const { data: status, isLoading } = useProxyStatus()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!status?.url) return
    try {
      await navigator.clipboard.writeText(status.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  if (isLoading) {
    return (
      <Card className="border-border/50 mb-6">
        <CardContent className="p-5">
          <Skeleton className="h-5 w-44" />
        </CardContent>
      </Card>
    )
  }

  if (!status) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="border-border/50 mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {status.running ? (
                <Wifi className="w-4 h-4 text-green-500 animate-pulse-cyan" />
              ) : (
                <WifiOff className="w-4 h-4 text-destructive" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {status.running ? '代理服务运行中' : '代理服务未运行'}
                </p>
                <p className="text-xs font-mono mt-0.5 text-muted-foreground">{status.url || '-'}</p>
              </div>
            </div>
            {status.url && (
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '复制'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
```

- [ ] **Step 2: 清理 index.css 中残留的自定义类**

从 `index.css` 中删除所有已替换的自定义类：
- `.cyber-card`
- `.cyber-card-elevated`
- `.cyber-input`
- `.cyber-select`
- `.btn-cyber`
- `.btn-ghost`
- `.btn-danger`
- `.cyber-table`
- `.cyber-badge`
- `.cyber-badge-dot`
- `.modal-backdrop`
- `.skeleton`

保留：
- `.drag` / `.no-drag`
- `::-webkit-scrollbar` 样式
- `@keyframes pulse-dot` / `.animate-pulse-cyan`
- `@keyframes heartbeat` / `.animate-heartbeat`

- [ ] **Step 3: 运行全量测试**

Run: `npm test`
Expected: 全部 294 测试通过

- [ ] **Step 4: 运行全量编译**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 5: 运行 lint**

Run: `npm run lint`
Expected: 无新增错误

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/index.css
git commit -m "refactor: StatusBar shadcn 化 + 清理残留自定义 CSS 类"
```

---

## Task 13: 最终验证

- [ ] **Step 1: 运行全量测试**

Run: `npm test`
Expected: 全部测试通过

- [ ] **Step 2: 运行全量编译**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: 运行 dev 并手动验证所有页面**

Run: `npm run dev`（注意 Windows 上需先设 TMPDIR 到 C 盘）

逐页检查：
- Dashboard: 统计卡片、代理开关、调用统计表、时间趋势图表
- Providers: 列表、添加/编辑/删除、API Key 查看 popover
- ApiKeys: 列表、创建（两步流程）、删除
- Logs: 列表分页、Debug 开关、详情面板
- Chat: 会话管理、流式对话、thinking 折叠

- [ ] **Step 4: 如有测试失败或编译错误，修复后提交**

---

## 任务依赖关系

```
Task 1 (依赖安装)
  └── Task 2 (主题 + cn())
       └── Task 3 (基础组件)
            ├── Task 4 (复杂组件)
            ├── Task 5 (Query hooks)
            └── Task 6 (Router + Layout)
                 ├── Task 7 (Dashboard)
                 ├── Task 8 (Providers)
                 ├── Task 9 (ApiKeys)
                 ├── Task 10 (Logs)
                 └── Task 11 (Chat)
                      └── Task 12 (StatusBar + 清理)
                           └── Task 13 (最终验证)
```

Tasks 7-11 可以并行执行（互相独立）。
