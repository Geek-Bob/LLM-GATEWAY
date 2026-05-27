/**
 * ChatPage comprehensive tests.
 *
 * Strategy: mock window.electronAPI directly, module-level mock fns.
 * uuid.v4 is also mocked so requestId is predictable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Provider, ApiKey } from '../../lib/types'

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

const mockProvider: Provider = {
  id: 1, name: 'TestProvider', providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-provider-key',
  models: ['gpt-4', 'gpt-3.5-turbo'],
  isActive: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockApiKey: ApiKey = {
  id: 1, name: 'My Key', key_prefix: 'sk-abc', key_plaintext: 'sk-abc-def',
  is_active: 1, rate_limit: 60, created_at: '2026-01-01T00:00:00.000Z',
}

type ChunkCB = (data: { requestId: string; text: string; done: boolean; error?: string }) => void
let chunkCallback: ChunkCB | null = null

const _providerList = vi.fn()
const _apiKeyList = vi.fn()
const _chatSend = vi.fn()
const _chatAbort = vi.fn()
const _onChunk = vi.fn()
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
  _onChunk.mockImplementation((cb: ChunkCB) => {
    chunkCallback = cb
    return () => { chunkCallback = null }
  })
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
  providers: { list: _providerList, create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  apiKeys: { list: _apiKeyList, create: vi.fn(), delete: vi.fn() },
  logs: { query: vi.fn(), stats: vi.fn(), statsDetailed: vi.fn() },
  proxy: { status: vi.fn().mockResolvedValue({ running: true, port: 8080, url: 'http://localhost:8080' }), start: vi.fn(), stop: vi.fn(), restart: vi.fn(), setPort: vi.fn(), getDebugMode: vi.fn().mockResolvedValue(false), setDebugMode: vi.fn() },
  chat: { send: _chatSend, abort: _chatAbort, onChunk: _onChunk },
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
}

function simulateChunk(data: { requestId: string; text?: string; done?: boolean; error?: string }) {
  chunkCallback?.({
    requestId: data.requestId,
    text: data.text ?? '',
    done: data.done ?? false,
    error: data.error,
  })
}

beforeEach(() => {
  uuidCounter = 0
  // Clear call state but keep references
  vi.resetAllMocks()
  setupDefaultMocks()
  chunkCallback = null
  Element.prototype.scrollIntoView = vi.fn()
})

// ======================
// Helpers
// ======================

async function renderChat() {
  const { ChatPage } = await import('../Chat')
  return render(<ChatPage />)
}

function getSelects() {
  return screen.getAllByRole('combobox') as HTMLSelectElement[]
}

async function selectAll() {
  await screen.findByText('TestProvider')
  const s = getSelects()
  fireEvent.change(s[0], { target: { value: '1' } })
  await screen.findByText('gpt-4')
  fireEvent.change(s[1], { target: { value: 'gpt-4' } })
  fireEvent.change(s[2], { target: { value: '1' } })
}

function typeAndSend(text: string) {
  fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: text } })
  fireEvent.click(screen.getByText('发送'))
}

// The mocked uuid.v4 returns "00000000-0000-4000-8000-000000000001" on 1st call
const FIRST_UUID = '00000000-0000-4000-8000-000000000001'
const SECOND_UUID = '00000000-0000-4000-8000-000000000002'

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

  it('renders 3 comboboxes', async () => {
    await renderChat()
    expect(getSelects()).toHaveLength(3)
  })

  it('shows provider options after loading', async () => {
    await renderChat()
    await screen.findByText('TestProvider')
  })

  it('shows api key options after loading', async () => {
    await renderChat()
    await screen.findByText('My Key')
  })

  // ─── Selection ────────────────────────────────

  it('populates model dropdown after selecting a provider', async () => {
    await renderChat()
    await screen.findByText('TestProvider')
    expect(screen.queryByText('gpt-4')).not.toBeInTheDocument()

    fireEvent.change(getSelects()[0], { target: { value: '1' } })
    await screen.findByText('gpt-4')
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument()
  })

  it('resets model on provider change', async () => {
    _providerList.mockResolvedValue([
      mockProvider,
      { ...mockProvider, id: 2, name: 'P2', models: ['claude-3'] },
    ])
    await renderChat()
    await screen.findByText('P2')

    const s = getSelects()
    fireEvent.change(s[0], { target: { value: '1' } })
    await screen.findByText('gpt-4')
    fireEvent.change(s[1], { target: { value: 'gpt-4' } })

    fireEvent.change(s[0], { target: { value: '2' } })
    await screen.findByText('claude-3')
    expect(s[1].value).toBe('')
  })

  // ─── Send ─────────────────────────────────────

  it('sends model as "ProviderName/ModelName"', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('Hello')

    await waitFor(() => {
      expect(_chatSend).toHaveBeenCalledWith({
        requestId: expect.any(String),
        apiKeyId: 1,
        model: 'TestProvider/gpt-4',
        apiFormat: 'openai',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    })
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
    typeAndSend('X')

    await waitFor(() => {
      const els = screen.getAllByText('gpt-4')
      expect(els.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows stop button when loading', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('X')
    await screen.findByText('停止')
  })

  it('does NOT send without model selected', async () => {
    await renderChat()
    await screen.findByText('TestProvider')
    const s = getSelects()
    fireEvent.change(s[0], { target: { value: '1' } })

    typeAndSend('X')
    expect(_chatSend).not.toHaveBeenCalled()
  })

  it('does NOT send without api key selected', async () => {
    await renderChat()
    await screen.findByText('TestProvider')
    const s = getSelects()
    fireEvent.change(s[0], { target: { value: '1' } })
    await screen.findByText('gpt-4')
    fireEvent.change(s[1], { target: { value: 'gpt-4' } })

    typeAndSend('X')
    expect(_chatSend).not.toHaveBeenCalled()
  })

  it('send button is disabled without selections', async () => {
    await renderChat()
    await screen.findByText('TestProvider')
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
    expect(_chatSend).not.toHaveBeenCalled()
  })

  // ─── Streaming ────────────────────────────────

  it('accumulates chunks into assistant message', async () => {
    await renderChat()
    await selectAll()

    _chatSend.mockImplementation(() => {
      setTimeout(() => simulateChunk({ requestId: FIRST_UUID, text: 'Hello' }), 5)
      setTimeout(() => simulateChunk({ requestId: FIRST_UUID, text: ' world' }), 10)
      setTimeout(() => simulateChunk({ requestId: FIRST_UUID, text: '', done: true }), 15)
    })

    typeAndSend('Hi')
    await screen.findByText(/Hello world/)
  })

  it('ignores chunks from an outdated requestId', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('X')

    simulateChunk({ requestId: 'stale', text: 'IGNORE', done: true })
    expect(screen.queryByText('IGNORE')).not.toBeInTheDocument()
  })

  it('clears loading on done chunk', async () => {
    await renderChat()
    await selectAll()

    _chatSend.mockImplementation(() => {
      setTimeout(() => simulateChunk({ requestId: FIRST_UUID, text: 'ok' }), 5)
      setTimeout(() => simulateChunk({ requestId: FIRST_UUID, text: '', done: true }), 10)
    })

    typeAndSend('T')
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  it('displays error content on error chunk', async () => {
    await renderChat()
    await selectAll()

    _chatSend.mockImplementation(() => {
      setTimeout(() => simulateChunk({
        requestId: FIRST_UUID, text: '', done: true, error: 'API key not found'
      }), 5)
    })

    typeAndSend('T')
    await screen.findByText('API key not found')
  })

  it('clears stop button on error', async () => {
    await renderChat()
    await selectAll()

    _chatSend.mockImplementation(() => {
      setTimeout(() => simulateChunk({
        requestId: FIRST_UUID, text: '', done: true, error: 'fail'
      }), 5)
    })

    typeAndSend('T')
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  it('handles 100 rapid chunks without issues', async () => {
    await renderChat()
    await selectAll()

    _chatSend.mockImplementation(() => {
      for (let i = 0; i < 100; i++) simulateChunk({ requestId: FIRST_UUID, text: 'a' })
      simulateChunk({ requestId: FIRST_UUID, text: '', done: true })
    })

    typeAndSend('T')
    await screen.findByText(/a{100}/)
  })

  // ─── deepseek-style streaming (thinking_delta + text_delta) ─────────
  it('simulates deepseek-style thinking_delta and text_delta chunks', async () => {
    await renderChat()
    await selectAll()

    // Simulate what the main process IPC handler does with deepseek SSE:
    // it extracts text from both thinking_delta and text_delta events
    const deepseekChunks = [
      ' I\'ll analyze this step by step.',
      ' First, I need to understand the problem.',
      'The answer is 42.',
      ' Let me explain why.'
    ]

    _chatSend.mockImplementation(() => {
      // Send all thinking/text chunks
      for (const chunk of deepseekChunks) {
        simulateChunk({ requestId: FIRST_UUID, text: chunk })
      }
      simulateChunk({ requestId: FIRST_UUID, text: '', done: true })
    })

    typeAndSend('What is the answer?')

    // Wait for all chunks to accumulate
    await screen.findByText((content) => {
      return content.includes('step by step') &&
             content.includes('understand the problem') &&
             content.includes('answer is 42') &&
             content.includes('explain why')
    })
  })

  // ─── Chat with provider using openai format ─────────────────────────
  it('works with openai format provider', async () => {
    _providerList.mockResolvedValue([
      { ...mockProvider, name: 'OpenAI', providerType: 'openai', models: ['gpt-4'] },
    ])
    await renderChat()
    await screen.findByText('OpenAI')

    const s = getSelects()
    fireEvent.change(s[0], { target: { value: '1' } })
    await screen.findByText('gpt-4')
    fireEvent.change(s[1], { target: { value: 'gpt-4' } })
    fireEvent.change(s[2], { target: { value: '1' } })

    _chatSend.mockImplementation(() => {
      simulateChunk({ requestId: FIRST_UUID, text: 'OpenAI response' })
      simulateChunk({ requestId: FIRST_UUID, text: '', done: true })
    })

    typeAndSend('Hello')
    await screen.findByText('OpenAI response')

    await waitFor(() => {
      expect(_chatSend).toHaveBeenCalledWith(expect.objectContaining({
        apiFormat: 'openai',
      }))
    })
  })

  // ─── Stop ─────────────────────────────────────

  it('calls chat.abort on stop', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('T')
    await screen.findByText('停止')

    fireEvent.click(screen.getByText('停止'))
    expect(_chatAbort).toHaveBeenCalledOnce()
    expect(_chatAbort).toHaveBeenCalledWith(FIRST_UUID)
  })

  it('clears loading after stop', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('T')
    await screen.findByText('停止')

    fireEvent.click(screen.getByText('停止'))
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })
  })

  // ─── Multiple messages ────────────────────────

  it('shows both messages after sequential sends', async () => {
    await renderChat()
    await selectAll()

    // Send 1st message, then complete it
    typeAndSend('First')
    await waitFor(() => expect(_chatSend).toHaveBeenCalled())
    await screen.findByText('First')
    simulateChunk({ requestId: FIRST_UUID, text: '', done: true })
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })

    // Send 2nd message
    uuidCounter = 1
    fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: 'Second' } })
    fireEvent.click(screen.getByText('发送'))
    await screen.findByText('Second')

    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('calls chat.send twice for two messages', async () => {
    await renderChat()
    await selectAll()

    // Complete first send
    typeAndSend('A')
    await waitFor(() => expect(_chatSend).toHaveBeenCalled())
    simulateChunk({ requestId: FIRST_UUID, text: '', done: true })
    await waitFor(() => { expect(screen.queryByText('停止')).not.toBeInTheDocument() })

    expect(_chatSend).toHaveBeenCalledTimes(1)
    expect(_chatSend).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'A' }],
    }))

    // Reset uuid counter so second send uses a known UUID
    uuidCounter = 1
    fireEvent.input(screen.getByPlaceholderText(/输入消息/), { target: { value: 'B' } })
    fireEvent.click(screen.getByText('发送'))

    await waitFor(() => expect(_chatSend).toHaveBeenCalledTimes(2))
    expect(_chatSend).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'B' }],
    }))
  })

  // ─── Provider type routing ────────────────────

  it('uses apiFormat: anthropic for anthropic provider', async () => {
    _providerList.mockResolvedValue([
      { ...mockProvider, name: 'AnthropicTest', providerType: 'anthropic', models: ['claude-3'] },
    ])
    await renderChat()
    await screen.findByText('AnthropicTest')

    const s = getSelects()
    fireEvent.change(s[0], { target: { value: '1' } })
    await screen.findByText('claude-3')
    fireEvent.change(s[1], { target: { value: 'claude-3' } })
    fireEvent.change(s[2], { target: { value: '1' } })

    typeAndSend('Hi')
    await waitFor(() => {
      expect(_chatSend).toHaveBeenCalledWith(expect.objectContaining({
        model: 'AnthropicTest/claude-3',
        apiFormat: 'anthropic',
      }))
    })
  })

  // ─── Chinese ──────────────────────────────────

  it('works with Chinese input', async () => {
    await renderChat()
    await selectAll()
    typeAndSend('你好世界')

    await waitFor(() => {
      expect(_chatSend).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'user', content: '你好世界' }],
      }))
    })
    await screen.findByText('你好世界')
  })

  // ─── Edge cases ───────────────────────────────

  it('handles empty provider list', async () => {
    _providerList.mockResolvedValue([])
    await renderChat()
    expect(screen.getByText(/选择模型和 API Key/)).toBeInTheDocument()
  })

  it('cleans up chunk listener on unmount', async () => {
    const { ChatPage } = await import('../Chat')
    const { unmount } = render(<ChatPage />)
    await screen.findByText('TestProvider')

    expect(chunkCallback).not.toBeNull()
    unmount()
    expect(chunkCallback).toBeNull()
  })
})
