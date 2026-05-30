import { Hono } from 'hono'
import type { LogsService } from './logs.service'

export function createLogsRouter(service: LogsService) {
  const router = new Hono()

  router.get('/query', async (c) => {
    const params = Object.fromEntries(new URL(c.req.url).searchParams)
    return c.json(await service.query(params))
  })

  router.get('/stats', async (c) => {
    const range = new URL(c.req.url).searchParams.get('range') || '24h'
    return c.json(await service.stats(range))
  })

  router.get('/stats-detailed', async (c) => {
    const range = (new URL(c.req.url).searchParams.get('range') || '24h') as '24h' | '30d'
    return c.json(await service.detailedStats(range))
  })

  return router
}
