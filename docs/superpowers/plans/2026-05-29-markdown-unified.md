# Markdown 统一渲染系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建统一的 Markdown 渲染组件，支持 Chat 消息和更新内容的完整 Markdown 渲染，包括代码高亮和 Mermaid 图表。

**Architecture:** 基于 react-markdown + remark-gfm + rehype-raw 构建统一组件，使用动态加载策略集成 rehype-highlight 和 mermaid，通过 Tailwind Typography 提供样式支持。

**Tech Stack:** react-markdown, remark-gfm, rehype-raw, rehype-highlight, mermaid, tailwindcss, react

---

## 文件结构

```
src/renderer/components/ui/
├── markdown.tsx              # 核心 Markdown 渲染组件
└── mermaid.tsx               # Mermaid 图表渲染组件

src/renderer/components/ui/__tests__/
├── markdown.test.tsx         # Markdown 组件测试
└── mermaid.test.tsx          # Mermaid 组件测试

src/renderer/components/update/
└── UpdateDialog.tsx          # 修改：使用统一 Markdown 组件

src/renderer/components/
└── ChatMessage.tsx           # 修改：添加 Markdown 渲染支持
```

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 安装核心依赖**

```bash
npm install rehype-raw remark-gfm
```

- [ ] **Step 2: 安装代码高亮依赖**

```bash
npm install rehype-highlight highlight.js
```

- [ ] **Step 3: 安装 Mermaid 依赖**

```bash
npm install mermaid
```

- [ ] **Step 4: 验证依赖安装**

```bash
npm list rehype-raw remark-gfm rehype-highlight highlight.js mermaid
```

Expected output:
```
llm-gateway@1.0.0
├── highlight.js@11.x.x
├── mermaid@11.x.x
├── rehype-highlight@7.x.x
├── rehype-raw@7.x.x
└── remark-gfm@4.x.x
```

- [ ] **Step 5: 提交依赖变更**

```bash
git add package.json package-lock.json
git commit -m "build: 添加 Markdown 渲染相关依赖"
```

---

## Task 2: 创建 Mermaid 组件

**Files:**
- Create: `src/renderer/components/ui/mermaid.tsx`
- Create: `src/renderer/components/ui/__tests__/mermaid.test.tsx`

- [ ] **Step 1: 编写 Mermaid 组件测试**

```tsx
// src/renderer/components/ui/__tests__/mermaid.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { Mermaid } from '../mermaid'

// Mock mermaid 库
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>test</svg>' }),
  },
}))

describe('Mermaid', () => {
  it('应该渲染 Mermaid 图表', async () => {
    const content = `graph TD
    A[开始] --> B[结束]`

    render(<Mermaid content={content} />)

    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument()
    })
  })

  it('应该显示加载状态', () => {
    const content = `graph TD
    A[开始] --> B[结束]`

    render(<Mermaid content={content} />)

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('应该处理渲染错误', async () => {
    const mermaid = await import('mermaid')
    mermaid.default.render.mockRejectedValueOnce(new Error('渲染失败'))

    const content = 'invalid mermaid content'

    render(<Mermaid content={content} />)

    await waitFor(() => {
      expect(screen.getByText('图表渲染失败')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- --run src/renderer/components/ui/__tests__/mermaid.test.tsx
```

Expected: FAIL with "Cannot find module '../mermaid'"

- [ ] **Step 3: 实现 Mermaid 组件**

```tsx
// src/renderer/components/ui/mermaid.tsx
import { useEffect, useRef, useState, memo } from 'react'
import { Skeleton } from './skeleton'

interface MermaidProps {
  content: string
  className?: string
}

export const Mermaid = memo(function Mermaid({ content, className }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const renderChart = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const mermaid = (await import('mermaid')).default

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
        })

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg } = await mermaid.render(id, content)

        if (isMounted && containerRef.current) {
          containerRef.current.innerHTML = svg
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError('图表渲染失败')
          setIsLoading(false)
        }
      }
    }

    renderChart()

    return () => {
      isMounted = false
    }
  }, [content])

  if (error) {
    return (
      <div className={`rounded-lg bg-destructive/10 border border-destructive/20 p-4 ${className}`}>
        <p className="text-sm text-destructive">{error}</p>
        <pre className="mt-2 text-xs text-muted-foreground overflow-auto">
          {content}
        </pre>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`flex justify-center ${className}`}
      role="img"
      aria-label="Mermaid 图表"
    />
  )
})
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- --run src/renderer/components/ui/__tests__/mermaid.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: 提交 Mermaid 组件**

```bash
git add src/renderer/components/ui/mermaid.tsx src/renderer/components/ui/__tests__/mermaid.test.tsx
git commit -m "feat: 添加 Mermaid 图表渲染组件"
```

---

## Task 3: 创建核心 Markdown 组件

**Files:**
- Create: `src/renderer/components/ui/markdown.tsx`
- Create: `src/renderer/components/ui/__tests__/markdown.test.tsx`

- [ ] **Step 1: 编写 Markdown 组件测试**

```tsx
// src/renderer/components/ui/__tests__/markdown.test.tsx
import { render, screen } from '@testing-library/react'
import { Markdown } from '../markdown'

