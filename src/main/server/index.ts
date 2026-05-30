import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { registerRoutes } from './routes'
import type { Server } from 'node:http'
import { serve } from '@hono/node-server'

export function createApp() {
  const app = new Hono()

  app.use('*', cors())

  registerRoutes(app)

  return app
}

export function startServer(port: number = 8080): Server {
  const app = createApp()
  const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
  return server as unknown as Server
}
