/**
 * Agents 页面 — Agent 配置管理
 *
 * 管理多个 AI 编程助手（Claude Code、Codex、Gemini CLI 等）的配置文件。
 * 支持为每个 Agent 创建多个配置，一键切换。
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, ChevronDown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAgents, useAgentConfigs, useSwitchAgentConfig, useDeleteAgentConfig, useCreateAgentConfig } from '../lib/queries/agents'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'

const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const

const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

export function AgentsPage() {
  // Agent 配置管理状态
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null)
  const [configToDelete, setConfigToDelete] = useState<number | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigContent, setNewConfigContent] = useState('{\n  \n}')
  const { data: agents = [] } = useAgents()
  const { data: configs = [] } = useAgentConfigs(expandedAgent)
  const switchConfig = useSwitchAgentConfig()
  const deleteConfig = useDeleteAgentConfig()
  const createConfig = useCreateAgentConfig()

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

  /** 打开添加配置对话框 */
  const handleOpenAddDialog = () => {
    setNewConfigName('')
    setNewConfigContent('{\n  \n}')
    setShowAddDialog(true)
  }

  /** 创建新配置 */
  const handleCreateConfig = async () => {
    if (!expandedAgent) return
    if (!newConfigName.trim()) {
      toast.error('请输入配置名称')
      return
    }

    try {
      await createConfig.mutateAsync({
        agentId: expandedAgent,
        name: newConfigName.trim(),
        content: newConfigContent,
      })
      toast.success('配置已创建')
      setShowAddDialog(false)
    } catch (error) {
      toast.error('创建失败: ' + (error as Error).message)
    }
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={childVariants} className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">管理 AI 编程助手的配置文件</p>
        </div>
      </motion.div>

      <motion.div variants={childVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Agent 配置</CardTitle>
            <CardDescription>为每个 Agent 创建和管理多个配置文件，一键切换</CardDescription>
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleOpenAddDialog}
                      >
                        <Plus className="w-4 h-4 mr-2" />
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

      {/* 添加配置对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加配置</DialogTitle>
            <DialogDescription>
              为 {agents.find(a => a.id === expandedAgent)?.displayName} 创建新的配置文件
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="config-name">配置名称</Label>
              <Input
                id="config-name"
                placeholder="例如: work, personal, default"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-content">配置内容</Label>
              <Textarea
                id="config-content"
                placeholder='{"env": {"ANTHROPIC_API_KEY": "sk-xxx"}}'
                value={newConfigContent}
                onChange={(e) => setNewConfigContent(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateConfig}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
