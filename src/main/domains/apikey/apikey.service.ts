import type { Database } from '../../db/database'
import type { ApiKeyResponse, CreateApiKeyInput } from './apikey.types'
import { listApiKeys, createApiKey, deleteApiKey, getApiKeyById } from '../../db/api-keys'

export function createApiKeyService(_db: Database) {
  return {
    list: async (): Promise<ApiKeyResponse[]> => {
      return listApiKeys()
    },

    getById: async (id: number) => {
      return getApiKeyById(id)
    },

    create: async (input: CreateApiKeyInput) => {
      return createApiKey(input.name, input.rateLimit ?? 60)
    },

    remove: async (id: number): Promise<void> => {
      deleteApiKey(id)
    }
  }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
