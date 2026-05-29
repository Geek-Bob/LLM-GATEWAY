import { useEffect, useRef, useState, memo } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

interface MermaidProps {
  content: string
  className?: string
}

export const Mermaid = memo(function Mermaid({ content, className }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderIdRef = useRef(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const renderChart = async () => {
      try {
        setIsLoading(true)
        setError(null)

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
        })

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg } = await mermaid.render(id, content)

        if (isMounted) {
          setIsLoading(false)
          // 在状态更新后设置 innerHTML，等待下一帧 DOM 更新
          const currentId = ++renderIdRef.current
          requestAnimationFrame(() => {
            if (isMounted && renderIdRef.current === currentId && containerRef.current) {
              containerRef.current.innerHTML = svg
            }
          })
        }
      } catch {
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
      <div className={cn('rounded-lg bg-destructive/10 border border-destructive/20 p-4', className)}>
        <p className="text-sm text-destructive">{error}</p>
        <pre className="mt-2 text-xs text-muted-foreground overflow-auto">
          {content}
        </pre>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-4', className)}>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex justify-center', className)}
      role="img"
      aria-label="Mermaid 图表"
    />
  )
})
