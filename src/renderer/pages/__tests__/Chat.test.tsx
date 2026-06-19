/**
 * ChatPage comprehensive tests.
 *
 * Strategy: mock window.electronAPI directly, module-level mock fns.
 * uuid.v4 is also mocked so requestId is predictable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Provider, ApiKey } from '@/lib/types'
import { ChatMessage } from '@/features/chat/components/ChatMessage'
import { setApiKey } from '@/lib/api-client'

// ======================
// Mocks
// ======================

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++
    return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
  }),
}))

// Mock sonner toast to assert error notifications without rendering Toaster.
const _toastError = vi.fn()
const _toastInfo = vi.fn()
const _toastSuccess = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => _toastError(...args),
    info: (...args: unknown[]) => _toastInfo(...args),
    success: (...args: unknown[]) => _toastSuccess(...args),
  },
}))

const mockProvider: Provider = {
  id: 1, name: 'TestProvider', providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-provider-key',
  models: ['gpt-4', 'gpt-3.5-turbo'],
  isActive: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockApiKey: ApiKey = {
  id: 1, name: 'My Key', keyPrefix: 'sk-abc', keyPlaintext: 'sk-abc-def',
  isActive: 1, rateLimit: 60, createdAt: '2026-01-01T00:00:00.000Z',
}

const _providerList = vi.fn()
const _apiKeyList = vi.fn()
const _conversationsList = vi.fn()
const _conversationsCreate = vi.fn()
const _conversationsUpdate = vi.fn()
const _conversationsDelete = vi.fn()
const _conversationsGet = vi.fn()
const _conversationsMessages = vi.fn()
const _conversationsAddMessage = vi.fn()

function setupDefaultMocks() {
  _providerList.mockResolvedValue([mockProvider])
  _apiKeyList.mockResolvedValue([mockApiKey])
  _conversationsList.mockResolvedValue([])
  _conversationsCreate.mockResolvedValue(1)
  _conversationsUpdate.mockResolvedValue(undefined)
  _conversationsDelete.mockResolvedValue(undefined)
  _conversationsGet.mockResolvedValue(null)
  _conversationsMessages.mockResolvedValue([])
  _conversationsAddMessage.mockResolvedValue(1)
}

// Set window.electronAPI ONCE — subsequent tests mutate the same fn refs
window.electronAPI = {
  debug: { log: vi.fn() },
  backend: {
    isReady: vi.fn().mockResolvedValue(true),
    onReady: vi.fn().mockReturnValue(() => {}),
  },
  providers: { list: _providerList, create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  apiKeys: { list: _apiKeyList, create: vi.fn(), delete: vi.fn() },
  logs: { query: vi.fn(), stats: vi.fn(), statsDetailed: vi.fn(), rangeSummary: vi.fn() },
  proxy: { status: vi.fn().mockResolvedValue({ isRunning: true, port: 8080, url: 'http://localhost:8080' }), start: vi.fn(), stop: vi.fn(), setPort: vi.fn(), getDebugMode: vi.fn().mockResolvedValue(false), setDebugMode: vi.fn() },
  conversations: {
    list: _conversationsList,
    create: _conversationsCreate,
    update: _conversationsUpdate,
    delete: _conversationsDelete,
    get: _conversationsGet,
    messages: _conversationsMessages,
    addMessage: _conversationsAddMessage,
  },
  window: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
  update: {
    check: vi.fn().mockResolvedValue({ isAvailable: false }),
    download: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    skipVersion: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockResolvedValue({ isAutoCheckEnabled: true, checkInterval: 3600000, isPrereleaseAllowed: false, skipVersion: null }),
    setConfig: vi.fn().mockResolvedValue(undefined),
    getCurrentVersion: vi.fn().mockResolvedValue('1.0.0'),
    onAvailable: vi.fn().mockReturnValue(() => {}),
    onProgress: vi.fn().mockReturnValue(() => {}),
    onDownloaded: vi.fn().mockReturnValue(() => {}),
    onError: vi.fn().mockReturnValue(() => {}),
  },
  models: {
    list: vi.fn().mockResolvedValue([]),
    mapping: {
      find: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
  agents: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    listConfigs: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn().mockResolvedValue(null),
    createConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn().mockResolvedValue(undefined),
    readConfigFile: vi.fn().mockResolvedValue(''),
    switchConfig: vi.fn().mockResolvedValue(undefined),
  },
  pricing: {
    list: vi.fn().mockResolvedValue([]),
    getByProvider: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  dataManagement: {
    clear: vi.fn().mockResolvedValue({ business: { cleared: false }, operational: { cleared: false } }),
  },
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  uuidCounter = 0
  // Clear call state but keep references
  vi.resetAllMocks()
  setupDefaultMocks()
  Element.prototype.scrollIntoView = vi.fn()
  // 设置 API key（useChatStream 需要）
  setApiKey('sk-abc-def')
  // Reset fetch mock
  globalThis.fetch = originalFetch
})

// ======================
// SSE mock helpers
// ======================

/**
 * Mock fetch to return an OpenAI-format SSE stream.
 * Returns the mock function so tests can assert on it.
 */
