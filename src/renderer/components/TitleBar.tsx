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
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary">
          v1.0
        </span>
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
