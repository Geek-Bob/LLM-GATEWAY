import type { Hono } from 'hono'
import { getDb } from '../db/connection'
import { createProviderService } from '../domains/provider/provider.service'
import { createProviderRouter } from '../domains/provider/provider.router'
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createApiKeyRouter } from '../domains/apikey/apikey.router'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createConversationRouter } from '../domains/conversation/conversation.router'

export function registerRoutes(app: Hono): void {
  const db = getDb()
  const providerService = createProviderService(db)
  app.route('/v1/admin/providers', createProviderRouter(providerService))

  const apiKeyService = createApiKeyService(db)
  app.route('/v1/admin/api-keys', createApiKeyRouter(apiKeyService))

  const conversationService = createConversationService(db)
  app.route('/v1/admin/conversations', createConversationRouter(conversationService))
}