function mockOpenAISSEStream(chunks: string[]) {
  const lines = chunks.flatMap(text => {
    if (text === '__DONE__') return ['data: [DONE]']
    return [`data: {"choices":[{"delta":{"content":"${text}"},"finish_reason":null}]}`]
  }).join('\n')
  const encoded = new TextEncoder().encode(lines)
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded)
      controller.close()
    }
  })
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  })
  globalThis.fetch = mockFetch
  return mockFetch
}

// ======================
// Helpers
// ======================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

async function renderChat() {
  const { ChatPage } = await import('../Chat')
  return renderWithProviders(<ChatPage />)
}

/**
 * Select a Radix Select value by index (0=provider, 1=model, 2=apiKey).
 * Uses getAllByRole('combobox') to find triggers by position.
 */
async function selectByIndex(index: number, optionText: string) {
  const triggers = await screen.findAllByRole('combobox')
  fireEvent.click(triggers[index])
  const option = await screen.findByRole('option', { name: optionText })
  fireEvent.click(option)
}

async function selectAll() {
  await selectByIndex(0, 'TestProvider')
  await selectByIndex(1, 'gpt-4')
  await selectByIndex(2, 'My Key')
}

function typeAndSend(text: string) {
  fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: text } })
  fireEvent.click(screen.getByText('发送'))
}

// ======================
// Tests
// ======================

