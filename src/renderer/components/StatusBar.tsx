import { useState } from 'react'
import { useProxyStatus } from '../lib/queries/proxy'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Skeleton } from './ui/skeleton'
import { Copy, Check, Wifi, WifiOff } from 'lucide-react'
import { motion } from 'framer-motion'

export function StatusBar() {
  const { data: status, isLoading } = useProxyStatus()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!status?.url) return
    try {
      await navigator.clipboard.writeText(status.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
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
