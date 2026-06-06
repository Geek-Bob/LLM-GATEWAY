/**
 * Settings 页面 — 应用配置和版本管理
 *
 * 数据流:
 * 1. useUpdateConfig 通过 IPC 读取当前更新配置（autoCheck / allowPrerelease）
 * 2. useUpdateConfigMutation 修改配置并持久化到本地存储
 * 3. useCurrentVersion 获取当前应用版本号
 * 4. UpdateButton 组件调用主进程的更新检查逻辑
 *
 * 包含：自动更新开关、预发布版本开关、手动检查更新、应用信息
 */

import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateConfig, useUpdateConfigMutation, useCurrentVersion } from '@/lib/queries/update'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { UpdateButton } from '@/components/update/UpdateButton'

import { pageVariants, childVariants } from '@/lib/animations'

export function SettingsPage() {
  const { data: config, isLoading } = useUpdateConfig()
  const { data: currentVersion } = useCurrentVersion()
  const updateConfig = useUpdateConfigMutation({
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={childVariants} className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">设置</h1>
          <p className="text-sm text-muted-foreground">管理应用配置和偏好</p>
        </div>
      </motion.div>

      <motion.div variants={childVariants}>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>自动更新</CardTitle>
              <CardDescription>配置应用自动更新行为</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-check">自动检查更新</Label>
                  <p className="text-sm text-muted-foreground">
                    应用启动时自动检查新版本
                  </p>
                </div>
                <Switch
                  id="auto-check"
                  checked={config?.autoCheck ?? true}
                  onCheckedChange={(checked) =>
                    updateConfig.mutate({ autoCheck: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-prerelease">允许预发布版本</Label>
                  <p className="text-sm text-muted-foreground">
                    接收测试版和预发布版本更新
                  </p>
                </div>
                <Switch
                  id="allow-prerelease"
                  checked={config?.allowPrerelease ?? false}
                  onCheckedChange={(checked) =>
                    updateConfig.mutate({ allowPrerelease: checked })
                  }
                />
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between pt-4">
                  <div className="space-y-0.5">
                    <Label>手动检查更新</Label>
                    <p className="text-sm text-muted-foreground">
                      立即检查是否有可用更新
                    </p>
                  </div>
                  <UpdateButton />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>

      <motion.div variants={childVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              关于我们
            </CardTitle>
            <CardDescription>应用信息和版本详情</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>应用名称</Label>
                <p className="text-sm text-muted-foreground">LLM Gateway</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>当前版本</Label>
                <p className="text-sm text-muted-foreground">
                  v{currentVersion || '加载中...'}
                </p>
              </div>
            </div>

          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
