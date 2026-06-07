/**
 * ProxyControlCard — 代理服务控制卡片
 *
 * 展示代理服务运行状态（绿色脉冲/红色指示灯）、监听地址
 * 提供端口输入、复制 URL、启停开关等交互
 * 状态和操作通过 useProxyStatus / useToggleProxy hooks 自管理
 */

import { useState } from 'react'
import { useClipboard } from '@/hooks/useClipboard'
import { useProxyStatus, useToggleProxy } from '@/lib/queries/proxy'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { motion } from 'framer-motion'

/** 代理服务控制卡片，展示运行状态、端口输入、启停开关。 @returns 代理控制卡片 JSX。 */
export function ProxyControlCard() {
  const { data: proxyStatus } = useProxyStatus()
  const toggleProxy = useToggleProxy()
  const [proxyPort, setProxyPort] = useState(8080)
  const { copied, copy } = useClipboard()

  const proxyRunning = proxyStatus?.running ?? false
  const port = proxyStatus?.port ?? proxyPort

  const handleCopyUrl = () => copy(`http://localhost:${port}`)
  const handleToggleProxy = () => {
    toggleProxy.mutate({ running: proxyRunning, port: proxyRunning ? port : proxyPort })
  }

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {proxyRunning ? (
            <motion.span
              className="w-2.5 h-2.5 rounded-full shrink-0 bg-green-500"
              animate={{
                opacity: [0.6, 1, 0.6],
                boxShadow: [
                  '0 0 4px currentColor',
                  '0 0 14px currentColor',
                  '0 0 4px currentColor',
                ],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-500" />
          )}
          <span className="text-sm font-medium text-foreground">代理服务</span>
          {proxyRunning ? (
            <span className="font-mono text-sm text-muted-foreground">
              localhost:<span className="text-primary">{port}</span>
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono text-muted-foreground">localhost:</span>
              <Input
                type="number"
                value={proxyPort}
                onChange={(e) => setProxyPort(Math.max(1024, Math.min(65535, Number(e.target.value) || 8080)))}
                min={1024}
                max={65535}
                className="w-20 text-xs h-7"
              />
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopyUrl}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs h-7"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        <Switch checked={proxyRunning} onCheckedChange={handleToggleProxy} />
      </CardContent>
    </Card>
  )
}
