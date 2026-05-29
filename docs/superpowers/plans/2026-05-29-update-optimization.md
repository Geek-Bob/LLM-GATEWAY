# 自动更新功能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化自动更新功能的用户体验，包括删除硬编码版本号、添加关于我们页面、支持 Markdown 渲染

**Architecture:** 修改 TitleBar 删除版本号，在 Settings 页面添加关于我们区域，使用 react-markdown 渲染更新内容

**Tech Stack:** React, shadcn/ui, react-markdown, TanStack Query

---

## 文件结构

### 修改文件
- `src/renderer/components/TitleBar.tsx` — 删除版本号显示
- `src/renderer/pages/Settings.tsx` — 添加关于我们区域
- `src/renderer/components/update/UpdateDialog.tsx` — 使用 react-markdown 渲染更新内容

### 新增依赖
- `react-markdown` — Markdown 渲染库

---

### Task 1: 删除 TitleBar 版本号

**Files:**
- Modify: `src/renderer/components/TitleBar.tsx`

- [ ] **Step 1: 删除版本号显示**

修改 `src/renderer/components/TitleBar.tsx`，删除第 17-19 行的版本号显示：

```tsx
// 删除以下代码
<span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary">
  v1.0
</span>
```

修改后的代码：

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

- [ ] **Step 2: 运行测试确保无破坏**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 3: 提交更改**

```bash
git add src/renderer/components/TitleBar.tsx
git commit -m "fix: 删除 TitleBar 中硬编码的版本号"
```

---

### Task 2: 安装 react-markdown 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 react-markdown**

```bash
npm install react-markdown
```

Expected: 安装成功，package.json dependencies 中出现 react-markdown

- [ ] **Step 2: 提交依赖更新**

```bash
git add package.json package-lock.json
git commit -m "build: 添加 react-markdown 依赖"
```

---

### Task 3: 更新 UpdateDialog 支持 Markdown 渲染

**Files:**
- Modify: `src/renderer/components/update/UpdateDialog.tsx`

- [ ] **Step 1: 添加 react-markdown 导入**

修改 `src/renderer/components/update/UpdateDialog.tsx`，添加 react-markdown 导入：

```tsx
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'
```

- [ ] **Step 2: 修改更新内容渲染**

修改 `src/renderer/components/update/UpdateDialog.tsx`，将 `whitespace-pre-wrap` 替换为 ReactMarkdown：

```tsx
{releaseNotes && (
  <div>
    <h4 className="text-sm font-medium mb-2">更新内容</h4>
    <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{releaseNotes}</ReactMarkdown>
    </div>
  </div>
)}
```

完整的修改后代码：

```tsx
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download } from 'lucide-react'

interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentVersion: string
  newVersion: string
  releaseNotes?: string | null
  onUpdate: () => void
  onSkip: (version: string) => void
}

export function UpdateDialog({
  open,
  onOpenChange,
  currentVersion,
  newVersion,
  releaseNotes,
  onUpdate,
  onSkip,
}: UpdateDialogProps) {
  const [skipVersion, setSkipVersion] = useState(false)

  const handleCancel = () => {
    if (skipVersion) {
      onSkip(newVersion)
    }
    onOpenChange(false)
  }

  const handleUpdate = () => {
    onUpdate()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            发现新版本 v{newVersion}
          </DialogTitle>
          <DialogDescription>
            当前版本：v{currentVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {releaseNotes && (
            <div>
              <h4 className="text-sm font-medium mb-2">更新内容</h4>
              <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{releaseNotes}</ReactMarkdown>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-version"
              checked={skipVersion}
              onCheckedChange={(checked) => setSkipVersion(checked === true)}
            />
            <Label htmlFor="skip-version" className="text-sm">
              跳过此版本
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            稍后再说
          </Button>
          <Button onClick={handleUpdate}>立即更新</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 运行测试确保无破坏**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 4: 提交更改**

```bash
git add src/renderer/components/update/UpdateDialog.tsx
git commit -m "feat: 使用 react-markdown 渲染更新内容"
```

---

### Task 4: 添加关于我们页面

**Files:**
- Modify: `src/renderer/pages/Settings.tsx`

- [ ] **Step 1: 添加关于我们区域**

修改 `src/renderer/pages/Settings.tsx`，在自动更新区域后面添加关于我们区域：

```tsx
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateConfig, useUpdateConfigMutation } from '../lib/queries/update'
import { Switch } from '../components/ui/switch'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { UpdateButton } from '../components/update/UpdateButton'
import { useCurrentVersion } from '../lib/queries/update'

const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

