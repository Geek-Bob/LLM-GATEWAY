# Chat 功能结构优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 6 个正确性/性能问题 + 按 feature pattern 拆分 ChatPage（提取 ChatToolbar 组件 + useConversationManager hook）

**Architecture:** 自底向上构建 — 先建 ChatToolbar 纯 UI 组件和 useConversationManager hook，再重写 Chat.tsx 编排层。每个 Task 独立可测试。

**Tech Stack:** TypeScript, React 19, Vitest + jsdom, TanStack Query 5

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| **新建** | `src/renderer/features/chat/components/ChatToolbar.tsx` | 纯 UI — 三个 Select（Provider/Model/API Key） |
| **新建** | `src/renderer/features/chat/hooks/useConversationManager.ts` | 会话 CRUD 逻辑封装 — 切换/新建/删除/列表 |
| **修改** | `src/renderer/pages/Chat.tsx` | 重写为编排层（359→~160 行） |
| **修改** | `src/renderer/components/ConversationSidebar.tsx` | 类型统一 — 用 lib/types 的 Conversation |
| **修改** | `src/renderer/lib/types.ts` | 注释修复 — ConversationMessage thinking 字段 |
| **修改** | `src/renderer/pages/__tests__/Chat.test.tsx` | 适配拆分 — 增加消息保存 fire-and-forget 测试 |

---

### Task 1: 创建 ChatToolbar 纯 UI 组件

**Files:**
- Create: `src/renderer/features/chat/components/ChatToolbar.tsx`

- [ ] **Step 1: 创建 ChatToolbar 组件文件**

ChatToolbar 接受所有数据通过 props，不自己 fetch、不持有状态。从 Chat.tsx L256-307 的 JSX 提取。

```typescript
/**
 * ChatToolbar — 对话工具栏（Provider / Model / API Key 选择器）
 *
 * 纯 UI 组件，所有数据和回调通过 props 传入，不自己做数据请求。
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import type { Provider, ApiKey } from '@/lib/types'

interface ChatToolbarProps {
  providers: Provider[]
  selectedProviderId: number | null
  onSelectProvider: (id: number | null) => void
  availableModels: string[]
  selectedModel: string | null
  onSelectModel: (model: string | null) => void
  apiKeys: ApiKey[]
  selectedApiKeyId: number | null
  onSelectApiKey: (id: number | null) => void
}

export function ChatToolbar({
  providers,
  selectedProviderId,
  onSelectProvider,
  availableModels,
  selectedModel,
  onSelectModel,
  apiKeys,
  selectedApiKeyId,
  onSelectApiKey,
}: ChatToolbarProps) {
  return (
    <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
      <Select
        value={selectedProviderId?.toString() ?? ''}
        onValueChange={(val) => {
          if (!val) { onSelectProvider(null); return }
          onSelectProvider(Number(val))
        }}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择供应商" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedModel ?? ''}
        onValueChange={(val) => onSelectModel(val || null)}
        disabled={availableModels.length === 0}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedApiKeyId?.toString() ?? ''}
        onValueChange={(val) => {
          if (!val) { onSelectApiKey(null); return }
          onSelectApiKey(Number(val))
        }}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择 API Key" />
        </SelectTrigger>
        <SelectContent>
          {apiKeys.map((k) => (
            <SelectItem key={k.id} value={k.id.toString()}>{k.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  )
}
```

- [ ] **Step 2: 运行 TSC 确认 ChatToolbar 无类型错误**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 零类型错误（新文件未被任何地方 import，不影响全局）

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/chat/components/ChatToolbar.tsx
git commit -m "feat: 提取 ChatToolbar 纯 UI 组件"
```

---

### Task 2: 创建 useConversationManager hook

**Files:**
- Create: `src/renderer/features/chat/hooks/useConversationManager.ts`

- [ ] **Step 1: 创建 useConversationManager**

封装会话的列表获取 + 切换/新建/删除 + 自动标题。迁移 Chat.tsx L191-233 的逻辑。

```typescript
/**
 * useConversationManager — 会话 CRUD 逻辑封装
 *
 * 封装所有与 conversation 相关的业务操作：
 * - 列表查询（TanStack Query）
 * - 切换会话（加载消息 + 恢复 provider/model/key 选择）
 * - 新建会话（清空状态）
 * - 删除会话（确认 + IPC delete）
 */

import { useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { api } from '@/lib/ipc'
import { useConversations } from '@/lib/queries/conversations'
import type { Conversation } from '@/lib/types'

const DEFAULT_TITLE = '新对话'

/** 从 DB 加载的消息格式（用于 handleSelectConversation 的消息映射） */
interface DbMessage {
  id: number
  role: string
  content: string
  thinking?: string
}

/** Hook 返回的数据结构 */
export interface ConversationManagerState {
  conversations: Conversation[]
  activeConversationId: number | null
  setActiveConversationId: (id: number | null) => void

  /** 选择会话 — 加载历史消息并恢复 provider/model/key 选择 */
  selectConversation: (id: number) => Promise<{
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; thinking?: string; isThinking: boolean; isStreaming: boolean }>
    providerId: number | null
    model: string
    apiKeyId: number | null
  }>

  /** 新建会话 — 中止当前流，清空所有状态 */
  newConversation: (abort: () => void) => void

  /** 删除会话 — confirm 弹窗 + IPC delete + 清空状态 */
  deleteConversation: (id: number) => Promise<void>

  /** 刷新会话列表缓存 */
  invalidate: () => void

  /** 保存用户消息到会话（fire-and-forget） */
  saveUserMessage: (content: string, providerId: number, model: string, apiKeyId: number) => Promise<number>
}

