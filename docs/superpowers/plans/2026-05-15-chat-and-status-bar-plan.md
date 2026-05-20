# Chat + 状态栏 实施计划

> **针对代理工作者：** 必需子技能：使用 subagent-driven-development 或 executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 finishing-a-development-branch 交付

**目标：** 在看板顶部添加代理服务状态栏 + 新增 Chat 页面用于端到端验证模型可用性

**架构：**
- 状态栏：新增 IPC `proxy:status` 获取端口和运行状态，StatusBar 组件嵌入 Dashboard
- Chat 页面：通过 IPC `chat:send` 由主进程代理解密并转发请求到供应商 API，流式响应通过 `chat:chunk` 事件回传渲染。不直接 fetch 代理服务器（API Key 仅存哈希无法在渲染进程获取明文）。

**技术栈：** React 19 + TypeScript + Tailwind CSS + Electron IPC 流式通信

**追踪：** `[✅] 5/5 任务` — 已完成

---

### Task 1: IPC + Preload + Types — proxy:status 通道

**文件：**
- 修改：`src/main/ipc/index.ts` — 新增 proxy:status handler
- 修改：`src/preload/index.ts` — 暴露 proxy.status
- 修改：`src/renderer/lib/types.ts` — 新增 ProxyStatus 类型

**步骤：**

- [✅] **步骤 1：types.ts 添加 ProxyStatus**

- [✅] **步骤 1.5：src/main/index.ts 导出 PROXY_PORT**

- [✅] **步骤 2：types.ts 的 Window.electronAPI 添加 proxy 段**

- [✅] **步骤 3：ipc/index.ts 添加 proxy:status handler**

- [✅] **步骤 4：preload/index.ts 暴露 proxy.status**

- [✅] **步骤 5：验证构建** — `npm run build` exit 0

---

### Task 2: StatusBar 组件 + Dashboard 集成

**文件：**
- 创建：`src/renderer/components/StatusBar.tsx`
- 修改：`src/renderer/pages/Dashboard.tsx`

**步骤：**

- [✅] **步骤 1：创建 StatusBar 组件**

`src/renderer/components/StatusBar.tsx`：

```tsx
import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import type { ProxyStatus } from '../lib/types'

export function StatusBar() {
  const [status, setStatus] = useState<ProxyStatus | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.proxy.status().then(setStatus)
  }, [])

  const handleCopy = async () => {
    if (!status) return
    try {
      await navigator.clipboard.writeText(status.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard not available */ }
  }

  if (!status) {
    return (
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-4 mb-6 animate-pulse">
        <div className="h-5 w-40 bg-slate-700 rounded" />
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${status.running ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-red-500'}`} />
          <div>
            <p className="text-white font-semibold text-sm">
              {status.running ? '代理服务运行中' : '代理服务未运行'}
            </p>
            <p className="text-slate-400 text-xs font-mono mt-0.5">{status.url}</p>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          {copied ? (
            '✓ 已复制'
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制
            </>
          )}
        </button>
      </div>
    </div>
  )
}
```

- [✅] **步骤 2：Dashboard 集成**

- [✅] **步骤 3：验证构建** — `npm run build` exit 0

---

### Task 3: Chat 导航入口 + 路由注册

**文件：**
- 修改：`src/renderer/components/Layout.tsx` — PageKey + navItems
- 创建：`src/renderer/pages/Chat.tsx` — 占位（Task 5 填充完整功能）
- 修改：`src/renderer/App.tsx` — 注册 Chat 页面

**步骤：**

- [✅] **步骤 1：Layout.tsx PageKey 添加 chat**

```typescript
export type PageKey = 'dashboard' | 'providers' | 'api-keys' | 'logs' | 'chat'
```

navItems 末尾添加：

```typescript
  { key: 'chat', label: 'Chat', icon: '💬' },
```

- [✅] **步骤 2：App.tsx 注册 Chat**

添加 import：

```typescript
import { ChatPage } from './pages/Chat'
```

switch 中添加 case：

```typescript
      case 'chat':
        return <ChatPage />
