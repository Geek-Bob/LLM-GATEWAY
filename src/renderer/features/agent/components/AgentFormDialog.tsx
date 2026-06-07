/**
 * Agent 表单对话框组件
 *
 * 包含三个对话框：
 * - 添加配置对话框：为指定 Agent 创建新配置文件
 * - 编辑配置对话框：修改已有配置文件内容
 * - 添加自定义 Agent 对话框：注册新的 AI 编程助手
 */

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAgents,
  useCreateAgentConfig,
  useUpdateAgentConfig,
  useCreateAgent,
} from '@/lib/queries/agents'
import type { AgentConfigEntity } from '@/lib/types'
import { getErrorMessage } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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

/** AgentFormDialog 组件属性 */
interface AgentFormDialogProps {
  /** 添加配置对话框是否打开 */
  isAddDialogVisible: boolean
  /** 设置添加配置对话框打开状态 */
  onShowAddDialogChange: (open: boolean) => void
  /** 当前展开的 Agent ID */
  expandedAgent: number | null
  /** 编辑中的配置（null 表示未编辑） */
  editingConfig: AgentConfigEntity | null
  /** 设置编辑中的配置 */
  onEditingConfigChange: (config: AgentConfigEntity | null) => void
}

/**
 * Agent 表单对话框集合
 *
 * 管理所有 Agent 相关的表单对话框状态和逻辑，
 * 包括配置的创建、编辑，以及自定义 Agent 的创建。
 */
export function AgentFormDialog({
  isAddDialogVisible,
  onShowAddDialogChange,
  expandedAgent,
  editingConfig,
  onEditingConfigChange,
}: AgentFormDialogProps) {
  const { data: agents = [] } = useAgents()
  const createConfig = useCreateAgentConfig()
  const updateConfig = useUpdateAgentConfig()
  const createAgent = useCreateAgent()

  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigContent, setNewConfigContent] = useState('{\n  \n}')
  const [editContent, setEditContent] = useState('')
  const [showAddAgent, setShowAddAgent] = useState(false)
  const [newAgent, setNewAgent] = useState({
    name: '',
    displayName: '',
    configPath: '',
    configFormat: 'json' as 'json' | 'toml' | 'env',
  })

  /** 打开添加配置对话框时重置表单 */
  useEffect(() => {
    if (isAddDialogVisible) {
      setNewConfigName('')
      setNewConfigContent('{\n  \n}')
    }
  }, [isAddDialogVisible])

  /** 编辑配置变更时同步内容到编辑器 */
  useEffect(() => {
    if (editingConfig) {
      setEditContent(editingConfig.content)
    }
  }, [editingConfig])

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
      onShowAddDialogChange(false)
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
      onEditingConfigChange(null)
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
    <>
      {/* 添加配置对话框 */}
      <Dialog open={isAddDialogVisible} onOpenChange={onShowAddDialogChange}>
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
            <Button variant="outline" onClick={() => onShowAddDialogChange(false)}>
              取消
            </Button>
            <Button onClick={handleCreateConfig}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑配置对话框 */}
      <Dialog open={editingConfig !== null} onOpenChange={() => onEditingConfigChange(null)}>
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
            <Button variant="outline" onClick={() => onEditingConfigChange(null)}>
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

      {/* 添加自定义 Agent 触发按钮 */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setShowAddAgent(true)}
      >
        <Plus className="w-4 h-4 mr-2" />
        添加自定义 Agent
      </Button>
    </>
  )
}
