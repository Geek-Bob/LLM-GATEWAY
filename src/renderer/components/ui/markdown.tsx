import { lazy, Suspense, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

// 动态加载 Mermaid 组件
const Mermaid = lazy(() =>
  import('./mermaid').then((module) => ({ default: module.Mermaid }))
)

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
            code: ({ node, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '')

              // Mermaid 图表渲染（仅代码块有 language class，内联代码不会有）
              if (match?.[1] === 'mermaid' && enableMermaid) {
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
