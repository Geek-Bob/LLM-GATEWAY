/**
 * 代理请求 URL/Header/Body 构建
 *
 * 负责将收到的请求重写到上游供应商的目标格式：
 * - URL 去重：当 baseUrl 尾段和 path 头段重叠时自动去重
 * - Header 替换：用供应商的 API Key 替换原始 Authorization
 * - Body 透传：当前不做格式转换（转换由 converter.ts 处理）
 *
 * 安全要点：decryptedKey 来自供应商记录的 apiKey 字段，通过 Bearer 头透传给上游。
 */

import type { Provider } from '../db/providers'

/**
 * 构建最终的上游请求 URL。
 *
 * 关键逻辑：路径前缀去重。
 * 例如 baseUrl = "https://api.anthropic.com/v1", path = "/v1/messages"，
 * 直接拼接会得到 ".../v1/v1/messages"。
 * 此函数检测到 /v1 重叠后，输出 ".../v1/messages"。
 */
export function buildProxyUrl(provider: Provider, path: string): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, '')
  let cleanPath = path.startsWith('/') ? path : `/${path}`

  // 去重逻辑：从尾部到头部逐段匹配 baseUrl 和 path 的重叠部分
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

/**
 * 构建转发请求的 HTTP 头。
 *
 * 核心操作：
 * 1. 继承原始请求的所有 headers
 * 2. 用存储的供应商 API Key 替换 Authorization（Bearer 格式）
 * 3. 确保 content-type 始终存在
 * 4. 对于 Anthropic 供应商，自动添加 anthropic-version 头
 */
export function buildProxyHeaders(
  provider: Provider,
  decryptedKey: string,
  originalHeaders: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    ...originalHeaders,
    'content-type': originalHeaders['content-type'] || originalHeaders['Content-Type'] || 'application/json'
  }

  if (provider.providerType === 'anthropic') {
    // Anthropic API 使用 x-api-key header
    headers['x-api-key'] = decryptedKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    // OpenAI 兼容 API 使用 Authorization: Bearer header
    headers['authorization'] = `Bearer ${decryptedKey}`
  }

  return headers
}

/**
 * 构建转发请求体。
 * 当前实现为透传（直接返回原始 body）。
 * 格式转换（OpenAI ↔ Anthropic）由 server.ts 中的 converter 处理。
 */
export function buildProxyBody(body: unknown, _provider: Provider): unknown {
  return body
}
