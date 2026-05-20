import type { Provider } from '../db/providers'

export function buildProxyUrl(provider: Provider, path: string): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
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