export function SettingsPage() {
  const { data: config, isLoading } = useUpdateConfig()
  const { data: currentVersion } = useCurrentVersion()
  const updateConfig = useUpdateConfigMutation({
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={childVariants} className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">设置</h1>
          <p className="text-sm text-muted-foreground">管理应用配置和偏好</p>
        </div>
      </motion.div>

      <motion.div variants={childVariants}>
        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>自动更新</CardTitle>
              <CardDescription>配置应用自动更新行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-check">自动检查更新</Label>
                  <p className="text-sm text-muted-foreground">
                    应用启动时自动检查新版本
                  </p>
                </div>
                <Switch
                  id="auto-check"
                  checked={config?.autoCheck ?? true}
                  onCheckedChange={(checked) =>
                    updateConfig.mutate({ autoCheck: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-prerelease">允许预发布版本</Label>
                  <p className="text-sm text-muted-foreground">
                    接收测试版和预发布版本更新
                  </p>
                </div>
                <Switch
                  id="allow-prerelease"
                  checked={config?.allowPrerelease ?? false}
                  onCheckedChange={(checked) =>
                    updateConfig.mutate({ allowPrerelease: checked })
                  }
                />
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <Label>手动检查更新</Label>
                    <p className="text-sm text-muted-foreground">
                      立即检查是否有可用更新
                    </p>
                  </div>
                  <UpdateButton />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      <motion.div variants={childVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              关于我们
            </CardTitle>
            <CardDescription>应用信息和版本详情</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>应用名称</Label>
                <p className="text-sm text-muted-foreground">LLM Gateway</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>当前版本</Label>
                <p className="text-sm text-muted-foreground">
                  v{currentVersion || '加载中...'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>检查更新</Label>
                <p className="text-sm text-muted-foreground">
                  检查是否有可用的新版本
                </p>
              </div>
              <UpdateButton />
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
```

- [ ] **Step 2: 添加 useCurrentVersion hook**

修改 `src/renderer/lib/queries/update.ts`，添加 useCurrentVersion hook：

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { UpdateCheckResult, UpdateConfig } from '../../../shared/types'

export function useUpdateConfig() {
  return useQuery<UpdateConfig>({
    queryKey: ['update-config'],
    queryFn: () => api.update.getConfig(),
  })
}

export function useCurrentVersion() {
  return useQuery<string>({
    queryKey: ['current-version'],
    queryFn: () => api.update.getCurrentVersion(),
  })
}

export function useCheckUpdate() {
  return useMutation<UpdateCheckResult>({
    mutationFn: () => api.update.check(),
  })
}

export function useDownloadUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.update.download(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
  })
}

export function useInstallUpdate() {
  return useMutation({
    mutationFn: () => api.update.install(),
  })
}

export function useSkipVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (version: string) => api.update.skipVersion(version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
  })
}

export function useUpdateConfigMutation(
  options?: Partial<{ onError: (error: Error) => void }>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: Partial<UpdateConfig>) => api.update.setConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['update-config'] })
    },
    onError: options?.onError,
  })
}
```

- [ ] **Step 3: 运行测试确保无破坏**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 4: 提交更改**

```bash
git add src/renderer/pages/Settings.tsx src/renderer/lib/queries/update.ts
git commit -m "feat: 添加关于我们页面和当前版本显示"
```

---

### Task 5: 端到端测试

- [ ] **Step 1: 构建应用**

```bash
npm run build
```

Expected: 构建成功

- [ ] **Step 2: 启动开发服务器测试**

```bash
npm run dev
```

Expected: 应用启动成功

- [ ] **Step 3: 测试功能**

1. 检查 TitleBar 是否已删除版本号
2. 进入设置页面，检查"关于我们"区域是否显示
3. 点击"检查更新"按钮，检查更新对话框是否正确渲染 Markdown
4. 检查当前版本号是否正确显示

- [ ] **Step 4: 提交最终代码**

```bash
git add .
git commit -m "feat: 完成自动更新功能优化"
```

---

## 自审清单

### 1. 规范覆盖度
- ✅ 删除 TitleBar 版本号
- ✅ 添加关于我们页面
- ✅ 使用 react-markdown 渲染更新内容

### 2. 占位符扫描
- ✅ 无 TBD/TODO 标记
- ✅ 所有代码完整

### 3. 类型一致性
- ✅ useCurrentVersion hook 返回类型一致
- ✅ UpdateDialog props 类型一致

### 4. 测试覆盖
- ✅ 现有测试不受影响
- ✅ 新增功能可手动测试

---

## 执行选项

**计划完成并保存到 `docs/superpowers/plans/2026-05-29-update-optimization.md`**

两种执行方式：

**1. 子代理驱动（推荐）** - 每个任务派发一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中执行任务，批量执行并设置检查点

你倾向于哪种方式？
