/**
 * StatusBar — 代理服务状态栏
 *
 * 展示 HTTP 代理是否运行、监听地址和端口
 * 提供"复制 URL"按钮方便用户复制到客户端配置
 * 使用 useProxyStatus 轮询代理状态
 */

import { useClipboard } from '@/hooks/useClipboard'
import { useProxyStatus } from '@/lib/queries/proxy'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Copy, Check, Wifi, WifiOff } from 'lucide-react'
import { motion } from 'framer-motion'

/** 代理服务状态栏，展示 HTTP 代理运行状态和监听地址。 @returns 状态栏 JSX。 */
export function StatusBar() {
  const { data: status, isLoading } = useProxyStatus()
  const { copied, copy } = useClipboard()

  const handleCopy = () => {
    if (status?.url) copy(status.url)
  }

  if (isLoading) {
    return (
      <Card className="border-border/50 mb-6">
        <CardContent className="p-5">
          <Skeleton className="h-5 w-44" />
        </CardContent>
      </Card>
    )
  }

  if (!status) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="border-border/50 mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {status.running ? (
                <Wifi className="w-4 h-4 text-green-500 animate-pulse-cyan" />
              ) : (
                <WifiOff className="w-4 h-4 text-destructive" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {status.running ? '代理服务运行中' : '代理服务未运行'}
                </p>
                <p className="text-xs font-mono mt-0.5 text-muted-foreground">{status.url || '-'}</p>
              </div>
            </div>
            {status.url && (
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '已复制' : '复制'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
