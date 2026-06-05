/**
 * 模型映射类型定义
 */

/** 模型映射实体 */
export interface ModelMapping {
  id: number
  sourceModel: string       // 客户端请求的模型名
  targetModel: string       // 完整模型 ID，如 "deepseek/deepseek-v4-pro"
  isActive: number
  createdAt: string
}

/** 创建映射输入 */
export interface CreateModelMappingInput {
  sourceModel: string
  targetModel: string
}

/** 更新映射输入 */
export interface UpdateModelMappingInput {
  sourceModel?: string
  targetModel?: string
}

/** 模型信息（用于 /v1/models 端点和配置 UI） */
export interface ModelInfo {
  id: string                // 完整模型 ID，如 "anthropic/claude-sonnet-4"
  provider: string          // provider name
  providerType: string      // 'anthropic' | 'openai'
}