export function useConversationManager(): ConversationManagerState {
  const { data: conversations = [] } = useConversations()
  const queryClient = useQueryClient()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conversations'] })

  // 这里用模块级变量 state 追踪 activeConversationId（调用方通过 useState 管理）
  // 但 hook 本身不 hold activeConversationId，由调用方传入
  // 实际上这里需要调用方配合 — 见下方说明

  // ⚠️ 此 hook 的设计要点：
  // activeConversationId 由 ChatPage 的 useState 持有，hook 的 select/new/delete 函数
  // 需要能读写它。解决方案：函数接受 getter/setter 作为额外参数。

  throw new Error('useConversationManager needs activeConversationId from caller — see Task 3 integration')
}
```

Wait — 这个设计有问题。让我重新考虑。`activeConversationId` 必须在 ChatPage 的 useState 中（因为 React 渲染依赖它），hook 的函数需要能读写它。

更好的设计：hook 不持有 activeConversationId，而是让 ChatPage 的 handler 函数调用 hook 提供的无状态工具函数，传入/传出 activeConversationId。

实际上最简单的方式是：hook 的函数签名中不包 activeConversationId 的读写，而是让调用方通过参数传入当前值，通过返回值或回调更新。

让我简化设计——最实用的方式：

```typescript
export function useConversationManager(
  activeConversationId: number | null,
  setActiveConversationId: (id: number | null) => void
) {
```

这样 ChatPage 传入它的 state，hook 内部可以读/写。这是 React hook 的经典模式。

Let me rewrite the plan properly.

Actually, for this particular case, I think the cleanest approach is different. The spec says ChatPage should go from 359 to ~160 lines. Let me think about what exactly goes into the hook vs stays in ChatPage:

Stays in ChatPage (needs direct state access):
- selectedProviderId, selectedModel, selectedApiKeyId — state
- activeConversationId — state
- messages — state
- handleStreamUpdate — uses setMessages directly
- handleSend — orchestrates save + send
- JSX layout

Goes into hook:
- selectConversation logic (loads messages, restores provider/model/key)
- newConversation logic (abort + clear)
- deleteConversation logic (confirm + delete)
- saveUserMessage logic (create conv if needed, add message)

The hook needs to read/write activeConversationId and setMessages. Simplest: pass them in.

OK let me write the actual plan now.<｜end▁of▁thinking｜>Let me refine the hook design before writing the full plan.

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="Write">
<｜｜DSML｜｜parameter name="content" string="true"># Chat 功能结构优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 6 个正确性/性能问题 + 按 feature pattern 拆分 ChatPage（提取 ChatToolbar 组件 + useConversationManager hook，359→~160 行）

**Architecture:** 自底向上 — 先建 ChatToolbar（纯 UI）和 useConversationManager（会话 CRUD），再重写 Chat.tsx 编排层。hook 不持有 activeConversationId，由 ChatPage 通过参数传入。

**Tech Stack:** TypeScript, React 19, Vitest + jsdom, TanStack Query 5

---

### Task 1: 创建 ChatToolbar 纯 UI 组件

**Files:**
- Create: `src/renderer/features/chat/components/ChatToolbar.tsx`

- [ ] **Step 1: 写入 ChatToolbar 组件**

从 Chat.tsx L256-307 提取工具栏 JSX，所有数据通过 props 传入。

```typescript
/**
 * ChatToolbar — Provider / Model / API Key 选择器
 *
 * 纯 UI 组件：所有数据和回调通过 props 传入，不自己做数据请求。
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import type { Provider, ApiKey } from '@/lib/types'

interface ChatToolbarProps {
  providers: Provider[]
  selectedProviderId: number | null
  onSelectProvider: (id: number | null) => void
  availableModels: string[]
  selectedModel: string | null
  onSelectModel: (model: string | null) => void
  apiKeys: ApiKey[]
  selectedApiKeyId: number | null
  onSelectApiKey: (id: number | null) => void
}

export function ChatToolbar({
  providers,
  selectedProviderId,
  onSelectProvider,
  availableModels,
  selectedModel,
  onSelectModel,
  apiKeys,
  selectedApiKeyId,
  onSelectApiKey,
}: ChatToolbarProps) {
  return (
    <Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">
      <Select
        value={selectedProviderId?.toString() ?? ''}
        onValueChange={(val) => {
          if (!val) { onSelectProvider(null); return }
          onSelectProvider(Number(val))
        }}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择供应商" />
        </SelectTrigger>
        <SelectContent>
          {providers.map((p) => (
            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedModel ?? ''}
        onValueChange={(val) => onSelectModel(val || null)}
        disabled={availableModels.length === 0}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((m) => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedApiKeyId?.toString() ?? ''}
        onValueChange={(val) => {
          if (!val) { onSelectApiKey(null); return }
          onSelectApiKey(Number(val))
        }}
      >
        <SelectTrigger className="flex-1 min-w-[140px]">
          <SelectValue placeholder="选择 API Key" />
        </SelectTrigger>
        <SelectContent>
          {apiKeys.map((k) => (
            <SelectItem key={k.id} value={k.id.toString()}>{k.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  )
}
```

- [ ] **Step 2: 验证 TSC 无错误**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/chat/components/ChatToolbar.tsx
git commit -m "feat: 提取 ChatToolbar 纯 UI 组件"
```

---

### Task 2: 创建 useConversationManager hook

**Files:**
- Create: `src/renderer/features/chat/hooks/useConversationManager.ts`

- [ ] **Step 1: 写入 hook**

Hook 接受 activeConversationId 的 getter/setter 作为参数，封装会话 CRUD。

```typescript
/**
 * useConversationManager — 会话 CRUD 逻辑封装
 *
 * 封装所有会话操作：切换/新建/删除 + 用户消息保存
 * activeConversationId 由 ChatPage 的 useState 持有，hook 通过参数读写。
 */

import { useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { api } from '@/lib/ipc'
import { useConversations } from '@/lib/queries/conversations'
import type { Conversation } from '@/lib/types'

export const DEFAULT_CONVERSATION_TITLE = '新对话'

export interface UseConversationManagerParams {
  /** 当前活跃会话 ID（由调用方 useState 持有） */
  activeConversationId: number | null
  /** 更新活跃会话 ID */
  setActiveConversationId: (id: number | null) => void
}

export function useConversationManager({ activeConversationId, setActiveConversationId }: UseConversationManagerParams) {
  const { data: conversations = [] } = useConversations()
  const queryClient = useQueryClient()

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conversations'] })

  /**
   * 切换会话 — 加载历史消息，恢复 provider/model/apiKey 选择。
   * 返回构造好的消息数组和会话关联的 providerId/model/apiKeyId，
   * 调用方用返回值更新自己的 state。
   */
  async function selectConversation(id: number): Promise<{
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; thinking?: string; isThinking: boolean; isStreaming: boolean }>
    providerId: number | null
    model: string | null
    apiKeyId: number | null
  }> {
    setActiveConversationId(id)

    const [msgs, conv] = await Promise.all([
      api.conversations.messages(id),
      api.conversations.get(id),
    ])

    const messages = msgs.map((m: { role: string; content: string; thinking?: string }) => ({
      id: uuidv4(),
      role: m.role as 'user' | 'assistant',
      content: m.content,
      thinking: m.thinking || undefined,
      isThinking: false,
      isStreaming: false,
    }))

    return {
      messages,
      providerId: conv?.provider_id ?? null,
      model: conv?.model ?? null,
      apiKeyId: conv?.api_key_id ?? null,
    }
  }

  /** 新建会话 — 调用方应在调用前先 abort() 和清空 messages */
  function newConversation() {
    setActiveConversationId(null)
    return { providerId: null, model: null, apiKeyId: null }
  }

  /** 删除会话 — confirm 弹窗 + IPC delete。返回 true 表示已删除 */
  async function deleteConversation(id: number, title?: string): Promise<boolean> {
    if (!confirm(`确定删除"${title || '此会话'}"？`)) return false
    await api.conversations.delete(id)
    if (activeConversationId === id) {
      setActiveConversationId(null)
    }
    invalidate()
    return true
  }

  /**
   * 保存用户消息（fire-and-forget 风格）
   * 如果还没有活跃会话，自动创建；更新 providerId/model/apiKeyId 仅在变化时执行
   */
  async function saveUserMessage(
    content: string,
    providerId: number,
    model: string,
    apiKeyId: number
  ): Promise<number | null> {
    let convId = activeConversationId

    if (!convId) {
      const conv = await api.conversations.create({
        title: content.slice(0, 30) || DEFAULT_CONVERSATION_TITLE,
        model,
        providerId,
        apiKeyId,
      })
      convId = conv.id
      setActiveConversationId(convId)
      invalidate()
    } else {
      // 仅当关联信息变化时才更新
      const existing = await api.conversations.get(convId)
      if (existing) {
        const needsUpdate =
          existing.provider_id !== providerId ||
          existing.model !== model ||
          existing.api_key_id !== apiKeyId
        if (needsUpdate) {
          await api.conversations.update(convId, { model, providerId, apiKeyId })
        }
      }
    }

    await api.conversations.addMessage(convId, 'user', content)
    return convId
  }

  return {
    conversations,
    selectConversation,
    newConversation,
    deleteConversation,
    saveUserMessage,
    invalidate,
  }
}
```

- [ ] **Step 2: 验证 TSC 无错误**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 错误

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/chat/hooks/useConversationManager.ts
git commit -m "feat: 提取 useConversationManager hook 封装会话 CRUD"
```

---

### Task 3: 重写 Chat.tsx 编排层 + 全部 6 个修复

**Files:**
- Modify: `src/renderer/pages/Chat.tsx`（完整重写）

这是核心改动 — 用 ChatToolbar + useConversationManager 重写 ChatPage，同时修复所有 6 个问题。

- [ ] **Step 1: 先运行现有测试确认基线**

```bash
npx vitest run src/renderer/pages/__tests__/Chat.test.tsx 2>&1 | tail -15
```
Expected: 全部 38 个测试通过

- [ ] **Step 2: 重写 Chat.tsx**

完整的新 Chat.tsx 如下（359→~190 行）：

```typescript
/**
 * Chat 页面 — 多 LLM 供应商对话界面
 *
 * 数据流:
 * 1. useProviders / useApiKeys 通过 IPC 获取供应商和密钥列表
 * 2. 选择供应商/模型/API Key 后，输入消息触发 useChatStream（HTTP SSE）
 * 3. 流式响应逐块更新 messages 状态，完成后异步保存到数据库
 * 4. useConversationManager 封装所有会话 CRUD
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Square } from 'lucide-react'

import { api } from '../lib/ipc'
import { setApiKey } from '../shared/lib/api-client'
import { useChatStream } from '../features/chat/hooks/useChatStream'
import {
  useConversationManager,
  DEFAULT_CONVERSATION_TITLE,
} from '../features/chat/hooks/useConversationManager'
import type { StreamMessage } from '../features/chat/hooks/useChatStream'

import { useProviders } from '../lib/queries/providers'
import { useApiKeys } from '../lib/queries/apiKeys'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { ChatMessage } from '../components/ChatMessage'
import { ChatInput } from '../components/ChatInput'
import { ChatToolbar } from '../features/chat/components/ChatToolbar'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'

/** 单条消息的数据结构 */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  thinking?: string       /** 模型的思考过程（如 extended thinking） */
  isThinking?: boolean    /** 模型正在思考中 */
  model?: string          /** 使用的模型名称 */
  isStreaming?: boolean   /** 是否正在接收流式响应 */
  error?: boolean         /** 本次请求是否出错 */
}

export function ChatPage() {
  // ─── 数据层 ───
  const { data: providers = [] } = useProviders()
  const { data: activeApiKeys = [] } = useApiKeys()

  // ─── 选择状态 ───
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<number | null>(null)

  // ─── 会话 + 消息状态 ───
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const convIdRef = useRef(activeConversationId)  // 修复 #3: 闭包陷阱
  useEffect(() => { convIdRef.current = activeConversationId }, [activeConversationId])

  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [inputKey, setInputKey] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    conversations,
    selectConversation,
    newConversation,
    deleteConversation,
    saveUserMessage,
    invalidate: invalidateConversations,
  } = useConversationManager({ activeConversationId, setActiveConversationId })

  // ─── 派生数据 ───
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const availableModels = selectedProvider?.models ?? []
  const providerOptions = providers.filter((p) => p.isActive === 1)
  const keyOptions = activeApiKeys.filter((k) => k.is_active === 1)

  // ─── 滚动 ───
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  useEffect(() => { scrollToBottom() }, [messages])

  // ─── API Key 管理 (修复 #1: 直接用内存数据, 不用 IPC) ───
  const ensureApiKey = useCallback(() => {
    const match = activeApiKeys.find((k) => k.id === selectedApiKeyId)
    if (match?.key_plaintext) setApiKey(match.key_plaintext)
  }, [activeApiKeys, selectedApiKeyId])

  // ─── SSE 流回调 ───
  const handleStreamUpdate = useCallback((msg: StreamMessage) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role !== 'assistant') {
        return [...prev, {
          id: msg.id,
          role: 'assistant' as const,
          content: msg.content,
          thinking: msg.thinking,
          isThinking: msg.isThinking,
          model: selectedModel || undefined,
          isStreaming: msg.isStreaming,
          error: msg.error,
        }]
      }
      return prev.with(-1, {
        ...last,
        content: msg.content,
        thinking: msg.thinking,
        isThinking: msg.isThinking,
        isStreaming: msg.isStreaming,
        error: msg.error,
      })
    })

    // 修复 #3: 用 ref 读 activeConversationId 避免闭包陷阱
    if (!msg.isStreaming && !msg.error && convIdRef.current && msg.content) {
      api.conversations.addMessage(convIdRef.current, 'assistant', msg.content, msg.thinking || '')
        .then(() => api.conversations.get(convIdRef.current!))
        .then((conv) => {
          if (conv && conv.title === DEFAULT_CONVERSATION_TITLE) {
            api.conversations.update(convIdRef.current!, { title: msg.content.slice(0, 30) || DEFAULT_CONVERSATION_TITLE })
          }
          invalidateConversations()
        })
        .catch(() => {})
    }
  }, [selectedModel, invalidateConversations])

  const { send, abort, isLoading: streamLoading } = useChatStream(handleStreamUpdate)

  // ─── 发送消息 (修复 #2 + #4: fire-and-forget 保存, 不阻塞 HTTP) ───
  const handleSend = useCallback(async (content: string) => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    ensureApiKey()

    const userMessage: Message = { id: uuidv4(), role: 'user', content }
    setMessages((prev) => [...prev, userMessage])

    // 修复 #4: fire-and-forget 保存用户消息, 不阻塞 HTTP
    saveUserMessage(content, selectedProviderId, selectedModel, selectedApiKeyId)
      .catch(() => {})

    const modelFull = `${selectedProvider.name}/${selectedModel}`
    send(modelFull, [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ])
  }, [selectedModel, selectedApiKeyId, selectedProvider, selectedProviderId, ensureApiKey, saveUserMessage, send, messages])

  // ─── 其他操作 ───
  const handleStop = useCallback(() => { abort() }, [abort])

  const handleRegenerate = useCallback(async () => {
    if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

    const last = messages[messages.length - 1]
    if (last?.role !== 'assistant') return

    ensureApiKey()

    const apiMessages = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    send(`${selectedProvider.name}/${selectedModel}`, apiMessages)
    setMessages((prev) => prev.slice(0, -1))
  }, [selectedModel, selectedApiKeyId, selectedProvider, messages, ensureApiKey, send])

  // 修复 #5: 先加载消息再一次性设值, 消除空白闪烁
  const handleSelectConversation = useCallback(async (id: number) => {
    const result = await selectConversation(id)
    setMessages(result.messages)                // 一次性替换, 不先清空
    setSelectedProviderId(result.providerId)
    setSelectedModel(result.model)
    setSelectedApiKeyId(result.apiKeyId)
  }, [selectConversation])

  // 修复 #9: 使用 DEFAULT_CONVERSATION_TITLE 常量
  const handleNewConversation = useCallback(() => {
    abort()
    setMessages([])
    newConversation()
    setSelectedProviderId(null)
    setSelectedModel(null)
    setSelectedApiKeyId(null)
    setInputKey(k => k + 1)
  }, [abort, newConversation])

  const handleDeleteConversation = useCallback(async (id: number) => {
    const conv = conversations.find(c => c.id === id)
    const deleted = await deleteConversation(id, conv?.title)
    if (deleted) {
      setMessages([])
      setInputKey(k => k + 1)
    }
  }, [conversations, deleteConversation])

  // ─── JSX ───
  return (
    <motion.div
      className="flex h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0 pl-3">
        <ChatToolbar
          providers={providerOptions}
          selectedProviderId={selectedProviderId}
          onSelectProvider={(id) => { setSelectedProviderId(id); if (id === null) setSelectedModel(null) }}
          availableModels={availableModels}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          apiKeys={keyOptions}
          selectedApiKeyId={selectedApiKeyId}
          onSelectApiKey={setSelectedApiKeyId}
        />

        {/* Messages */}
        <div className="flex-1 overflow-auto mb-4 px-1">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                key="empty"
                className="flex flex-col items-center justify-center h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Card className="p-8 text-center max-w-sm">
                  <CardContent className="flex flex-col items-center pt-6">
                    <MessageSquare className="w-10 h-10 mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">选择模型和 API Key</p>
                    <p className="text-xs mt-1 text-muted-foreground/60">输入消息开始测试模型可用性</p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              messages.map((msg) => {
                const isLastAssistant = msg.id === messages[messages.length - 1]?.id && msg.role === 'assistant' && !msg.isStreaming
                return (
                  <ChatMessage key={msg.id} {...msg} onRegenerate={isLastAssistant ? handleRegenerate : undefined} />
                )
              })
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <Card className="p-3 flex items-center gap-2 bg-background/50">
          <div className="flex-1">
            <ChatInput key={inputKey} onSend={handleSend} disabled={streamLoading || !selectedModel || !selectedApiKeyId} />
          </div>
          {streamLoading && (
            <Button onClick={handleStop} variant="destructive" size="default" className="px-3 py-2.5">
              <Square className="w-4 h-4" />
              停止
            </Button>
          )}
        </Card>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 错误

- [ ] **Step 4: 运行 Chat 测试套件**

```bash
npx vitest run src/renderer/pages/__tests__/Chat.test.tsx 2>&1 | tail -20
```
Expected: 全部测试通过。如果因 `saveUserMessage` 改为 fire-and-forget 导致异步时序变化，可能需要调整部分测试的 `waitFor` — 逐个排查修复。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/Chat.tsx
git commit -m "refactor: ChatPage 重写为编排层 — 提取 ChatToolbar + useConversationManager，修复 6 个问题"
```

---

### Task 4: 统一 ConversationSidebar 类型 + 修复 types.ts 注释

**Files:**
- Modify: `src/renderer/components/ConversationSidebar.tsx:20-25`
- Modify: `src/renderer/lib/types.ts:72`

- [ ] **Step 1: ConversationSidebar 统一类型**

当前 L20-25 重复定义了 Conversation 接口：
```typescript
interface Conversation {
  id: number
  title: string
  model: string
  updated_at: string
}
```

改为从 `lib/types` 导入并使用 `Pick`：
```typescript
import type { Conversation } from '@/lib/types'

// ... props 中用 Pick<Conversation, 'id' | 'title' | 'model' | 'updated_at'>
```

完整改动：删除 L20-25 的本地 `interface Conversation`，在文件顶部添加 import：
```typescript
import type { Conversation } from '@/lib/types'
```

然后 `conversations` 参数类型改为 `Conversation[]`（已经是兼容的，`Conversation` 包含 id/title/model/updated_at）。

- [ ] **Step 2: 修复 types.ts 注释**

当前 L72:
```typescript
/** 单条对话消息（包括用户消息和 AI 回复，thinking 字段记录 Anthropic 扩展思维过程） */
```
改为:
```typescript
/** 单条对话消息（包括用户消息和 AI 回复，thinking 字段记录扩展思维过程） */
```

- [ ] **Step 3: 运行 TSC 确认无错误**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 错误

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ConversationSidebar.tsx src/renderer/lib/types.ts
git commit -m "refactor: 统一 ConversationSidebar 类型，修复 types.ts 注释残留"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 运行全量测试**

```bash
npx vitest run 2>&1 | tail -20
```
Expected: 所有测试通过（ ~362 tests）

- [ ] **Step 2: 运行 ESLint**

```bash
npx eslint src/renderer/features/chat/ src/renderer/pages/Chat.tsx src/renderer/pages/__tests__/Chat.test.tsx src/renderer/components/ChatMessage.tsx src/renderer/components/ConversationSidebar.tsx 2>&1 | tail -10
```
Expected: 0 errors, 仅预存 warnings

- [ ] **Step 3: 运行 TypeScript 编译**

```bash
npx tsc --noEmit 2>&1 | head -10
```
Expected: 0 错误

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore: Chat 结构优化全量验证通过"
```
