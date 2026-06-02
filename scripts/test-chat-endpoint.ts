/**
 * 独立测试脚本：启动 Proxy Server → 创建 API Key/Provider → 调用 /v1/chat/completions
 * 打印完整请求/响应，不依赖 Electron UI
 */
import { initDatabase, closeDatabase } from '../src/main/db/connection'
import { createTables } from '../src/main/db/schema'
import { createApiKey } from '../src/main/db/api-keys'
import { createProvider } from '../src/main/db/providers'
import { createServer } from '../src/main/proxy/server'

async function main() {
  console.log('=== Chat Endpoint 集成测试 ===\n')

  // 1. 初始化内存数据库
  await initDatabase(':memory:')
  createTables()
  console.log('[OK] 数据库初始化完成')

  // 2. 创建 API Key
  const keyResult = createApiKey('Test Key', 60)
  console.log('[OK] API Key 创建:', keyResult.plaintextKey)

  // 3. 创建 Provider (使用 mock upstream)
  createProvider({
    name: 'test-provider',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-upstream-key',
    models: ['gpt-4']
  })
  console.log('[OK] Provider 创建: test-provider/gpt-4')

  // 4. 创建 Proxy App
  const app = createServer()
  console.log('[OK] Proxy 服务器创建完成\n')

  // 5. 测试 1: 无鉴权 → 预期 401
  console.log('--- 测试 1: 无 Authorization 头 ---')
  const res1 = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'test-provider/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  })
  console.log('响应状态:', res1.status)
  const body1 = await res1.json()
  console.log('响应体:', JSON.stringify(body1))
  console.log('预期: 401 unauthorized →', res1.status === 401 ? '[PASS]' : '[FAIL]')

  // 6. 测试 2: 有效鉴权 + stream=true → 预期 200 + 标准 OpenAI SSE
  console.log('\n--- 测试 2: 有效鉴权 + stream=true ---')
  const mockSSE = [
    'data: {"id":"chatcmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
    'data: {"id":"chatcmpl-001","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" World"},"finish_reason":"stop"}]}',
    'data: [DONE]'
  ].join('\n')
  const encoded = new TextEncoder().encode(mockSSE)

  const mockBody = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    }
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: any, opts: any) => {
    console.log('[Mock Fetch] URL:', typeof url === 'string' ? url : url?.toString())
    console.log('[Mock Fetch] Method:', opts?.method)
    return {
      ok: true,
      status: 200,
      body: mockBody,
      headers: new Headers({ 'content-type': 'text/event-stream' })
    } as any
  }) as any

  const res2 = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${keyResult.plaintextKey}`
    },
    body: JSON.stringify({
      model: 'test-provider/gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  })

  console.log('响应状态:', res2.status)
  console.log('响应 Content-Type:', res2.headers.get('Content-Type'))
  const text2 = await res2.text()
  console.log('响应体 (SSE):')
  console.log(text2)
  console.log('Content-Type 是 text/event-stream:', res2.headers.get('Content-Type')?.startsWith('text/event-stream') ? '[PASS]' : '[FAIL]')
  console.log('包含 delta.content "Hello":', text2.includes('Hello') ? '[PASS]' : '[FAIL]')
  console.log('包含 [DONE] 终止信号:', text2.includes('[DONE]') ? '[PASS]' : '[FAIL]')

  globalThis.fetch = originalFetch

  // 7. 测试 3: 缺少 model → 预期 400
  console.log('\n--- 测试 3: 缺少 model 字段 ---')
  const res3 = await app.request('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${keyResult.plaintextKey}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true
    })
  })
  console.log('响应状态:', res3.status)
  const body3 = await res3.json()
  console.log('响应体:', JSON.stringify(body3))
  console.log('预期: 400 model is required →', res3.status === 400 ? '[PASS]' : '[FAIL]')

  closeDatabase()
  console.log('\n=== 测试完成 ===')
}

main().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})
