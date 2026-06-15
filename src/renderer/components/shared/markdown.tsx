/**
 * Markdown 渲染组件
 *
 * 职责：将 LLM 返回的 Markdown 文本渲染为带 UI 的富文本展示
 *
 * 渲染策略说明（streaming vs complete）：
 * - 流式（isStreaming=true）：仅渲染纯文本和内联代码，跳过 Mermaid 图表和 Shiki 语法高亮
 *   原因：流式过程中内容不完整，语法高亮和图表渲染会频繁触发，导致性能问题甚至崩溃
 * - 完整（isStreaming=false/false）：启用全部渲染能力，包括 Mermaid 图表和 Shiki 代码高亮
 * - code 组件的三级降级策略：
 *   1) mermaid 代码块且非流式 → MermaidBlock（图表/代码双视图）
 *   2) 流式中或无语言标注 → 纯文本 <code>
 *   3) 已完成 + 有语言标注 → CodeBlock（Shiki 异步高亮）
 */
import { memo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Root } from 'hast'
import { cn } from '@/lib/utils'
import { Mermaid } from './mermaid'
import { highlightCode } from '@/lib/shiki'

/**
 * rehype 插件：剥离 HTML 中 hardcoded 的 color/background 样式
 *
 * 某些 LLM 输出包含硬编码的浅色文字颜色，在深色主题下几乎不可见。
 * 此插件在 HAST 树层面移除 color/background/background-color 属性，
 * 让文字颜色交由 Tailwind prose-invert 类控制。
 */
function rehypeStripColorStyle() {
  return (tree: Root) => {
    walk(tree)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any) {
  if (node.type === 'element') {
    const properties = node.properties as Record<string, unknown> | undefined
    const style = properties?.style
    if (typeof style === 'string') {
      const cleaned = style
        .split(';')
        .filter((s) => {
          const prop = s.split(':')[0]?.trim().toLowerCase()
          return prop !== 'color' && prop !== 'background-color' && prop !== 'background'
        })
        .join(';')
      if (cleaned.trim()) {
        properties!.style = cleaned
      } else {
        delete properties!.style
      }
    }
  }
  const children = node.children as Record<string, unknown>[] | undefined
  if (children) {
    for (const child of children) {
      walk(child)
    }
  }
}

/**
 * sanitize schema：在 defaultSchema 基础上扩展，允许代码高亮所需 className
 *
 * 安全策略：
 * - 默认 schema 已过滤 script、iframe、onerror/onclick 等危险属性
 * - 默认会剥离 javascript: 协议的链接 href
 * - 此处显式允许 code/span/div 上的 className 属性，让 highlight.js 主题类生效
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...((defaultSchema.attributes?.code as unknown[]) || []),
      ['className', /^language-[a-z0-9-]+$/],
    ],
    span: [...((defaultSchema.attributes?.span as unknown[]) || []), ['className']],
    div: [...((defaultSchema.attributes?.div as unknown[]) || []), ['className']],
  },
}

/** Mermaid 代码块：支持图表/代码双视图切换 */
function MermaidBlock({ code }: { code: string }) {
  const [view, setView] = useState<'diagram' | 'code'>('diagram')

  return (
    <div className="my-3 rounded-lg border border-border/50 overflow-hidden not-prose">
      <div className="flex items-center gap-1 px-3 py-1.5 bg-muted/30 border-b border-border/30">
        <button
          className={cn(
            'text-xs px-2 py-0.5 rounded transition-colors',
            view === 'diagram' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setView('diagram')}
        >
          图表
        </button>
        <button
          className={cn(
            'text-xs px-2 py-0.5 rounded transition-colors',
            view === 'code' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setView('code')}
        >
          代码
        </button>
        <span className="text-[10px] text-muted-foreground/50 ml-auto">mermaid</span>
      </div>
      <div className="p-3">
        {view === 'diagram' ? (
          <Mermaid content={code} />
        ) : (
          <pre className="text-xs bg-muted/20 rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

/** 代码语法高亮块：使用 Shiki 渲染已完成（非流式）的代码片段 */
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    highlightCode(code, lang).then(setHtml)
  }, [code, lang])

  if (!html) {
    return (
      <pre className="text-xs bg-muted/20 rounded p-3 overflow-auto">
        <code>{code}</code>
      </pre>
    )
  }

  return (
    <div
      className="my-3 rounded-lg overflow-hidden border border-border/50"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

interface MarkdownProps {
  children: string
  className?: string
  enableMermaid?: boolean
  isStreaming?: boolean
}

export const Markdown = memo(function Markdown({
  children,
  className,
  enableMermaid = false,
  isStreaming = false,
}: MarkdownProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
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
        'text-foreground',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeStripColorStyle]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          code: ({ node: _node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')

            // Mermaid 图表渲染：流式时不渲染以避免频繁重绘导致崩溃
            if (match?.[1] === 'mermaid' && enableMermaid && !isStreaming) {
              return <MermaidBlock code={String(children).replace(/\n$/, '')} />
            }

            // 流式传输或无语言标注：纯文本渲染
            if (isStreaming || !match) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            }

            // 已完成且有语言标注：Shiki 语法高亮
            return <CodeBlock lang={match[1]} code={String(children).replace(/\n$/, '')} />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
