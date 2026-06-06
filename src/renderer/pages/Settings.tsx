/**
 * Settings 页面 — 应用配置和版本管理
 *
 * 数据流:
 * 1. useUpdateConfig 通过 IPC 读取当前更新配置（autoCheck / allowPrerelease）
 * 2. useUpdateConfigMutation 修改配置并持久化到本地存储
 * 3. useCurrentVersion 获取当前应用版本号
 * 4. UpdateButton 组件调用主进程的更新检查逻辑
 *
 * 目前包含：自动更新开关、预发布版本开关、手动检查更新、应用信息
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Info, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateConfig, useUpdateConfigMutation, useCurrentVersion } from '../lib/queries/update'
import { useAgents, useAgentConfigs, useSwitchAgentConfig, useDeleteAgentConfig } from '../lib/queries/agents'
import { Switch } from '../components/ui/switch'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { Button } from '../components/ui/button'
import { UpdateButton } from '../components/update/UpdateButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'

const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

export function SettingsPage() {
  const { data: config, isLoading } = useUpdateConfig()
  const { data: currentVersion } = useCurrentVersion()
  const updateConfig = useUpdateConfigMutation({
    onError: (error: Error) => {
      toast.error(`保存失败: ${error.message}`)
    },
  })

  // Agent 配置管理状态
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null)
  const [configToDelete, setConfigToDelete] = useState<number | null>(null)
  const { data: agents = [] } = useAgents()
  const { data: configs = [] } = useAgentConfigs(expandedAgent)
  const switchConfig = useSwitchAgentConfig()
  const deleteConfig = useDeleteAgentConfig()

  /** 切换指定 Agent 的当前激活配置 */
  const handleSwitchConfig = async (agentId: number, configId: number) => {
    try {
      await switchConfig.mutateAsync({ agentId, configId })
      toast.success('配置已切换')
    } catch (error) {
      toast.error('切换失败: ' + (error as Error).message)
    }
  }

  /** 展开/收起 Agent 配置面板 */
  const toggleAgent = (agentId: number) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId)
  }

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
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </div>
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

      {/* Agent 配置管理 */}
      <motion.div variants={childVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Agent 配置</CardTitle>
            <CardDescription>管理 AI 编程助手的配置文件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无已注册的 Agent</p>
            ) : (
              agents.map(agent => (
                <div key={agent.id} className="border rounded-lg p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleAgent(agent.id)}
                  >
                    <div>
                      <h4 className="font-medium">{agent.displayName}</h4>
                      <p className="text-sm text-muted-foreground">{agent.configPath}</p>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        expandedAgent === agent.id ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  {expandedAgent === agent.id && (
                    <div className="mt-4 space-y-2">
                      {configs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">暂无配置</p>
                      ) : (
                        configs.map(config => (
                          <div
                            key={config.id}
                            className={`flex items-center justify-between p-2 rounded ${
                              config.isCurrent === 1 ? 'bg-primary/10' : 'hover:bg-muted'
                            }`}
                          >
                            <div
                              className="flex items-center gap-2 cursor-pointer flex-1"
                              onClick={() => config.isCurrent !== 1 && handleSwitchConfig(agent.id, config.id)}
                            >
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  config.isCurrent === 1 ? 'bg-primary' : 'bg-muted-foreground'
                                }`}
                              />
                              <span className="text-sm">
                                {config.name}
                                {config.isCurrent === 1 ? ' (当前)' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {config.isCurrent !== 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setConfigToDelete(config.id)
                                  }}
                                >
                                  删除
                                </Button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      <Button variant="outline" size="sm" className="w-full" disabled>
                        添加配置
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 删除配置确认对话框 */}
      <AlertDialog open={configToDelete !== null} onOpenChange={() => setConfigToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个配置吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (configToDelete) {
                try {
                  await deleteConfig.mutateAsync(configToDelete)
                  toast.success('配置已删除')
                  setConfigToDelete(null)
                } catch (error) {
                  toast.error('删除失败: ' + (error as Error).message)
                }
              }
            }}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