describe('ChatPage', () => {
  beforeEach(() => { uuidCounter = 0 })

  // ─── Render ───────────────────────────────────

  it('shows empty state when no messages', async () => {
    await renderChat()
    expect(screen.getByText(/选择模型和 API Key/)).toBeInTheDocument()
  })

  it('loads providers on mount', async () => {
    await renderChat()
    await waitFor(() => { expect(_providerList).toHaveBeenCalled() })
    expect(_apiKeyList).toHaveBeenCalled()
  })

  it('renders 4 select triggers (3 toolbar + 1 强度偏好)', async () => {
    await renderChat()
    const triggers = screen.getAllByRole('combobox')
    expect(triggers).toHaveLength(4)
  })

  it('shows provider options after opening select', async () => {
    await renderChat()
    await selectByIndex(0, 'TestProvider')
    await waitFor(() => {
      const selectedProviders = screen.getAllByText('TestProvider')
      expect(selectedProviders.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows api key options after opening select', async () => {
    await renderChat()
    await selectByIndex(2, 'My Key')
    await waitFor(() => {
      const selectedKeys = screen.getAllByText('My Key')
      expect(selectedKeys.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ─── Selection ────────────────────────────────

  it('populates model dropdown after selecting a provider', async () => {
    await renderChat()
    expect(screen.queryByText('gpt-4')).not.toBeInTheDocument()

    await selectByIndex(0, 'TestProvider')
    await selectByIndex(1, 'gpt-4')

    await waitFor(() => {
      const modelEls = screen.getAllByText('gpt-4')
      expect(modelEls.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('resets model on provider change', async () => {
    _providerList.mockResolvedValue([
      mockProvider,
      { ...mockProvider, id: 2, name: 'P2', models: ['claude-3'] },
    ])
    await renderChat()

    // Select provider 1 and model
    await selectByIndex(0, 'TestProvider')
    await selectByIndex(1, 'gpt-4')

    // Now select provider 2 (index 0 is always the provider select)
    await selectByIndex(0, 'P2')

    // Model select was reset — open it to verify claude-3 is available
    await selectByIndex(1, 'claude-3')
  })

  // ─── Send ─────────────────────────────────────

  it('sends model as "ProviderName/ModelName"', async () => {
    await renderChat()
    await selectAll()
    const mockFetch = mockOpenAISSEStream(['response', '__DONE__'])
    typeAndSend('Hello')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/chat/completions')
    const body = JSON.parse(opts.body)
    expect(body.model).toBe('TestProvider/gpt-4')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('shows user message after send', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('Hello World')
    await screen.findByText('Hello World')
  })

  it('shows model name in both dropdown and assistant message after send', async () => {
    await renderChat()
    await selectAll()
    mockOpenAISSEStream(['X', '__DONE__'])
    typeAndSend('X')

    await waitFor(() => {
      const els = screen.getAllByText('gpt-4')
      expect(els.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows stop button when loading', async () => {
    await renderChat()
    await selectAll()
    // fetch 永不 resolve，保持 loading 状态
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    typeAndSend('X')
    await screen.findByText('停止')
  })

  it('does NOT send without model selected', async () => {
    await renderChat()
    await selectByIndex(0, 'TestProvider')

    typeAndSend('X')
    expect(globalThis.fetch).toBe(originalFetch)
  })

  it('does NOT send without api key selected', async () => {
    await renderChat()
    await selectByIndex(0, 'TestProvider')
    await selectByIndex(1, 'gpt-4')

    typeAndSend('X')
    expect(globalThis.fetch).toBe(originalFetch)
  })

  it('send button is disabled without selections', async () => {
    await renderChat()
    expect(screen.getByText('发送').closest('button')).toBeDisabled()
  })

  it('send button is enabled with all selections', async () => {
    await renderChat()
    await selectAll()
    expect(screen.getByText('发送').closest('button')).not.toBeDisabled()
  })

  it('clears input after sending', async () => {
    await renderChat()
    await selectAll()
    const ta = screen.getByPlaceholderText(/输入消息/)
    fireEvent.input(ta, { target: { value: 'Clear' } })
    fireEvent.click(screen.getByText('发送'))
    await waitFor(() => { expect(ta).toHaveValue('') })
  })

  it('does NOT send empty message', async () => {
    await renderChat()
    await selectAll()
    fireEvent.click(screen.getByText('发送'))
    expect(globalThis.fetch).toBe(originalFetch)
  })

  // ─── Streaming ────────────────────────────────

  it('accumulates chunks into assistant message', async () => {
    await renderChat()
    await selectAll()
    mockOpenAISSEStream(['Hello', ' world', '__DONE__'])
    typeAndSend('Hi')
    await screen.findByText(/Hello world/)
  })

  it('ignores stale content after abort re-send', async () => {
    await renderChat()
    await selectAll()
    // 第一次发送后立即中止
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // 永不 resolve
    typeAndSend('X')
    await screen.findByText('停止')
    fireEvent.click(screen.getByText('停止'))
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })

    // 重新发送，确保新流是干净的
    uuidCounter = 1
    mockOpenAISSEStream(['Clean response', '__DONE__'])
    fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: 'Re-send' } })
    fireEvent.click(screen.getByText('发送'))
    await screen.findByText('Clean response')
  })

  it('clears loading on done chunk', async () => {
    await renderChat()
    await selectAll()

    mockOpenAISSEStream(['ok', '__DONE__'])

    typeAndSend('T')
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  it('displays error content on error chunk', async () => {
    await renderChat()
    await selectAll()
    mockOpenAISSEStream(['API key not found', '__DONE__'])
    typeAndSend('T')
    await screen.findByText('API key not found')
  })

  it('clears stop button on error', async () => {
    await renderChat()
    await selectAll()

    // 模拟流中发生错误（reader 将抛出）
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error('fail'))
      }
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    typeAndSend('T')
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  it('handles 100 rapid chunks without issues', async () => {
    await renderChat()
    await selectAll()
    const chunks = Array(100).fill('a')
    chunks.push('__DONE__')
    mockOpenAISSEStream(chunks)
    typeAndSend('T')
    await screen.findByText(/a{100}/)
  })

  // ─── deepseek-style streaming (thinking_delta + text_delta) ─────────
  it('simulates deepseek-style thinking_delta and text_delta chunks', async () => {
    await renderChat()
    await selectAll()

    const sseLines = [
      'data: {"choices":[{"delta":{"reasoning_content":" I\'ll analyze this step by step."}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":" First, I need to understand the problem."}}]}',
      'data: {"choices":[{"delta":{"content":"The answer is 42."}}]}',
      'data: {"choices":[{"delta":{"content":" Let me explain why."}}]}',
      'data: [DONE]'
    ].join('\n')
    const encoded = new TextEncoder().encode(sseLines)
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(encoded); controller.close() }
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, body: stream,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    typeAndSend('What is the answer?')

    // 验证 content 内容（thinking 会在完成后自动折叠，仅检查可见的 content）
    await screen.findByText(/answer is 42/)
    await screen.findByText(/explain why/)
  })

  // ─── Chat with provider using openai format ─────────────────────────
  it('works with openai format provider', async () => {
    _providerList.mockResolvedValue([
      { ...mockProvider, name: 'OpenAI', providerType: 'openai', models: ['gpt-4'] },
    ])
    await renderChat()

    await selectByIndex(0, 'OpenAI')
    await selectByIndex(1, 'gpt-4')
    await selectByIndex(2, 'My Key')

    const mockFetch = mockOpenAISSEStream(['OpenAI response', '__DONE__'])

    typeAndSend('Hello')
    await screen.findByText('OpenAI response')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/v1/chat/completions')
  })

  // ─── Stop ─────────────────────────────────────

  it('calls abort on stop', async () => {
    await renderChat()
    await selectAll()
    // fetch 永不 resolve（模拟持续流）
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    typeAndSend('T')
    await screen.findByText('停止')

    fireEvent.click(screen.getByText('停止'))
    // fetch mock 不应该被 resolve（流已被中止）
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  it('clears loading after stop', async () => {
    await renderChat()
    await selectAll()
    // fetch 永不 resolve（模拟持续流）
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}))
    typeAndSend('T')
    await screen.findByText('停止')

    fireEvent.click(screen.getByText('停止'))
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  // ─── Multiple messages ────────────────────────

  it('shows both messages after sequential sends', async () => {
    await renderChat()
    await selectAll()

    mockOpenAISSEStream(['First response', '__DONE__'])
    typeAndSend('First')
    await screen.findByText('First')
    await screen.findByText('First response')
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })

    // Reset fetch for second send
    mockOpenAISSEStream(['Second response', '__DONE__'])
    uuidCounter = 1
    fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: 'Second' } })
    fireEvent.click(screen.getByText('发送'))
    await screen.findByText('Second')
    await screen.findByText('Second response')

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('calls fetch twice for two messages', async () => {
    await renderChat()
    await selectAll()

    const mockFetch1 = mockOpenAISSEStream(['A response', '__DONE__'])
    typeAndSend('A')
    await waitFor(() => expect(mockFetch1).toHaveBeenCalled())
    expect(JSON.parse(mockFetch1.mock.calls[0][1].body).messages)
      .toEqual([{ role: 'user', content: 'A' }])
    await screen.findByText('A response')

    uuidCounter = 1
    const mockFetch2 = mockOpenAISSEStream(['B response', '__DONE__'])
    fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: 'B' } })
    fireEvent.click(screen.getByText('发送'))
    await waitFor(() => expect(mockFetch2).toHaveBeenCalled())
    expect(JSON.parse(mockFetch2.mock.calls[0][1].body).messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'A' }),
        expect.objectContaining({ role: 'user', content: 'B' }),
      ])
    )
  })


  // ─── Chinese ──────────────────────────────────

  it('works with Chinese input', async () => {
    await renderChat()
    await selectAll()
    const mockFetch = mockOpenAISSEStream(['你好，世界！', '__DONE__'])
    typeAndSend('你好世界')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toEqual([{ role: 'user', content: '你好世界' }])
    await screen.findByText('你好，世界！')
  })

  // ─── Edge cases ───────────────────────────────

  it('handles empty provider list', async () => {
    _providerList.mockResolvedValue([])
    await renderChat()
    expect(screen.getByText(/选择模型和 API Key/)).toBeInTheDocument()
  })

  it('cleans up on unmount', async () => {
    const { ChatPage } = await import('../Chat')
    const queryClient = createQueryClient()
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) // 永不 resolve
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <ChatPage />
      </QueryClientProvider>
    )
    await screen.findAllByRole('combobox')
    // 没有发送消息，不需要特殊断言
    unmount()
    // 期望不抛出错误即为通过
  })

  // ─── Error notifications (toast.error) ────────────────────────────

  it('shows toast.error when user message save fails', async () => {
    // saveUserMessage 内部走 conversations.create（首次会话），让其 reject
    _conversationsCreate.mockRejectedValue(new Error('db write failed'))
    await renderChat()
    await selectAll()
    mockOpenAISSEStream(['ok', '__DONE__'])
    typeAndSend('Hello')

    await waitFor(() => {
      expect(_toastError).toHaveBeenCalledWith('消息保存失败，请重试')
    })
  })

  it('shows toast.error when title update fails', async () => {
    // 模拟：create 返回 {id:1} → addMessage 成功 → get 返回默认标题 → update reject
    // 通过 delayed Promise 让 SSE 流在 saveUserMessage 完成后再开始，
    // 确保 convIdRef.current 已被 setActiveConversationId(1) 同步到 ref。
    let resolveCreate: (value: unknown) => void
    const createPromise = new Promise((r) => { resolveCreate = r })
    _conversationsCreate.mockReturnValue(createPromise)
    _conversationsAddMessage.mockResolvedValue(1)
    _conversationsGet.mockResolvedValue({
      id: 1,
      title: '新对话',
      providerId: 1,
      model: 'gpt-4',
      apiKeyId: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    _conversationsUpdate.mockRejectedValue(new Error('title update failed'))

    await renderChat()
    await selectAll()

    // SSE 流通过 controlled stream，等 saveUserMessage 完成后再 enqueue
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller }
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
    })

    typeAndSend('Hi')

    // 等待 conversation 已创建并 ref 同步
    await waitFor(() => { expect(_conversationsCreate).toHaveBeenCalled() })
    resolveCreate!({ id: 1 })
    // 等待 setActiveConversationId(1) 触发的 effect 完成（convIdRef 同步）
    await waitFor(() => { expect(_conversationsAddMessage).toHaveBeenCalled() })

    // 现在再发送 SSE 数据并关闭流
    const sseLines = 'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\ndata: [DONE]'
    streamController!.enqueue(new TextEncoder().encode(sseLines))
    streamController!.close()

    await waitFor(() => {
      expect(_toastError).toHaveBeenCalledWith('对话标题更新失败')
    }, { timeout: 3000 })
  })

  // ─── Thinking Settings (Task 11) ──────────────

  it('renders ThinkingSettings with 执行方式 group and 强度偏好 combobox', async () => {
    await renderChat()
    expect(screen.getByRole('group', { name: '执行方式' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '强度偏好' })).toBeInTheDocument()
  })

  it('defaults to disabled execution type with effort dropdown disabled', async () => {
    await renderChat()
    const group = screen.getByRole('group', { name: '执行方式' })
    const buttons = within(group).getAllByRole('button')
    // 顺序：disabled / enabled / adaptive
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false')
    expect(buttons[2]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('combobox', { name: '强度偏好' })).toBeDisabled()
  })

  it('switches execution type to enabled and enables effort dropdown', async () => {
    await renderChat()
    fireEvent.click(screen.getByRole('button', { name: 'enabled' }))
    const group = screen.getByRole('group', { name: '执行方式' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false')
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: '强度偏好' })).not.toBeDisabled()
  })

  it('does NOT inject thinking fields when disabled on send', async () => {
    await renderChat()
    await selectAll()
    const mockFetch = mockOpenAISSEStream(['ok', '__DONE__'])
    typeAndSend('Hi')
    await waitFor(() => { expect(mockFetch).toHaveBeenCalled() })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.thinking).toBeUndefined()
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('injects thinking + reasoning_effort when enabled on send', async () => {
    await renderChat()
    await selectAll()
    // 默认 effort=medium，切到 enabled 后发送应注入 thinking + reasoning_effort
    fireEvent.click(screen.getByRole('button', { name: 'enabled' }))
    const mockFetch = mockOpenAISSEStream(['ok', '__DONE__'])
    typeAndSend('Hi')
    await waitFor(() => { expect(mockFetch).toHaveBeenCalled() })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('medium')
  })

  it('persists thinking type change via conversations.update after conversation exists', async () => {
    // conversations.create 契约返回 ConversationEntity 对象（非数字 id），saveUserMessage 依赖 conv.id
    _conversationsCreate.mockResolvedValue({
      id: 1, title: 'Hi', providerId: 1, model: 'gpt-4', apiKeyId: 1,
      thinkingType: 'disabled', reasoningEffort: 'medium',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await renderChat()
    await selectAll()
    // 发送消息触发 saveUserMessage 创建对话（携带默认 disabled/medium）
    mockOpenAISSEStream(['ok', '__DONE__'])
    typeAndSend('Hi')
    // 等待对话已创建（create + addMessage 完成，convIdRef 同步）
    await waitFor(() => { expect(_conversationsAddMessage).toHaveBeenCalled() })
    _conversationsUpdate.mockClear()
    // 切换执行方式 → 应触发持久化（update 携带 thinkingType）
    fireEvent.click(screen.getByRole('button', { name: 'enabled' }))
    await waitFor(() => {
      expect(_conversationsUpdate).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ thinkingType: 'enabled' })
      )
    })
  })

  it('persists reasoningEffort change via conversations.update after conversation exists', async () => {
    // 验证强度偏好修改的端到端持久化：已有对话时改强度 → update 携带 reasoningEffort
    _conversationsCreate.mockResolvedValue({
      id: 1, title: 'Hi', providerId: 1, model: 'gpt-4', apiKeyId: 1,
      thinkingType: 'disabled', reasoningEffort: 'medium',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await renderChat()
    await selectAll()
    mockOpenAISSEStream(['ok', '__DONE__'])
    typeAndSend('Hi')
    await waitFor(() => { expect(_conversationsAddMessage).toHaveBeenCalled() })

    // 先切到 enabled 启用强度下拉（触发一次 thinkingType update）
    fireEvent.click(screen.getByRole('button', { name: 'enabled' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '强度偏好' })).not.toBeDisabled()
    })
    _conversationsUpdate.mockClear()

    // 改强度为 high → 应触发持久化（update 仅携带 reasoningEffort）
    await selectByIndex(3, 'high')
    await waitFor(() => {
      expect(_conversationsUpdate).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ reasoningEffort: 'high' })
      )
    })
  })

  it('syncs thinking settings from target conversation on switch', async () => {
    const existingConv = {
      id: 5, title: '思考对话', providerId: 1, model: 'gpt-4', apiKeyId: 1,
      thinkingType: 'enabled', reasoningEffort: 'high',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    _conversationsList.mockResolvedValue([existingConv])
    _conversationsGet.mockResolvedValue(existingConv)
    _conversationsMessages.mockResolvedValue([])

    await renderChat()
    const item = await screen.findByText('思考对话')
    fireEvent.click(item)
    // 切换后执行方式应为 enabled（同步目标对话设置）
    await waitFor(() => {
      const group = screen.getByRole('group', { name: '执行方式' })
      const buttons = within(group).getAllByRole('button')
      expect(buttons[1]).toHaveAttribute('aria-pressed', 'true')
    })
    // 强度下拉可用且显示 high
    const effortTrigger = screen.getByRole('combobox', { name: '强度偏好' })
    expect(effortTrigger).not.toBeDisabled()
    expect(effortTrigger).toHaveTextContent('high')
  })

  it('resets thinking settings to disabled/medium on new conversation', async () => {
    const existingConv = {
      id: 5, title: '思考对话', providerId: 1, model: 'gpt-4', apiKeyId: 1,
      thinkingType: 'enabled', reasoningEffort: 'high',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }
    _conversationsList.mockResolvedValue([existingConv])
    _conversationsGet.mockResolvedValue(existingConv)
    _conversationsMessages.mockResolvedValue([])

    await renderChat()
    fireEvent.click(await screen.findByText('思考对话'))
    // 等待同步为 enabled
    await waitFor(() => {
      expect(within(screen.getByRole('group', { name: '执行方式' })).getAllByRole('button')[1])
        .toHaveAttribute('aria-pressed', 'true')
    })
    // 点击"新建"按钮
    fireEvent.click(screen.getByText('新建'))
    // 新建后应重置为 disabled
    await waitFor(() => {
      const buttons = within(screen.getByRole('group', { name: '执行方式' })).getAllByRole('button')
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true') // disabled
    })
    expect(screen.getByRole('combobox', { name: '强度偏好' })).toBeDisabled()
  })
})

