/**
 * 代理认证中间件
 *
 * 从 HTTP Authorization 头中提取 Bearer token。
 * 此 token 是 Gateway API Key（由 api-keys.ts 生成），用于客户端调用代理的身份验证。
 *
 * 注意：这是网关自身的认证层，区别于上游供应商的 API Key。
 * 验证逻辑由调用方在获取 token 后通过 verifyApiKey() 完成。
 *
 * 边界情况：
 * - 无 Authorization 头 → 返回 null（调用方应返回 401）
 * - 非 Bearer 格式 → 返回 null
 * - Bearer 后无 token → 返回 null
 */
export function authMiddleware(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null
  const token = authHeader.slice(7)
  return token || null
}
