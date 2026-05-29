import { useEffect, useRef, useState, memo } from 'react'
import mermaid from 'mermaid'

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

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
        })

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
        const { svg } = await mermaid.render(id, content)

        if (isMounted) {
          setIsLoading(false)
          // 在状态更新后设置 innerHTML，等待下一帧 DOM 更新
          requestAnimationFrame(() => {
            if (isMounted && containerRef.current) {
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
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <p className="text-sm text-muted-foreground">加载中...</p>
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
