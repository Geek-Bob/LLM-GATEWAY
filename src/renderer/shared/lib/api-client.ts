/**
 * HTTP API 客户端（仅用于 Chat 流式对话）
 *
 * 职责：封装对本地 Hono 代理（localhost:8080）的 HTTP 请求。
 *
 * 架构约束：
 * - **仅用于 Chat 对话流**：通过 proxy 验证 LLM 代理能力，使用 SSE（Server-Sent Events）
 * - **严禁用于业务 CRUD**：业务数据的增删改查必须走 IPC（preload → ipcMain.handle）
 * - 详见 .claude/rules/00-core.md 和 .claude/rules/20-directory.md 中的约定
 *
 * 模块状态：
 * - baseUrl：代理服务器地址，默认 localhost:8080
 * - apiKey：通过 setApiKey 注入，自动附加 Authorization header
 *
 * ApiError：非 2xx 响应时抛出，携带 status 和解析后的 JSON body
 * header 归一化：统一 Headers 对象 / 元组数组 / 普通对象三种输入格式为 Record<string, string>
 */
const baseUrl = 'http://localhost:8080'
let apiKey = ''

export function setApiKey(key: string) {
  apiKey = key
}

export function getApiKey(): string {
  return apiKey
}

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>

  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
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

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    // 兼容两种错误格式：{"error": "msg"} 或 {"error": {"message": "msg"}}
    const errorMsg = typeof body?.error === 'string'
      ? body.error
      : body?.error?.message || response.statusText
    throw new ApiError(response.status, errorMsg, body)
  }

  return response
}
