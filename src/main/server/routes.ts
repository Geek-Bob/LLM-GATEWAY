import type { Hono } from 'hono'
import { getDb } from '../db/connection'
import { createProviderService } from '../domains/provider/provider.service'
import { createProviderRouter } from '../domains/provider/provider.router'
import { createApiKeyService } from '../domains/apikey/apikey.service'
import { createApiKeyRouter } from '../domains/apikey/apikey.router'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createConversationRouter } from '../domains/conversation/conversation.router'
import { createLogsService } from '../domains/logs/logs.service'
import { createLogsRouter } from '../domains/logs/logs.router'
import { createStatsService } from '../domains/stats/stats.service'
import { createStatsRouter } from '../domains/stats/stats.router'
import { createChatService } from '../domains/chat/chat.service'
import { createChatRouter } from '../domains/chat/chat.router'

export function registerRoutes(app: Hono): void {
  const db = getDb()
  const providerService = createProviderService(db)
  app.route('/v1/admin/providers', createProviderRouter(providerService))

  const apiKeyService = createApiKeyService(db)
  app.route('/v1/admin/api-keys', createApiKeyRouter(apiKeyService))

  const conversationService = createConversationService(db)
  app.route('/v1/admin/conversations', createConversationRouter(conversationService))

  const logsService = createLogsService(db)
  app.route('/v1/admin/logs', createLogsRouter(logsService))

  const statsService = createStatsService(db)
  app.route('/v1/admin/stats', createStatsRouter(statsService))

  const chatService = createChatService()
  app.route('/v1/chat', createChatRouter(chatService))
}
