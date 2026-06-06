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
import {
  useAgents,
  useAgentConfigs,
  useSwitchAgentConfig,
  useDeleteAgentConfig,
  useCreateAgentConfig,
  useUpdateAgentConfig,
  useCreateAgent,
} from '@/lib/queries/agents'
import type { AgentConfigResponse } from '@/lib/types'
import { getErrorMessage } from '@/lib/utils'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodeEditor } from '@/components/ui/code-editor'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { pageVariants, childVariants } from '@/lib/animations'

export function AgentsPage() {
  // Agent 配置管理状态
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null)
  const [configToDelete, setConfigToDelete] = useState<number | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigContent, setNewConfigContent] = useState('{\n  \n}')
  const [editingConfig, setEditingConfig] = useState<AgentConfigResponse | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [newAgent, setNewAgent] = useState({
    name: '',
    displayName: '',
    configPath: '',
    configFormat: 'json' as 'json' | 'toml' | 'env',
  })
  const { data: agents = [] } = useAgents()
  const { data: configs = [] } = useAgentConfigs(expandedAgent)
  const switchConfig = useSwitchAgentConfig()
  const deleteConfig = useDeleteAgentConfig()
  const createConfig = useCreateAgentConfig()
  const updateConfig = useUpdateAgentConfig()
  const createAgent = useCreateAgent()

  const { execute: deleteConfigAction } = useDeleteWithToast(deleteConfig, '配置')

  /** 删除配置（关闭对话框 + 删除 + toast） */
  const handleDeleteConfig = async (configId: number, configName: string) => {
    setConfigToDelete(null)
    await deleteConfigAction(configId, configName)
  }

  /** 切换指定 Agent 的当前激活配置 */
  const handleSwitchConfig = async (agentId: number, configId: number) => {
    try {
      await switchConfig.mutateAsync({ agentId, configId })
      toast.success('配置已切换')
    } catch (error) {
      toast.error('切换失败: ' + getErrorMessage(error))
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
      toast.error('创建失败: ' + getErrorMessage(error))
    }
  }

  /** 更新配置内容 */
  const handleUpdateConfig = async () => {
    if (!editingConfig) return
    try {
      await updateConfig.mutateAsync({
        id: editingConfig.id,
        data: { content: editContent },
      })
      toast.success('配置已更新')
      setEditingConfig(null)
    } catch (error) {
      toast.error('更新失败: ' + getErrorMessage(error))
    }
  }

  /** 创建自定义 Agent */
  const handleCreateAgent = async () => {
    if (!newAgent.name || !newAgent.displayName || !newAgent.configPath) {
      toast.error('请填写所有必填字段')
      return
    }
    try {
      await createAgent.mutateAsync(newAgent)
      toast.success('Agent 已创建')
      setShowAddAgent(false)
      setNewAgent({ name: '', displayName: '', configPath: '', configFormat: 'json' })
    } catch (error) {
      toast.error('创建失败: ' + getErrorMessage(error))
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
              <EmptyState title="暂无已注册的 Agent" />
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
                        <EmptyState title="暂无配置" />
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
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingConfig(config)
                                  setEditContent(config.content)
                                }}
                              >
                                编辑
                              </Button>
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

      {/* 添加自定义 Agent 按钮 */}
      <motion.div variants={childVariants}>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowAddAgent(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          添加自定义 Agent
        </Button>
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
            <AlertDialogAction onClick={() => {
              if (configToDelete) {
                const config = configs.find(c => c.id === configToDelete)
                handleDeleteConfig(configToDelete, config?.name ?? String(configToDelete))
              }
            }}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 添加配置对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-4xl">
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
              <Label>配置内容</Label>
              <CodeEditor
                value={newConfigContent}
                onChange={setNewConfigContent}
                language="json"
                height="400px"
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

      {/* 编辑配置对话框 */}
      <Dialog open={editingConfig !== null} onOpenChange={() => setEditingConfig(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑配置: {editingConfig?.name}</DialogTitle>
            <DialogDescription>
              修改配置文件内容（支持语法高亮、代码折叠、格式化）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <CodeEditor
              value={editContent}
              onChange={setEditContent}
              language="json"
              height="500px"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)}>
              取消
            </Button>
            <Button onClick={handleUpdateConfig}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加自定义 Agent 对话框 */}
      <Dialog open={showAddAgent} onOpenChange={setShowAddAgent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加自定义 Agent</DialogTitle>
            <DialogDescription>
              添加一个新的 AI 编程助手配置管理
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-name">名称</Label>
              <Input
                id="agent-name"
                placeholder="my-agent"
                value={newAgent.name}
                onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-display-name">显示名称</Label>
              <Input
                id="agent-display-name"
                placeholder="My Agent"
                value={newAgent.displayName}
                onChange={(e) => setNewAgent({ ...newAgent, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-config-path">配置路径</Label>
              <Input
                id="agent-config-path"
                placeholder="~/.my-agent/config.json"
                value={newAgent.configPath}
                onChange={(e) => setNewAgent({ ...newAgent, configPath: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>配置格式</Label>
              <Select
                value={newAgent.configFormat}
                onValueChange={(value) => setNewAgent({ ...newAgent, configFormat: value as 'json' | 'toml' | 'env' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择格式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="toml">TOML</SelectItem>
                  <SelectItem value="env">ENV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAgent(false)}>
              取消
            </Button>
            <Button onClick={handleCreateAgent}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
