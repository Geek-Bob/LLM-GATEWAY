import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ipcMain, BrowserWindow } from 'electron'
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider
} from '../db/providers'
import {
  listApiKeys,
  createApiKey,
  deleteApiKey,
  getApiKeyPlaintext
} from '../db/api-keys'
import { queryLogs, getLogStats, getDetailedStats } from '../db/logs'
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getConversation,
  listMessages,
  addMessage
} from '../db/conversations'
import { getProxyConfig, startProxy, stopProxy, restartProxy, setProxyPort, getDebugMode, setDebugMode } from '../proxy/manager'

const DEBUG_LOG = path.join(os.tmpdir(), 'llm-gateway-chat-debug.log')

function debugFileLog(...args: any[]): void {
  try {
    const ts = new Date().toISOString()
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    fs.appendFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`)
  } catch {}
}

export function setupIpcHandlers(): void {
  // --- Provider handlers ---
  ipcMain.handle('provider:list', async () => {
    return listProviders()
  })

  ipcMain.handle('provider:create', async (_event, data) => {
    return createProvider({
      name: data.name,
      providerType: data.providerType,
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      models: data.models
    })
  })

  ipcMain.handle('provider:update', async (_event, id: number, data) => {
    return updateProvider(id, data)
  })

  ipcMain.handle('provider:delete', async (_event, id: number) => {
    return deleteProvider(id)
  })

  // --- API Key handlers ---
  ipcMain.handle('apikey:list', async () => {
    return listApiKeys()
  })

  ipcMain.handle(
    'apikey:create',
    async (_event, name: string, rateLimit?: number) => {
      return createApiKey(name, rateLimit)
    }
  )

  ipcMain.handle('apikey:delete', async (_event, id: number) => {
    return deleteApiKey(id)
  })

  // --- Log handlers ---
  ipcMain.handle('logs:query', async (_event, params) => {
    return queryLogs(params)
  })

  ipcMain.handle('logs:stats', async (_event, range: string) => {
    return getLogStats({ range })
  })

  ipcMain.handle('logs:statsDetailed', async (_event, range: '24h' | '30d') => {
    const rows = getDetailedStats(range)
    const providers = listProviders()

    const providerMap = new Map<number, {
      providerId: number
      providerName: string
      models: Map<string, {
        model: string
        totalRequests: number
        totalTokensIn: number
        totalTokensOut: number
        totalErrors: number
        dataPoints: { period: number | string; requests: number; tokensIn: number; tokensOut: number }[]
      }>
    }>()

    for (const row of rows) {
      const pid = row.provider_id as number
      const model = row.model as string
      if (!providerMap.has(pid)) {
        const p = providers.find((pr) => pr.id === pid)
        providerMap.set(pid, {
          providerId: pid,
          providerName: p?.name ?? `Provider #${pid}`,
          models: new Map()
        })
      }
      const pm = providerMap.get(pid)!
      if (!pm.models.has(model)) {
        pm.models.set(model, {
          model,
          totalRequests: 0,
          totalTokensIn: 0,
          totalTokensOut: 0,
          totalErrors: 0,
          dataPoints: []
        })
      }
      const mm = pm.models.get(model)!
      mm.totalRequests += row.total_requests as number
      mm.totalTokensIn += row.total_tokens_in as number
      mm.totalTokensOut += row.total_tokens_out as number
      mm.totalErrors += row.total_errors as number
      mm.dataPoints.push({
        period: row.period as number | string,
        requests: row.total_requests as number,
        tokensIn: row.total_tokens_in as number,
        tokensOut: row.total_tokens_out as number
      })
    }

    return Array.from(providerMap.values()).map((p) => ({
      providerId: p.providerId,
      providerName: p.providerName,
      models: Array.from(p.models.values()).map((m) => ({
        model: m.model,
        totalRequests: m.totalRequests,
        totalTokensIn: m.totalTokensIn,
        totalTokensOut: m.totalTokensOut,
        totalErrors: m.totalErrors,
        dataPoints: m.dataPoints
      }))
    }))
  })

  // --- Window control handlers ---
  ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })

  ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // --- Proxy control handlers ---
  ipcMain.handle('proxy:status', async () => {
    return getProxyConfig()
  })

  ipcMain.handle('proxy:start', async (_event, port?: number) => {
    return startProxy(port)
  })

  ipcMain.handle('proxy:stop', async () => {
    stopProxy()
  })

  ipcMain.handle('proxy:restart', async (_event, port?: number) => {
    return restartProxy(port)
  })

  ipcMain.handle('proxy:setPort', async (_event, port: number) => {
    setProxyPort(port)
  })

  ipcMain.handle('proxy:getDebugMode', async () => {
    return getDebugMode()
  })

  ipcMain.handle('proxy:setDebugMode', async (_event, enabled: boolean) => {
    setDebugMode(enabled)
  })

  // --- Renderer debug log handler ---
  ipcMain.on('renderer:log', (_event, args: any[]) => {
    debugFileLog('[RENDERER]', ...args)
  })

  // --- Chat handlers ---
  const chatAbortControllers = new Map<string, AbortController>()

  ipcMain.on('chat:send', async (event, data: {
    requestId: string
    apiKeyId: number
    model: string
    messages: { role: string; content: string }[]
    apiFormat: 'anthropic' | 'openai'
  }) => {
    const requestId = data.requestId || randomUUID()
    const abortController = new AbortController()
    chatAbortControllers.set(requestId, abortController)

    debugFileLog('=== CHAT SEND START ===', { requestId, model: data.model, apiFormat: data.apiFormat, messages: data.messages })

    try {
      // Step 1: Get API key
      const keyPlaintext = getApiKeyPlaintext(data.apiKeyId)
      debugFileLog('STEP1: getApiKeyPlaintext', { apiKeyId: data.apiKeyId, found: !!keyPlaintext })
      if (!keyPlaintext) throw new Error('API key not found or not available')

      // Step 2: Build URL
      const path = data.apiFormat === 'anthropic' ? '/v1/messages' : '/v1/chat/completions'
      const url = `http://localhost:${getProxyConfig().port}${path}`
      debugFileLog('STEP2: url', { url, model: data.model })

      // Step 3: Fetch from proxy
      debugFileLog('STEP3: calling fetch...')
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyPlaintext}`
        },
        body: JSON.stringify({
          model: data.model,
          messages: data.messages,
          stream: true
        }),
        signal: abortController.signal,
      })
      debugFileLog('STEP3: fetch response', { status: response.status, ok: response.ok, contentType: response.headers.get('content-type') })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        debugFileLog('STEP3: response NOT OK', { status: response.status, body: errBody })
        throw new Error(`Proxy returned ${response.status}: ${errBody}`)
      }

      // Step 4: Read SSE body
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Response body is not readable')
      debugFileLog('STEP4: got reader, starting stream read')

      const decoder = new TextDecoder()
      let buffer = ''
      let totalBytes = 0
      let extractedCount = 0
      let sseLineCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        totalBytes += value?.byteLength || 0
        const decoded = decoder.decode(value, { stream: true })
        buffer += decoded

        // Log raw chunk
        if (totalBytes < 50000) {
          debugFileLog('STEP4: raw chunk', { byteLength: value?.byteLength, decodedLength: decoded.length, decodedPreview: decoded.slice(0, 200) })
        }

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          sseLineCount++

          let text = ''
          let chunkType: 'thinking' | 'text' | undefined
          if (data.apiFormat === 'openai') {
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6)
              if (jsonStr === '[DONE]') continue
              try {
                const parsed = JSON.parse(jsonStr)
                text = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.text || ''
                if (text) debugFileLog('SSE:openai line extracted', { preview: text.slice(0, 50) })
              } catch { /* skip malformed JSON */ }
            }
          } else {
            const tryExtract = (obj: any): { text: string; chunkType: 'thinking' | 'text' } | null => {
              if (obj?.type !== 'content_block_delta') return null
              const d = obj.delta
              if (!d) return null
              if (d.type === 'text_delta' && d.text) return { text: d.text, chunkType: 'text' }
              if (d.type === 'thinking_delta' && d.thinking) return { text: d.thinking, chunkType: 'thinking' }
              return null
            }

            // Log every SSE line for anthropic format (first 100 lines)
            if (sseLineCount <= 100) {
              debugFileLog('SSE:anthropic line', { index: sseLineCount, raw: trimmed.slice(0, 200) })
            }

            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6))
                const result = tryExtract(parsed)
                if (result) {
                  debugFileLog('SSE:anthropic EXTRACTED', { len: result.text.length, type: result.chunkType, preview: result.text.slice(0, 50) })
                  text = result.text
                  chunkType = result.chunkType
                }
                // Log when content_block_delta is found but no text extracted
                if (parsed?.type === 'content_block_delta') {
                  debugFileLog('SSE:anthropic content_block_delta', { delta: parsed.delta })
                }
              } catch { /* skip */ }
            }
          }

          if (text) {
            extractedCount++
            debugFileLog('STEP5: sending chunk via IPC', { requestId, textLen: text.length, chunkType, preview: text.slice(0, 40).replace(/\n/g, '\\n'), chunkIndex: extractedCount })
            event.sender.send('chat:chunk', { requestId, text, chunkType, done: false })
          }
        }
      }

      debugFileLog('STEP6: stream complete', { requestId, totalBytes, bufferRemaining: buffer.length, sseLineCount, extractedCount })
      event.sender.send('chat:chunk', { requestId, text: '', done: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof DOMException && (err as DOMException).name === 'AbortError') {
        debugFileLog('STEP: request aborted', { requestId })
        return
      }
      debugFileLog('STEP: ERROR', { requestId, error: message, stack: err instanceof Error ? err.stack : '' })
      event.sender.send('chat:chunk', { requestId, text: '', done: true, error: message })
    } finally {
      chatAbortControllers.delete(requestId)
    }
  })

  ipcMain.on('chat:abort', (_event, requestId: string) => {
    const controller = chatAbortControllers.get(requestId)
    controller?.abort()
    chatAbortControllers.delete(requestId)
  })

  // --- Conversation handlers ---
  ipcMain.handle('conversation:list', async () => {
    return listConversations()
  })

  ipcMain.handle('conversation:create', async (_event, data: {
    title: string
    model: string
    providerId?: number | null
    apiKeyId?: number | null
  }) => {
    return createConversation(data.title, data.model, data.providerId, data.apiKeyId)
  })

  ipcMain.handle('conversation:update', async (_event, id: number, data: {
    title?: string
    providerId?: number | null
    model?: string
    apiKeyId?: number | null
  }) => {
    return updateConversation(id, {
      title: data.title,
      provider_id: data.providerId,
      model: data.model,
      api_key_id: data.apiKeyId
    })
  })

  ipcMain.handle('conversation:delete', async (_event, id: number) => {
    return deleteConversation(id)
  })

  ipcMain.handle('conversation:get', async (_event, id: number) => {
    return getConversation(id) || null
  })

  // --- Message handlers ---
  ipcMain.handle('conversation:messages', async (_event, conversationId: number) => {
    return listMessages(conversationId)
  })

  ipcMain.handle('conversation:addMessage', async (_event, conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => {
    return addMessage(conversationId, role, content, thinking)
  })
}
