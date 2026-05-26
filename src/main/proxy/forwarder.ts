import type { Provider } from '../db/providers'

export function buildProxyUrl(provider: Provider, path: string): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  let cleanPath = path.startsWith('/') ? path : `/${path}`

  // Deduplicate overlapping path prefix: if baseUrl already ends with a
  // segment that cleanPath starts with, strip it from cleanPath.
  // Example: baseUrl ".../v1" + path "/v1/chat/completions" → ".../v1/chat/completions"
  const baseParts = baseUrl.split('/')
  const pathParts = cleanPath.split('/').filter(Boolean)
  let overlapEnd = 0
  for (let i = 1; i <= Math.min(baseParts.length, pathParts.length); i++) {
    const baseSuffix = baseParts.slice(baseParts.length - i).join('/')
    const pathPrefix = pathParts.slice(0, i).join('/')
    if (baseSuffix === pathPrefix) {
      overlapEnd = i
    }
  }
  if (overlapEnd > 0) {
    cleanPath = '/' + pathParts.slice(overlapEnd).join('/')
  }

  return `${baseUrl}${cleanPath}`
}

export function buildProxyHeaders(
  provider: Provider,
  decryptedKey: string,
  originalHeaders: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    ...originalHeaders,
    authorization: `Bearer ${decryptedKey}`,
    'content-type': originalHeaders['content-type'] || originalHeaders['Content-Type'] || 'application/json'
  }

  if (provider.providerType === 'anthropic') {
    headers['anthropic-version'] = '2023-06-01'
  }

  return headers
}

export function buildProxyBody(body: unknown, _provider: Provider): unknown {
  return body
}