```

- [✅] **步骤 3：创建 Chat 占位页面**

创建 `src/renderer/pages/Chat.tsx`（Task 5 覆盖完整实现）：

```tsx
export function ChatPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Chat</h1>
      <p className="text-slate-400">正在加载...</p>
    </div>
  )
}
```

- [✅] **步骤 4：验证构建** — `npm run build` exit 0

---

### Task 4: 主进程 IPC chat:send 流式代理转发

**说明：** API Key 仅存 SHA-256 哈希，渲染进程无法获取明文。因此 Chat 不直接 fetch 代理服务器，而是通过 IPC 让主进程代理解密并转发请求到供应商 API，流式响应通过事件回传。

**文件：**
- 修改：`src/main/ipc/index.ts` — 添加 `chat:send` / `chat:abort` handler
- 修改：`src/main/index.ts` — 导入 chat handler
- 修改：`src/preload/index.ts` — 暴露 chat.send / chat.abort / chat.onChunk

**步骤：**

- [ ] **步骤 1：ipc/index.ts 添加 chat:send handler**

在 import 区域添加：

```typescript
import { randomUUID } from 'crypto'
import { decrypt } from '../utils/crypto'
import { getProvider } from '../db/providers'
```

在 `setupIpcHandlers` 函数中添加：

```typescript
  // --- Chat handlers ---
  const chatAbortControllers = new Map<string, AbortController>()

  ipcMain.on('chat:send', async (event, data: {
    providerId: number
    model: string
    messages: { role: string; content: string }[]
    apiFormat: 'anthropic' | 'openai'
  }) => {
    const requestId = randomUUID()
    const abortController = new AbortController()
    chatAbortControllers.set(requestId, abortController)

    try {
      const provider = getProvider(data.providerId)
      if (!provider) throw new Error('Provider not found')

      const secret = process.env.LLM_GATEWAY_SECRET || 'default-dev-secret'
      const decryptedKey = decrypt(provider.apiKeyEncrypted, secret)

      const path = data.apiFormat === 'anthropic' ? '/v1/messages' : '/v1/chat/completions'
      const url = `${provider.baseUrl.replace(/\/+$/, '')}${path}`

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (data.apiFormat === 'anthropic') {
        headers['x-api-key'] = decryptedKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${decryptedKey}`
      }

      const body = data.apiFormat === 'anthropic'
        ? JSON.stringify({
            model: data.model,
            messages: data.messages,
            stream: true,
            max_tokens: 4096,
          })
        : JSON.stringify({
            model: data.model,
            messages: data.messages,
            stream: true,
          })

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errBody = await response.text().catch(() => '')
        throw new Error(`Provider returned ${response.status}: ${errBody}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Response body is not readable')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue

          let text = ''
          if (data.apiFormat === 'openai') {
            // SSE: data: {...}
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6)
              if (jsonStr === '[DONE]') continue
              try {
                const parsed = JSON.parse(jsonStr)
                text = parsed.choices?.[0]?.delta?.content || ''
              } catch { /* skip malformed JSON */ }
            }
          } else {
            // Anthropic SSE: event: content_block_delta / data: {...}
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6)
              try {
                const parsed = JSON.parse(jsonStr)
                if (parsed.type === 'content_block_delta') {
                  text = parsed.delta?.text || ''
                }
              } catch { /* skip malformed JSON */ }
            }
          }

          if (text) {
            event.sender.send('chat:chunk', { requestId, text, done: false })
          }
        }
      }

      event.sender.send('chat:chunk', { requestId, text: '', done: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('aborted')) return
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
```

- [ ] **步骤 2：preload/index.ts 暴露 chat API**

在 `proxy` 段之后、`window` 段之前添加：

```typescript
  chat: {
    send: (data: { providerId: number; model: string; messages: { role: string; content: string }[]; apiFormat: 'anthropic' | 'openai' }) => {
      ipcRenderer.send('chat:send', data)
    },
    abort: (requestId: string) => {
      ipcRenderer.send('chat:abort', requestId)
    },
    onChunk: (callback: (data: { requestId: string; text: string; done: boolean; error?: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
      ipcRenderer.on('chat:chunk', handler)
      return () => ipcRenderer.removeListener('chat:chunk', handler)
    }
  },
```

- [ ] **步骤 3：types.ts 添加 Window.electronAPI.chat 类型**

```typescript
      chat: {
        send: (data: { providerId: number; model: string; messages: { role: string; content: string }[]; apiFormat: 'anthropic' | 'openai' }) => void
        abort: (requestId: string) => void
        onChunk: (callback: (data: { requestId: string; text: string; done: boolean; error?: string }) => void) => () => void
      }
```

- [ ] **步骤 4：验证构建**

运行：`npm run build`，预期 exit 0

---

### Task 5: Chat 页面 UI 完整实现

**文件：**
- 创建：`src/renderer/components/ChatMessage.tsx`
- 创建：`src/renderer/components/ChatInput.tsx`
- 实现：`src/renderer/pages/Chat.tsx`

**步骤：**

- [ ] **步骤 1：创建 ChatMessage 组件**

创建 `src/renderer/components/ChatMessage.tsx`：

```tsx
interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  model?: string
  isStreaming?: boolean
  error?: boolean
}

export function ChatMessage({ role, content, model, isStreaming, error }: ChatMessageProps) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 ${
          isUser
            ? 'bg-indigo-500/20 text-white'
            : error
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-slate-800/50 text-slate-200 border border-slate-700/30'
        }`}
      >
        {model && !isUser && (
          <p className="text-xs text-slate-500 mb-1 font-mono">{model}</p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">
          {content}
          {isStreaming && <span className="animate-pulse">▌</span>}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **步骤 2：创建 ChatInput 组件**

创建 `src/renderer/components/ChatInput.tsx`：

```tsx
import { useState, useRef } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="flex items-end gap-2 bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... (Shift+Enter 换行)"
        rows={1}
        disabled={disabled}
        className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none resize-none max-h-[200px]"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="px-4 py-2 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {disabled ? '发送中...' : '发送'}
      </button>
    </div>
  )
}
```

- [ ] **步骤 3：实现 ChatPage (src/renderer/pages/Chat.tsx)**

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { api } from '../lib/ipc'
import type { Provider, ApiKey } from '../lib/types'
import { ChatMessage } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'

interface Message {
  role: 'user' | 'assistant'
  content: string
  model?: string
  isStreaming?: boolean
  error?: boolean
}

export function ChatPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [activeApiKeys, setActiveApiKeys] = useState<ApiKey[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const currentRequestId = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.providers.list().then(setProviders)
    api.apiKeys.list().then(setActiveApiKeys)
  }, [])

  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const availableModels = selectedProvider?.models ?? []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  const handleSend = useCallback((content: string) => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    const requestId = uuidv4()
    currentRequestId.current = requestId

    const userMessage: Message = { role: 'user', content }
    const assistantMessage: Message = { role: 'assistant', content: '', model: selectedModel, isStreaming: true }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setIsLoading(true)

    api.chat.send({
      providerId: selectedProvider.id,
      model: selectedModel,
      messages: [{ role: 'user', content }],
      apiFormat: selectedProvider.providerType,
    })
  }, [selectedModel, selectedApiKeyId, selectedProvider])

  useEffect(() => {
    const cleanup = api.chat.onChunk((data) => {
      if (data.requestId !== currentRequestId.current) return

      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role !== 'assistant') return updated

        if (data.error) {
          last.content = data.error
          last.isStreaming = false
          last.error = true
          setIsLoading(false)
          currentRequestId.current = null
        } else if (data.done) {
          last.isStreaming = false
          setIsLoading(false)
          currentRequestId.current = null
        } else {
          last.content += data.text
        }
        return updated
      })
    })

    return cleanup
  }, [])

  const handleStop = () => {
    if (currentRequestId.current) {
      api.chat.abort(currentRequestId.current)
      currentRequestId.current = null
      setIsLoading(false)
      setMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant' && last.isStreaming) {
          last.isStreaming = false
        }
        return updated
      })
    }
  }

  const providerOptions = providers.filter((p) => p.isActive === 1)
  const keyOptions = activeApiKeys.filter((k) => k.is_active === 1)

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <select
          value={selectedProviderId ?? ''}
          onChange={(e) => {
            const id = Number(e.target.value)
            setSelectedProviderId(id || null)
            setSelectedModel(null)
          }}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">选择供应商</option>
          {providerOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.providerType})</option>
          ))}
        </select>

        <select
          value={selectedModel ?? ''}
          onChange={(e) => setSelectedModel(e.target.value || null)}
          disabled={!selectedProvider}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">选择模型</option>
          {availableModels.map((m) => (
            <option key={m} value={`${selectedProvider?.name}/${m}`}>{m}</option>
          ))}
        </select>

        <select
          value={selectedApiKeyId ?? ''}
          onChange={(e) => setSelectedApiKeyId(Number(e.target.value) || null)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">选择 API Key</option>
          {keyOptions.map((k) => (
            <option key={k.id} value={k.id}>{k.name} ({k.key_prefix}...)</option>
          ))}
        </select>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto mb-4 px-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            选择模型和 API Key，输入消息开始测试
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} {...msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <ChatInput onSend={handleSend} disabled={isLoading || !selectedModel || !selectedApiKeyId} />
        </div>
        {isLoading && (
          <button
            onClick={handleStop}
            className="px-3 py-2 text-sm rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
          >
            停止
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **步骤 4：验证构建**

运行：`npm run build`，预期 exit 0

---

### 运行验证

- [ ] **步骤 1：完整构建**

运行：`npm run build`，预期 exit 0

- [ ] **步骤 2：完整测试**

运行：`npx vitest run`，预期 119+ tests passed

- [ ] **步骤 3：Lint 检查**

运行：`npm run lint`，预期 0 errors

- [ ] **步骤 4：手动验证 Chat**

启动 `npm run dev` → 点击 Chat 导航 → 选择供应商/模型/API Key → 发送消息 → 观察流式输出