describe('Markdown', () => {
  it('应该渲染基础 Markdown 语法', () => {
    const content = '# 标题\n\n这是一段**加粗**文本'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('标题')
    expect(screen.getByText('加粗')).toBeInTheDocument()
  })

  it('应该渲染列表', () => {
    const content = '- 项目 1\n- 项目 2\n- 项目 3'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('应该渲染代码块', () => {
    const content = '```javascript\nconsole.log("hello")\n```'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByText('console.log("hello")')).toBeInTheDocument()
  })

  it('应该渲染表格', () => {
    const content = `| 列 1 | 列 2 |
|------|------|
| A    | B    |`

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('列 1')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('应该渲染 HTML 内容', () => {
    const content = '<ul><li>项目 1</li><li>项目 2</li></ul>'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('应该支持自定义 className', () => {
    const content = '测试内容'

    render(<Markdown className="custom-class">{content}</Markdown>)

    expect(screen.getByText('测试内容').closest('.custom-class')).toBeInTheDocument()
  })

  it('应该支持 Mermaid 图表（启用时）', () => {
    const content = '```mermaid\ngraph TD\n    A[开始] --> B[结束]\n```'

    render(<Markdown enableMermaid>{content}</Markdown>)

    // Mermaid 组件会被渲染（通过 lazy 加载）
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('应该在禁用 Mermaid 时渲染为代码块', () => {
    const content = '```mermaid\ngraph TD\n    A[开始] --> B[结束]\n```'

    render(<Markdown enableMermaid={false}>{content}</Markdown>)

    expect(screen.getByText(/graph TD/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm test -- --run src/renderer/components/ui/__tests__/markdown.test.tsx
```

Expected: FAIL with "Cannot find module '../markdown'"

- [ ] **Step 3: 实现 Markdown 组件**

```tsx
// src/renderer/components/ui/markdown.tsx
import { lazy, Suspense, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

// 动态加载代码高亮插件
const rehypeHighlight = lazy(() => import('rehype-highlight'))

// 动态加载 Mermaid 组件
const Mermaid = lazy(() => import('./mermaid').then(module => ({ default: module.Mermaid })))

interface MarkdownProps {
  children: string
  className?: string
  enableMermaid?: boolean
}

export const Markdown = memo(function Markdown({
  children,
  className,
  enableMermaid = false,
}: MarkdownProps) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg',
        'prose-p:leading-relaxed prose-p:my-2',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted prose-pre:border',
        'prose-blockquote:border-l-primary prose-blockquote:bg-muted/50 prose-blockquote:py-1',
        'prose-ul:my-2 prose-ol:my-2 prose-li:my-1',
        'prose-table:border prose-thead:bg-muted',
        'prose-td:border prose-th:border prose-td:px-3 prose-th:px-3',
        'prose-img:rounded-lg prose-img:shadow-sm',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        '[overflow-wrap:anywhere] break-words',
        className
      )}
    >
      <Suspense
        fallback={
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        }
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            a: ({ node, ...props }) => (
              <a {...props} target="_blank" rel="noopener noreferrer" />
            ),
            code: ({ node, inline, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '')

              // Mermaid 图表渲染
              if (!inline && match?.[1] === 'mermaid' && enableMermaid) {
                return (
                  <Suspense
                    fallback={
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    }
                  >
                    <Mermaid content={String(children).replace(/\n$/, '')} />
                  </Suspense>
                )
              }

              // 普通代码块
              if (!inline) {
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              }

              // 内联代码
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            },
          }}
        >
          {children}
        </ReactMarkdown>
      </Suspense>
    </div>
  )
})
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- --run src/renderer/components/ui/__tests__/markdown.test.tsx
```

Expected: PASS (8 tests)

- [ ] **Step 5: 提交 Markdown 组件**

```bash
git add src/renderer/components/ui/markdown.tsx src/renderer/components/ui/__tests__/markdown.test.tsx
git commit -m "feat: 添加统一 Markdown 渲染组件"
```

---

## Task 4: 集成到 UpdateDialog

**Files:**
- Modify: `src/renderer/components/update/UpdateDialog.tsx`
- Modify: `src/renderer/components/update/__tests__/UpdateDialog.test.tsx`

- [ ] **Step 1: 更新 UpdateDialog 测试**

```tsx
// src/renderer/components/update/__tests__/UpdateDialog.test.tsx
import { render, screen } from '@testing-library/react'
import { UpdateDialog } from '../UpdateDialog'

describe('UpdateDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    currentVersion: '1.0.0',
    newVersion: '1.1.0',
    onUpdate: vi.fn(),
    onSkip: vi.fn(),
  }

  it('应该渲染更新内容（Markdown 格式）', () => {
    const releaseNotes = `## 更新内容

- 支持自动检查更新
- 支持下载和安装更新
- 支持跳过版本
- 设置页面配置`

    render(<UpdateDialog {...defaultProps} releaseNotes={releaseNotes} />)

    expect(screen.getByText('更新内容')).toBeInTheDocument()
    expect(screen.getByText('支持自动检查更新')).toBeInTheDocument()
  })

  it('应该渲染更新内容（HTML 格式）', () => {
    const releaseNotes = `<ul>
<li>支持自动检查更新</li>
<li>支持下载和安装更新</li>
<li>支持跳过版本</li>
<li>设置页面配置</li>
</ul>`

    render(<UpdateDialog {...defaultProps} releaseNotes={releaseNotes} />)

    expect(screen.getByText('更新内容')).toBeInTheDocument()
    expect(screen.getByText('支持自动检查更新')).toBeInTheDocument()
  })

  it('应该在没有更新内容时隐藏内容区域', () => {
    render(<UpdateDialog {...defaultProps} releaseNotes={null} />)

    expect(screen.queryByText('更新内容')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试验证当前状态**

```bash
npm test -- --run src/renderer/components/update/__tests__/UpdateDialog.test.tsx
```

Expected: 有些测试可能失败（HTML 格式渲染问题）

- [ ] **Step 3: 修改 UpdateDialog 使用统一 Markdown 组件**

```tsx
// src/renderer/components/update/UpdateDialog.tsx
import { useState } from 'react'
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
import { Markdown } from '@/components/ui/markdown'

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
              <Markdown>{releaseNotes}</Markdown>
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

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- --run src/renderer/components/update/__tests__/UpdateDialog.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 5: 提交 UpdateDialog 集成**

```bash
git add src/renderer/components/update/UpdateDialog.tsx src/renderer/components/update/__tests__/UpdateDialog.test.tsx
git commit -m "feat: UpdateDialog 使用统一 Markdown 渲染组件"
```

---

## Task 5: 集成到 ChatMessage

**Files:**
- Modify: `src/renderer/components/ChatMessage.tsx`
- Modify: `src/renderer/pages/__tests__/Chat.test.tsx`

- [ ] **Step 1: 更新 ChatMessage 测试**

```tsx
// src/renderer/pages/__tests__/Chat.test.tsx
import { render, screen } from '@testing-library/react'
import { ChatMessage } from '../components/ChatMessage'

describe('ChatMessage', () => {
  it('应该渲染用户消息（纯文本）', () => {
    render(
      <ChatMessage
        role="user"
        content="这是一条用户消息"
      />
    )

    expect(screen.getByText('这是一条用户消息')).toBeInTheDocument()
  })

  it('应该渲染助手消息（Markdown 格式）', () => {
    const content = `## 代码示例

\`\`\`javascript
console.log("hello")
\`\`\`

**加粗文本**`

    render(
      <ChatMessage
        role="assistant"
        content={content}
      />
    )

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('代码示例')
    expect(screen.getByText('console.log("hello")')).toBeInTheDocument()
    expect(screen.getByText('加粗文本')).toBeInTheDocument()
  })

  it('应该渲染列表', () => {
    const content = `- 项目 1
- 项目 2
- 项目 3`

    render(
      <ChatMessage
        role="assistant"
        content={content}
      />
    )

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('应该渲染表格', () => {
    const content = `| 列 1 | 列 2 |
|------|------|
| A    | B    |`

    render(
      <ChatMessage
        role="assistant"
        content={content}
      />
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('应该显示错误状态', () => {
    render(
      <ChatMessage
        role="assistant"
        content="发生错误"
        error={true}
      />
    )

    expect(screen.getByText('发生错误')).toHaveClass('text-destructive')
  })

  it('应该显示流式输入光标', () => {
    render(
      <ChatMessage
        role="assistant"
        content="正在输入"
        isStreaming={true}
      />
    )

    expect(screen.getByText('正在输入')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试验证当前状态**

```bash
npm test -- --run src/renderer/pages/__tests__/Chat.test.tsx
```

Expected: 有些测试可能失败（Markdown 渲染未实现）

- [ ] **Step 3: 修改 ChatMessage 支持 Markdown 渲染**

```tsx
// src/renderer/components/ChatMessage.tsx
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Markdown } from './ui/markdown'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  isThinking?: boolean
  model?: string
  isStreaming?: boolean
  error?: boolean
}

export function ChatMessage({
  role,
  content,
  thinking,
  isThinking,
  model,
  isStreaming,
  error,
}: ChatMessageProps) {
  const isUser = role === 'user'
  const [thinkingExpanded, setThinkingExpanded] = useState(true)

  useEffect(() => {
    if (!isThinking && thinking) {
      setThinkingExpanded(false)
    }
  }, [isThinking, thinking])

  const bubbleClass = isUser
    ? 'bg-primary/10 border-primary/20'
    : error
      ? 'bg-destructive/10 border-destructive/20 text-destructive'
      : 'bg-muted/30 border-border/50'

  return (
    <motion.div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 px-1`}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className={`max-w-[75%] rounded-2xl px-5 py-3.5 border ${bubbleClass}`}>
        {model && !isUser && (
          <p className="text-[11px] font-mono mb-1.5 text-muted-foreground">{model}</p>
        )}

        {/* Thinking section (collapsible) */}
        {thinking && (
          <div
            className="mb-2 rounded-lg px-3 py-2 cursor-pointer transition-colors duration-150 bg-muted/50 border border-border/50"
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
          >
            <p className="text-[11px] font-medium flex items-center gap-1.5 text-muted-foreground">
              <ChevronDown
                className="w-3 h-3 transition-transform duration-200"
                style={{ transform: thinkingExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              />
              思考过程
              {(isThinking || isStreaming) && (
                <span className="inline-block w-1.5 h-1.5 rounded-full ml-1 bg-primary" />
              )}
            </p>
            {thinkingExpanded && (
              <motion.p
                className="text-xs leading-relaxed mt-1.5 whitespace-pre-wrap break-words text-muted-foreground"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {thinking}
              </motion.p>
            )}
          </div>
        )}

        {/* Main content */}
        {isUser ? (
          <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words select-text ${error ? 'text-destructive' : 'text-foreground'}`}>
            {content}
            {isStreaming && !thinking && (
              <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-primary" />
            )}
          </p>
        ) : (
          <Markdown
            className={`text-sm ${error ? 'text-destructive' : 'text-foreground'}`}
          >
            {content}
          </Markdown>
        )}

        {isStreaming && !isUser && (
          <span className="inline-block w-1.5 h-4 ml-0.5 align-text-bottom bg-primary" />
        )}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm test -- --run src/renderer/pages/__tests__/Chat.test.tsx
```

Expected: PASS (6 tests)

- [ ] **Step 5: 提交 ChatMessage 集成**

```bash
git add src/renderer/components/ChatMessage.tsx src/renderer/pages/__tests__/Chat.test.tsx
git commit -m "feat: ChatMessage 支持 Markdown 渲染"
```

---

## Task 6: 验证和优化

**Files:**
- Modify: `src/renderer/index.css` (如果需要添加样式)

- [ ] **Step 1: 运行全量测试**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 2: 运行 ESLint 检查**

```bash
npm run lint
```

Expected: 没有错误

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

Expected: 没有类型错误

- [ ] **Step 4: 启动开发服务器验证**

```bash
npm run dev
```

验证：
1. 更新对话框能正确渲染 Markdown 和 HTML 内容
2. Chat 消息能正确渲染 Markdown（包括代码块、表格、列表）
3. 代码高亮正常工作
4. Mermaid 图表正常渲染（如果启用）

- [ ] **Step 5: 提交最终优化**

```bash
git add -A
git commit -m "feat: 完成 Markdown 统一渲染系统集成"
```

---

## 验收检查清单

- [ ] UpdateDialog 能正确渲染 Markdown 格式的更新内容
- [ ] UpdateDialog 能正确渲染 HTML 格式的更新内容
- [ ] ChatMessage 能正确渲染 Markdown 格式的消息
- [ ] 代码块语法高亮正常工作
- [ ] Mermaid 图表正常渲染（可选）
- [ ] 所有测试通过
- [ ] ESLint 检查通过
- [ ] TypeScript 检查通过
- [ ] 性能无显著下降

---

## 技术债务和后续优化

### 已知限制
1. Mermaid 图表动态加载可能较慢
2. 代码高亮主题固定为深色
3. 不支持 LaTeX 数学公式

### 后续优化方向
1. 添加代码高亮主题切换
2. 支持 LaTeX 数学公式（KaTeX）
3. 优化 Mermaid 渲染性能
4. 添加更多 Markdown 扩展语法

---

**计划版本**：v1.0
**最后更新**：2026-05-29
**批准人**：用户
