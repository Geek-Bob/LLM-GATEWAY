/**
 * Mermaid 图表渲染组件
 *
 * 职责：将 Mermaid 图表定义文本渲染为 SVG 矢量图
 *
 * 串行化渲染机制：
 * mermaid.render() 内部操作全局 DOM（在 SVG 命名空间下创建/移除元素），多个并发调用会
 * 导致 "Failed to execute 'removeChild'" 错误。因此通过模块级 Promise 链 serializedRender()
 * 将所有渲染请求串行排队，确保同一时间只有一个 render 在执行。
 *
 * 渲染流程：
 * 1. content 变更时先调用 mermaid.parse() 做语法检查，提前过滤非法输入
 * 2. parse 通过后调用 serializedRender() 执行实际渲染
 * 3. SVG 结果存入 state，通过第二个 useEffect（在 React commit 阶段后）写入 DOM
 * 4. 写入策略：内联到独立的 div(ref) 中，避免 innerHTML 覆盖 React 管理的子节点
 *
 * 状态机：loading → ready / error，支持中途取消（cancelled flag）
 */
import { useEffect, useRef, useState, memo } from 'react'
import { cn } from '@/lib/utils'

/** 懒加载的 mermaid 模块引用，首次渲染图表时通过动态 import 初始化 */
let mermaidModule: typeof import('mermaid').default | null = null
let mermaidInitialized = false

/**
 * 确保 mermaid 模块已加载并初始化
 * 首次调用时动态 import mermaid，后续调用直接返回缓存的模块实例。
 * 初始化配置仅执行一次。
 */
async function ensureMermaid(): Promise<typeof import('mermaid').default> {
  if (mermaidModule && mermaidInitialized) return mermaidModule

  const mod = await import('mermaid')
  mermaidModule = mod.default

  if (!mermaidInitialized) {
    mermaidModule.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      suppressErrorRendering: true,
    })
    mermaidInitialized = true
  }

  return mermaidModule
}

/**
 * 模块级串行锁
 * mermaid.render() 内部依赖全局 DOM 状态（SVG 命名空间），并发调用会导致
 * "Failed to execute 'removeChild'" 错误。此锁将所有渲染请求串行排队。
 * 每调用一次 serializedRender，就将 mermaidLock 替换为一个新的 Promise，
 * 后续调用必须等待前一个完成。
 */
let mermaidLock: Promise<void> = Promise.resolve()

/**
 * 串行化 mermaid.render 包装
 * 通过 Promise 链确保同一时间只有一个 render 在运行。
 */
async function serializedRender(
  mermaid: typeof import('mermaid').default,
  id: string,
  content: string,
) {
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
  /**
   * svgRef 指向待写入 SVG 的独立容器 div
   * 使用两个分离的 useEffect：
   * 1. 第一个负责异步渲染，产出 SVG 字符串，写入 state
   * 2. 第二个在 state 更新 + DOM commit 后，将 SVG 写入 div
   * 这种分离避免在渲染过程中替换 React 已管理的子节点（如加载文字），防止协调冲突
   */
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

        // 动态加载 mermaid（首次渲染时初始化）
        await ensureMermaid()
        if (cancelled) return

        // 先做语法检查，过滤非法输入
        await mermaidModule!.parse(content)
        if (cancelled) return

        // 生成唯一 ID 后串行渲染
        const id = `m-${Math.random().toString(36).substring(2, 11)}`
        const { svg } = await serializedRender(mermaidModule!, id, content)
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

  /**
   * 在 React commit 阶段后将 SVG 内容写入实际 DOM
   * 不直接使用 dangerouslySetInnerHTML 是为了避免在 loading 阶段替换掉 React 的文本节点
   */
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
