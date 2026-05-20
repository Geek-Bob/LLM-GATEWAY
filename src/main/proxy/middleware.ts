export function authMiddleware(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null
  const token = authHeader.slice(7)
  return token || null
}
