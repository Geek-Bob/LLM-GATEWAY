/**
 * Agent 查询 Hooks
 *
 * 封装的 IPC 通道：agent:list / agent:get / agent:create / agent:update / agent:delete
 * 以及 agent 配置相关：agent:listConfigs / agent:getConfig / agent:createConfig /
 * agent:updateConfig / agent:deleteConfig / agent:switchConfig
 *
 * TanStack Query 用法：
 * - useAgents: Agent 列表查询，queryKey=['agents', 'list']
 * - useAgent(id): 单个 Agent 查询，queryKey=['agents', 'getById', id]
 * - useCreateAgent: mutation 成功后自动 invalidate 'agents' 缓存触发刷新
 * - useUpdateAgent / useDeleteAgent: 同上
 * - useAgentConfigs(agentId): 指定 Agent 的配置列表
 * - useCreateAgentConfig / useUpdateAgentConfig / useDeleteAgentConfig / useSwitchAgentConfig: 配置 CRUD
 *
 * 缓存策略：所有写操作（CUD）成功后 invalidate 相关 queryKey，下次读取时自动重新 fetch。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type {
  AgentEntity, AgentConfigEntity, CreateAgentInput, UpdateAgentInput, CreateAgentConfigInput, UpdateAgentConfigInput, SwitchConfigInput,
} from '../../../shared/types'

/** 向后兼容别名 */
type AgentResponse = AgentEntity
type AgentConfigResponse = AgentConfigEntity

// ====== Agent CRUD ======

/** 查询所有 Agent 列表 */
export function useAgents() {
  return useQuery<AgentResponse[]>({
    queryKey: ['agents', 'list'],
    queryFn: () => api.agents.list(),
  })
}

/** 查询单个 Agent（id 为 null 时跳过查询） */
export function useAgent(id: number | null) {
  return useQuery<AgentResponse | null>({
    queryKey: ['agents', 'getById', id],
    queryFn: () => api.agents.get(id!),
    enabled: id !== null,
  })
}

/** 创建 Agent */
export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAgentInput) => api.agents.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', 'list'] }),
  })
}

/** 更新 Agent */
export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAgentInput }) =>
      api.agents.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', 'list'] }),
  })
}

/** 删除 Agent */
export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents', 'list'] }),
  })
}

// ====== Agent Config CRUD ======

/** 查询指定 Agent 的配置列表（agentId 为 null 时跳过查询） */
export function useAgentConfigs(agentId: number | null) {
  return useQuery<AgentConfigResponse[]>({
    queryKey: ['agentConfigs', 'list', agentId],
    queryFn: () => api.agents.listConfigs(agentId!),
    enabled: agentId !== null,
  })
}

/** 创建 Agent 配置 */
export function useCreateAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAgentConfigInput) => api.agents.createConfig(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['agentConfigs', 'list', variables.agentId] })
    },
  })
}

/** 更新 Agent 配置（invalidate 所有 agent-configs 缓存，因未知 agentId） */
export function useUpdateAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAgentConfigInput }) =>
      api.agents.updateConfig(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agentConfigs', 'list'] })
    },
  })
}

/** 删除 Agent 配置（invalidate 所有 agent-configs 缓存，因未知 agentId） */
export function useDeleteAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.agents.deleteConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agentConfigs', 'list'] })
    },
  })
}

/** 原子切换 Agent 的当前激活配置 */
export function useSwitchAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SwitchConfigInput) => api.agents.switchConfig(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['agentConfigs', 'list', variables.agentId] })
    },
  })
}
