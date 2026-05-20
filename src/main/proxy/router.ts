import type { Provider } from '../db/providers'
import { getProviderByName, listActiveProviders } from '../db/providers'

export interface ModelRoute {
  prefix: string
  modelName: string
  provider: Provider
}

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

export function getAllModels(): { id: string; provider: string; providerType: string }[] {
  const providers = listActiveProviders()
  const result: { id: string; provider: string; providerType: string }[] = []

  for (const p of providers) {
    for (const model of p.models) {
      result.push({
        id: `${p.name}/${model}`,
        provider: p.name,
        providerType: p.providerType
      })
    }
  }

  return result
}
