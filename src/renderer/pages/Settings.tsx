import { motion } from 'framer-motion'
import { Settings as SettingsIcon } from 'lucide-react'
import { useUpdateConfig, useUpdateConfigMutation } from '../lib/queries/update'
import { Switch } from '../components/ui/switch'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { UpdateButton } from '../components/update/UpdateButton'

const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

export function SettingsPage() {
  const { data: config } = useUpdateConfig()
  const updateConfig = useUpdateConfigMutation()

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
      </motion.div>
    </motion.div>
  )
}
