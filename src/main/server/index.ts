import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerRoutes } from './routes'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { createAuthMiddleware } from './middleware/auth'
import { createRateLimiter } from './middleware/rate-limit'

export function createApp() {
  const app = new Hono()

  app.use('*', cors())

  // Auth + rate-limit for all managed API routes
  app.use('/v1/*', createAuthMiddleware())
  app.use('/v1/*', createRateLimiter())

  registerRoutes(app)

  return app
}

export function startServer(port: number = 8080): Server {
  const app = createApp()
  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
  return server as unknown as Server
}
