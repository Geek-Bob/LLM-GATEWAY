import type { Hono } from 'hono'

export function registerRoutes(_app: Hono): void {
  // 各 domain router 将在后续 Phase 注册
  // app.route('/v1/admin/providers', createProviderRouter(service))
  // app.route('/v1/admin/api-keys', createApiKeyRouter(service))
  // ...
}
