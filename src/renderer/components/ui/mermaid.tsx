import { useEffect, useRef, useState, memo } from 'react'
import mermaid from 'mermaid'
import { cn } from '@/lib/utils'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  suppressErrorRendering: true,
})

// 模块级串行化：mermaid.render() 内部维护全局 DOM 状态，并发调用会触发
// "Failed to execute 'removeChild'" 错误。此处将所有 render 调用串行排队。
let mermaidLock: Promise<void> = Promise.resolve()

async function serializedRender(id: string, content: string) {
  const prev = mermaidLock
  let release!: () => void
  mermaidLock = new Promise<void>((r) => { release = r })
  try {
    await prev
    return await mermaid.render(id, content)
  } finally {
    release()
  }
}

interface MermaidProps {
  content: string
  className?: string
}

export const Mermaid = memo(function Mermaid({ content, className }: MermaidProps) {
  // svgRef 指向 React 在 ready 状态时创建的独立 div，避免 innerHTML
  // 替换掉 React 已管理的子节点（如加载文字），导致协调冲突
  const svgRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [svgContent, setSvgContent] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const renderChart = async () => {
      try {
        setState('loading')
        setErrorMsg(null)
        setSvgContent(null)

        await mermaid.parse(content)
        if (cancelled) return

        const id = `m-${Math.random().toString(36).substring(2, 11)}`
        const { svg } = await serializedRender(id, content)
        if (cancelled) return

        setSvgContent(svg)
        setState('ready')
      } catch (err) {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : '图表渲染失败')
        setState('error')
      }
    }

    renderChart()

    return () => { cancelled = true }
  }, [content])

  // React 提交 ready 状态（svgRef div 已挂载）后写入 SVG 内容
  useEffect(() => {
    if (svgContent && svgRef.current) {
      svgRef.current.innerHTML = svgContent
    }
  }, [svgContent])

  return (
    <div
      className={cn('flex justify-center [&_svg]:max-w-full [&_svg]:h-auto', className)}
      role="img"
      aria-label="Mermaid 图表"
    >
      {state === 'loading' && (
        <p className="text-sm text-muted-foreground py-4">加载中...</p>
      )}
      {state === 'error' && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 w-full">
          <p className="text-sm text-destructive">图表渲染失败</p>
          {errorMsg && <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>}
          <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-32">{content}</pre>
        </div>
      )}
      {state === 'ready' && <div ref={svgRef} />}
    </div>
  )
})
