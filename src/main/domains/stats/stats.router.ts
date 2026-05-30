import { Hono } from 'hono'
import type { StatsService } from './stats.service'

export function createStatsRouter(service: StatsService) {
  const router = new Hono()

  router.get('/summary', async (c) => {
    const range = new URL(c.req.url).searchParams.get('range') || '24h'
    return c.json(await service.summary(range))
  })

  return router
}
