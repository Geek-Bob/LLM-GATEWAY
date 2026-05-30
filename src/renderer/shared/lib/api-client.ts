let baseUrl = 'http://localhost:8080'
let apiKey = ''

export function setApiBaseUrl(url: string) {
  baseUrl = url
}

export function setApiKey(key: string) {
  apiKey = key
}

export function getApiKey(): string {
  return apiKey
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {}
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => { headers[key] = value })
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => { headers[key] = value })
    } else {
      Object.assign(headers, init.headers)
    }
  }

  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  })
}
