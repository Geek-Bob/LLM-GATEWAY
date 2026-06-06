/**
 * 模型→供应商路由解析
 *
 * LLM Gateway 的模型 ID 格式为 "供应商名称/模型名称"（如 "anthropic/claude-sonnet-4"），
 * 本模块负责将此复合 ID 拆解并匹配到对应的供应商记录。
 *
 * 路由三步校验：
 * 1. 格式校验：确保包含 "/" 分隔符
 * 2. 供应商存在校验：通过 name 精确匹配
 * 3. 激活状态 + 模型白名单校验
 */

import type { Provider } from '../db/providers'
import { getProviderByName } from '../db/providers'

interface ModelRoute {
  prefix: string
  modelName: string
  provider: Provider
}

/**
 * 将 "anthropic/claude-sonnet-4" 格式的模型 ID 解析为前缀和模型名两部分。
 * 如果没有 "/" 分隔符则直接抛异常，不做默认前缀猜测，避免路由歧义。
 */
export function parseModelId(modelId: string): { prefix: string; modelName: string } {
  const slashIndex = modelId.indexOf('/')
  if (slashIndex === -1) {
    throw new Error(`Invalid model ID format: "${modelId}". Expected "provider-name/model-id"`)
  }
  return {
    prefix: modelId.slice(0, slashIndex),
    modelName: modelId.slice(slashIndex + 1)
  }
}

/**
 * 解析模型 ID 并查找匹配的供应商。
 * 依次执行三个检查，任一失败抛异常：
 * 1. 模型 ID 格式必须为 "provider/model"
 * 2. 供应商必须存在于数据库中
 * 3. 供应商必须处于激活状态（isActive === 1）
 * 4. 模型必须在供应商的 models 白名单中
 */
export function resolveProvider(modelId: string): ModelRoute {
  const { prefix, modelName } = parseModelId(modelId)
  const provider = getProviderByName(prefix)

  if (!provider) {
    throw new Error(`Provider not found: "${prefix}"`)
  }

  if (provider.isActive !== 1) {
    throw new Error(`Provider "${prefix}" is not active`)
  }

  if (!provider.models.includes(modelName)) {
    throw new Error(`Model "${modelName}" not found in provider "${prefix}" models`)
  }

  return { prefix, modelName, provider }
}
