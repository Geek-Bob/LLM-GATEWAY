import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { Root } from 'hast'
import { cn } from '@/lib/utils'
import { Mermaid } from './mermaid'

/** 剥离行内样式中 hardcoded color/background，防止深色文字在深色主题下不可见 */
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
        rehypePlugins={[rehypeRaw, rehypeStripColorStyle]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')

            // Mermaid 图表渲染：流式时不渲染以避免频繁重绘导致崩溃
            if (match?.[1] === 'mermaid' && enableMermaid && !isStreaming) {
              return <MermaidBlock code={String(children).replace(/\n$/, '')} />
            }

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
    </div>
  )
})
