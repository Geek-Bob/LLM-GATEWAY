/**
 * TitleBar — Electron 无边框窗口的标题栏
 *
 * 提供三个窗口控制按钮：最小化、最大化、关闭
 * 通过 api.window.* IPC 调用主进程对应方法
 * div.drag 和 div.no-drag 区分拖拽区域和按钮区域（由 preload 中的 CSS 类控制）
 */

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
