/**
 * Agent Domain 类型定义
 *
 * 类型已统一迁移至 shared/types.ts（遵循目录隔离规则）。
 * 本文件仅做 re-export，保持向后兼容。
 */

export type {
  ConfigFormat,
  AgentEntity,
  AgentConfigEntity,
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  SwitchConfigInput,
} from '../../../shared/types'

// 向后兼容别名：AgentResponse → AgentEntity, AgentConfigResponse → AgentConfigEntity
export type { AgentEntity as AgentResponse, AgentConfigEntity as AgentConfigResponse } from '../../../shared/types'
