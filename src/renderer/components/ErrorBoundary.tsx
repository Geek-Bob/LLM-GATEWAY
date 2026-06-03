/**
 * ErrorBoundary — React 错误边界
 *
 * 使用 class component 实现（React 错误边界只能由 class component 实现）
 * 捕获子组件渲染过程中的 JS 错误，显示 fallback UI 而非白屏
 * 主要用于包裹 Markdown 渲染等可能抛异常的组件
 *
 * props:
 * - children: 需要被保护的子组件
 * - fallback: 可选的自定义错误 UI，默认显示红色错误提示
 */

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
          <p className="text-sm text-destructive">渲染出错</p>
          <p className="text-xs text-muted-foreground mt-1">
            {this.state.error?.message || '未知错误'}
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
