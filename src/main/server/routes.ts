import type { Hono } from 'hono'
import { getDb } from '../db/connection'
import { createProviderService } from '../domains/provider/provider.service'
import { createProviderRouter } from '../domains/provider/provider.router'

export function registerRoutes(app: Hono): void {
  const db = getDb()
  const providerService = createProviderService(db)
  app.route('/v1/admin/providers', createProviderRouter(providerService))
}
