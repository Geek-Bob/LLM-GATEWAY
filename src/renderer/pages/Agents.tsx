/**
 * Agents 页面 — Agent 配置管理
 *
 * 薄层编排组件：管理状态，组合 AgentList 和 AgentFormDialog 子组件。
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAgents,
  useAgentConfigs,
  useSwitchAgentConfig,
  useDeleteAgentConfig,
} from '@/lib/queries/agents'
import type { AgentConfigEntity } from '@/lib/types'
import { getErrorMessage } from '@/lib/utils'
import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
import { pageVariants, childVariants } from '@/lib/animations'
import { AgentList } from '@/features/agent/components/AgentList'
import { AgentFormDialog } from '@/features/agent/components/AgentFormDialog'

/** Agents 管理页面 — 编排 Agent 列表与表单对话框 */
/** Agent 配置管理页面，编排 Agent 列表与表单对话框。 @returns Agents 页面 JSX。 */
export function AgentsPage() {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingConfig, setEditingConfig] = useState<AgentConfigEntity | null>(null)

  const { data: agents = [] } = useAgents()
  const { data: configs = [] } = useAgentConfigs(expandedAgent)
  const switchConfig = useSwitchAgentConfig()
  const deleteConfig = useDeleteAgentConfig()
  const { execute: deleteConfigAction } = useDeleteWithToast(deleteConfig, '配置')

  const handleDeleteConfig = async (configId: number, configName: string) => {
    await deleteConfigAction(configId, configName)
  }

  const handleSwitchConfig = async (agentId: number, configId: number) => {
    try {
      await switchConfig.mutateAsync({ agentId, configId })
      toast.success('配置已切换')
    } catch (error) {
      toast.error('切换失败: ' + getErrorMessage(error))
    }
  }

  const toggleAgent = (agentId: number) => {
    setExpandedAgent(expandedAgent === agentId ? null : agentId)
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
        <AgentList
          agents={agents}
          expandedAgent={expandedAgent}
          onToggleAgent={toggleAgent}
          configs={configs}
          onSwitchConfig={handleSwitchConfig}
          onDeleteConfig={handleDeleteConfig}
          onEditConfig={(config) => setEditingConfig(config)}
          onOpenAddDialog={() => setShowAddDialog(true)}
        />
      </motion.div>

      <motion.div variants={childVariants}>
        <AgentFormDialog
          showAddDialog={showAddDialog}
          onShowAddDialogChange={setShowAddDialog}
          expandedAgent={expandedAgent}
          editingConfig={editingConfig}
          onEditingConfigChange={setEditingConfig}
        />
      </motion.div>
    </motion.div>
  )
}