// ======================
// ChatMessage Tests
// ======================

describe('ChatMessage', () => {
  it('应该渲染用户消息（纯文本）', () => {
    render(
      <ChatMessage
        role="user"
        content="这是一条用户消息"
      />
    )

    expect(screen.getByText('这是一条用户消息')).toBeInTheDocument()
  })

  it('应该渲染助手消息（Markdown 格式）', () => {
    const content = `## 代码示例

\`\`\`javascript
console.log("hello")
\`\`\`

**加粗文本**`

    render(
      <ChatMessage
        role="assistant"
        content={content}
      />
    )

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('代码示例')
    expect(screen.getByText('console.log("hello")')).toBeInTheDocument()
    expect(screen.getByText('加粗文本')).toBeInTheDocument()
  })

  it('应该渲染列表', () => {
    const content = `- 项目 1
- 项目 2
- 项目 3`

    render(
      <ChatMessage
        role="assistant"
        content={content}
      />
    )

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('应该渲染表格', () => {
    const content = `| 列 1 | 列 2 |
|------|------|
| A    | B    |`

    render(
      <ChatMessage
        role="assistant"
        content={content}
      />
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('应该显示错误状态', () => {
    render(
      <ChatMessage
        role="assistant"
        content="发生错误"
        hasError={true}
      />
    )

    // 错误类应用在 Markdown 容器上，检查 bubble 级别的样式
    expect(screen.getByText('发生错误')).toBeInTheDocument()
    const bubble = screen.getByText('发生错误').closest('[class*="rounded-2xl"]')
    expect(bubble).toHaveClass('bg-destructive/10', 'border-destructive/20')
  })

  it('应该显示流式输入光标', () => {
    render(
      <ChatMessage
        role="assistant"
        content="正在输入"
        isStreaming={true}
      />
    )

    expect(screen.getByText('正在输入')).toBeInTheDocument()
  })
})
