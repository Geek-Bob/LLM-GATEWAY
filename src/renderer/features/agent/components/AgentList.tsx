/**
 * Agent 列表组件
 *
 * 展示所有已注册的 Agent 卡片，支持展开/收起配置面板。
 * 每个 Agent 下展示其配置列表，支持切换、编辑、删除操作。
 */

import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import type { AgentEntity, AgentConfigEntity } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/shared/empty-state'
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

/** AgentList 组件属性 */
interface AgentListProps {
  /** Agent 列表 */
  agents: AgentEntity[]
  /** 当前展开的 Agent ID */
  expandedAgent: number | null
  /** 展开/收起 Agent 回调 */
  onToggleAgent: (agentId: number) => void
  /** 指定 Agent 的配置列表 */
  configs: AgentConfigEntity[]
  /** 切换配置回调 */
  onSwitchConfig: (agentId: number, configId: number) => void
  /** 删除配置回调 */
  onDeleteConfig: (configId: number, configName: string) => void
  /** 编辑配置回调 */
  onEditConfig: (config: AgentConfigEntity) => void
  /** 打开添加配置对话框回调 */
  onOpenAddDialog: () => void
}

/** 单个配置项属性 */
interface AgentConfigItemProps {
  config: AgentConfigEntity
  agentId: number
  onSwitchConfig: (agentId: number, configId: number) => void
  onEdit: () => void
  onDelete: () => void
}

/** 单个配置项 — 展示配置名称、状态指示点和操作按钮 */
function AgentConfigItem({ config, agentId, onSwitchConfig, onEdit, onDelete }: AgentConfigItemProps) {
  return (
    <div
      className={`flex items-center justify-between p-2 rounded ${
        config.isCurrent === 1 ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      <div
        className="flex items-center gap-2 cursor-pointer flex-1"
        onClick={() => config.isCurrent !== 1 && onSwitchConfig(agentId, config.id)}
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
            onEdit()
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
              onDelete()
            }}
          >
            删除
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Agent 列表
 *
 * 展示所有已注册的 Agent，每个 Agent 可展开查看和管理配置。
 * 包含配置删除确认对话框。
 */
export function AgentList({
  agents,
  expandedAgent,
  onToggleAgent,
  configs,
  onSwitchConfig,
  onDeleteConfig,
  onEditConfig,
  onOpenAddDialog,
}: AgentListProps) {
  const [configToDelete, setConfigToDelete] = useState<number | null>(null)

  const handleConfirmDelete = () => {
    if (configToDelete) {
      const config = configs.find(c => c.id === configToDelete)
      onDeleteConfig(configToDelete, config?.name ?? String(configToDelete))
      setConfigToDelete(null)
    }
  }

  return (
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
                onClick={() => onToggleAgent(agent.id)}
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
                      <AgentConfigItem
                        key={config.id}
                        config={config}
                        agentId={agent.id}
                        onSwitchConfig={onSwitchConfig}
                        onEdit={() => onEditConfig(config)}
                        onDelete={() => setConfigToDelete(config.id)}
                      />
                    ))
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={onOpenAddDialog}
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
            <AlertDialogAction onClick={handleConfirmDelete}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
