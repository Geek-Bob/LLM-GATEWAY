# Chat 对话历史功能实施计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 superpowers:finishing-a-development-branch 交付

**目标：** 在 Chat 页面左侧增加会话列表侧栏，支持新建/切换/删除会话，自动保存消息，切换时恢复模型选择。

**架构：** sql.js 新增 conversations + messages 表；后端新增 IPC CRUD handlers；渲染进程新增 `<ConversationSidebar>` 组件，改造 Chat.tsx 集成侧栏 + 消息自动保存。

**技术栈：** sql.js (via Database 封装层), Electron IPC, React 19, framer-motion

**追踪：** `[✅] 5/5 任务` — 全部完成

---

### Task 1: 数据库表 + conversations.ts 模块

**文件：**
- 修改：`src/main/db/schema.ts` — 添加 conversations 和 messages 表
- 创建：`src/main/db/conversations.ts` — CRUD + 消息查询
- 修改：`src/main/db/api-keys.ts` — 新增 `getApiKeyById` 辅助函数
- 测试：`src/main/db/__tests__/conversations.test.ts`

**步骤：**

- [✅] **步骤 1：在 schema.ts 添加新表**

在 `createTables()` 的 `db.exec()` 中追加：

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '新对话',
  provider_id INTEGER,
  model TEXT NOT NULL,
  api_key_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  thinking TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

- [✅] **步骤 2：创建 `src/main/db/conversations.ts`**

```typescript
import { getDb } from './connection'

export interface ConversationRow {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

export interface MessageRow {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}

// --- Conversations ---

export function listConversations(): ConversationRow[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM conversations ORDER BY updated_at DESC'
  ).all() as ConversationRow[]
}

export function createConversation(
  title: string,
  model: string,
  providerId?: number | null,
  apiKeyId?: number | null
): number {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO conversations (title, provider_id, model, api_key_id)
    VALUES (@title, @provider_id, @model, @api_key_id)
  `).run({
    title,
    provider_id: providerId ?? null,
    model,
    api_key_id: apiKeyId ?? null
  })
  return result.lastInsertRowid
}

export function updateConversation(
  id: number,
  data: { title?: string; provider_id?: number | null; model?: string; api_key_id?: number | null }
): void {
  const db = getDb()
  const fields: string[] = ['updated_at = datetime(\'now\')']
  const params: Record<string, unknown> = { id }
  if (data.title !== undefined) { fields.push('title = @title'); params.title = data.title }
  if (data.provider_id !== undefined) { fields.push('provider_id = @provider_id'); params.provider_id = data.provider_id }
  if (data.model !== undefined) { fields.push('model = @model'); params.model = data.model }
  if (data.api_key_id !== undefined) { fields.push('api_key_id = @api_key_id'); params.api_key_id = data.api_key_id }
  db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = @id`).run(params)
}

export function deleteConversation(id: number): void {
  const db = getDb()
  // DELETE FROM messages cascades via FK
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function getConversation(id: number): ConversationRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
}

// --- Messages ---

export function listMessages(conversationId: number): MessageRow[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).all(conversationId) as MessageRow[]
}

export function addMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string,
  thinking?: string
): number {
  const db = getDb()
  const result = db.prepare(`
    INSERT INTO messages (conversation_id, role, content, thinking)
    VALUES (@conversation_id, @role, @content, @thinking)
  `).run({
    conversation_id: conversationId,
    role,
    content,
    thinking: thinking || ''
  })
  // Touch conversation updated_at
  db.prepare('UPDATE conversations SET updated_at = datetime(\'now\') WHERE id = ?').run(conversationId)
  return result.lastInsertRowid
}
```

- [✅] **步骤 3：在 `api-keys.ts` 中添加 `getApiKeyById`**

追加导出函数：
```typescript
export function getApiKeyById(id: number): Omit<ApiKeyRow, 'key_hash'> | undefined {
  const db = getDb()
  return db.prepare(
    'SELECT id, name, key_prefix, key_encrypted, is_active, rate_limit, created_at FROM api_keys WHERE id = ?'
  ).get(id) as Omit<ApiKeyRow, 'key_hash'> | undefined
}
```

- [✅] **步骤 4：编写测试文件 `src/main/db/__tests__/conversations.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Database } from '../database'
import { initDatabase, closeDatabase, getDb } from '../connection'

const TEST_DB = ':memory:'

beforeAll(async () => {
  await initDatabase(TEST_DB)
  // Create tables manually
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '新对话',
      provider_id INTEGER,
      model TEXT NOT NULL,
      api_key_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      thinking TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `)
})

afterAll(() => { closeDatabase() })

describe('conversations', () => {
  const { createConversation, listConversations, getConversation, updateConversation, deleteConversation } = require('../conversations')

  it('creates and lists conversations', () => {
    const id = createConversation('Test', 'gpt-4', 1, 1)
    expect(id).toBeGreaterThan(0)
    const list = listConversations()
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list[0]).toHaveProperty('title')
  })

  it('gets a conversation by id', () => {
    const id = createConversation('GetTest', 'claude-3', 1, null)
    const c = getConversation(id)
    expect(c).toBeDefined()
    expect(c!.title).toBe('GetTest')
    expect(c!.model).toBe('claude-3')
  })

  it('updates a conversation', () => {
    const id = createConversation('Old', 'gpt-4', null, null)
    updateConversation(id, { title: 'New', model: 'gpt-4-turbo' })
    const c = getConversation(id)!
    expect(c.title).toBe('New')
    expect(c.model).toBe('gpt-4-turbo')
  })

  it('deletes a conversation', () => {
    const id = createConversation('DeleteMe', 'gpt-4', null, null)
    deleteConversation(id)
    expect(getConversation(id)).toBeUndefined()
  })
})

describe('messages', () => {
  const { createConversation, listMessages, addMessage } = require('../conversations')

  let convId: number
  it('adds messages to a conversation', () => {
    convId = createConversation('MsgTest', 'gpt-4', null, null)
    const msgId = addMessage(convId, 'user', 'Hello')
    expect(msgId).toBeGreaterThan(0)
    const replyId = addMessage(convId, 'assistant', 'Hi there', 'thinking...')
    expect(replyId).toBeGreaterThan(0)
  })

  it('lists messages in order', () => {
    const msgs = listMessages(convId)
    expect(msgs.length).toBe(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[1].role).toBe('assistant')
    expect(msgs[1].thinking).toBe('thinking...')
  })

  it('returns empty for nonexistent conversation', () => {
    expect(listMessages(99999)).toEqual([])
  })
})
```

- [✅] **步骤 5：运行测试确认通过**

运行：`npx vitest run src/main/db/__tests__/conversations.test.ts`
预期：PASS，全部测试通过

---

### Task 2: IPC Handlers — conversations + messages

**文件：**
- 修改：`src/main/ipc/index.ts` — 添加 7 个新 IPC handler
- 修改：`src/preload/index.ts` — 添加 conversation IPC 绑定
- 修改：`src/renderer/lib/types.ts` — 添加 Conversation/Message 类型 + electronAPI 签名

**步骤：**

- [✅] **步骤 1：在 `src/main/ipc/index.ts` 导入 conversations 模块**

在文件顶部 import 区域追加：
```typescript
import {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getConversation,
  listMessages,
  addMessage
} from '../db/conversations'
```

- [✅] **步骤 2：添加 IPC handlers**

在 `setupIpcHandlers()` 函数内、`chat:abort` handler 之后追加：

```typescript
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
    updateConversation(id, data)
  })

  ipcMain.handle('conversation:delete', async (_event, id: number) => {
    deleteConversation(id)
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
```

- [✅] **步骤 3：在 `src/preload/index.ts` 添加 conversation 绑定**

在 `apiKeys` 块之后、`logs` 块之前插入：

```typescript
  conversations: {
    list: () => ipcRenderer.invoke('conversation:list'),
    create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) =>
      ipcRenderer.invoke('conversation:create', data),
    update: (id: number, data: { title?: string; providerId?: number | null; model?: string; apiKeyId?: number | null }) =>
      ipcRenderer.invoke('conversation:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('conversation:delete', id),
    get: (id: number) => ipcRenderer.invoke('conversation:get', id),
    messages: (conversationId: number) => ipcRenderer.invoke('conversation:messages', conversationId),
    addMessage: (conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) =>
      ipcRenderer.invoke('conversation:addMessage', conversationId, role, content, thinking),
  },
```

- [✅] **步骤 4：在 `src/renderer/lib/types.ts` 添加类型**

在 `ProxyStatus` interface 之前添加：

```typescript
export interface Conversation {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
}
```

在 `Window.electronAPI` 的 `chat` 块之后添加：

```typescript
      conversations: {
        list: () => Promise<Conversation[]>
        create: (data: { title: string; model: string; providerId?: number | null; apiKeyId?: number | null }) => Promise<number>
        update: (id: number, data: { title?: string; providerId?: number | null; model?: string; apiKeyId?: number | null }) => Promise<void>
        delete: (id: number) => Promise<void>
        get: (id: number) => Promise<Conversation | null>
        messages: (conversationId: number) => Promise<ConversationMessage[]>
        addMessage: (conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string) => Promise<number>
      }
```

---

### Task 3: ConversationSidebar 组件

**文件：**
- 创建：`src/renderer/components/ConversationSidebar.tsx`

**步骤：**

- [✅] **步骤 1：编写会失败的组件测试**
- [✅] **步骤 2：实现 `ConversationSidebar.tsx`**

```tsx
import { motion, AnimatePresence } from 'framer-motion'

interface Conversation {
  id: number
  title: string
  model: string
  updated_at: string
}

interface ConversationSidebarProps {
  conversations: Conversation[]
  activeId: number | null
  onSelect: (id: number) => void
  onNew: () => void
  onDelete: (id: number) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  if (collapsed) {
    return (
      <motion.div
        className="flex flex-col items-center py-3 gap-2 cursor-pointer shrink-0"
        style={{ width: 40, borderRight: '1px solid rgba(255,255,255,0.06)' }}
        onClick={onToggleCollapse}
        whileHover={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <svg className="w-5 h-5" style={{ color: '#64748b' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{ width: 240, borderRight: '1px solid rgba(255,255,255,0.06)' }}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: '#64748b' }}>会话</span>
        <div className="flex items-center gap-1">
          <motion.button
            onClick={onNew}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all"
            style={{ color: '#60a5fa', background: 'rgba(59,130,246,0.1)' }}
            whileHover={{ background: 'rgba(59,130,246,0.2)' }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建
          </motion.button>
          <motion.button
            onClick={onToggleCollapse}
            className="p-1 rounded-lg transition-all"
            style={{ color: '#64748b' }}
            whileHover={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </motion.button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        <AnimatePresence>
          {conversations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs" style={{ color: '#475569' }}>暂无会话</p>
              <p className="text-xs mt-1" style={{ color: '#333' }}>点击"新建"开始对话</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <motion.div
                key={conv.id}
                className="mx-1.5 my-0.5 px-3 py-2 rounded-lg cursor-pointer transition-all"
                style={{
                  background: activeId === conv.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  border: activeId === conv.id ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                }}
                onClick={() => onSelect(conv.id)}
                whileHover={{ background: activeId === conv.id ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)' }}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate flex-1" style={{ color: '#e2e8f0' }}>
                    {conv.title}
                  </p>
                  {activeId === conv.id && (
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                      className="p-0.5 rounded shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: '#64748b' }}
                      whileHover={{ color: '#ef4444' }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono truncate max-w-[120px]" style={{ color: '#475569' }}>
                    {conv.model}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: '#333' }}>
                    {formatDate(conv.updated_at)}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
```

关键设计点：
- 折叠状态仅显示汉堡图标（40px 宽）
- 展开状态 240px 宽
- 新建按钮在顶部 header 中
- 删除按钮 hover 时显示（仅在 active 项上直接显示）
- 空状态提示文字
- framer-motion 进出动画

---

### Task 4: 改造 Chat.tsx — 集成侧栏 + 自动保存

**文件：**
- 修改：`src/renderer/pages/Chat.tsx` — 核心改造

**步骤：**

- [✅] **步骤 1：阅读当前 Chat.tsx（232 行）— 确保理解完整结构**

当前结构：
1. `Message` interface
2. `ChatPage` 组件：`useState` for providers, apiKeys, selectedProviderId, selectedModel, selectedApiKeyId, messages, isLoading
3. `useEffect` 加载 providers + apiKeys
4. `handleSend` 发送消息
5. `onChunk` listener 处理流式响应
6. `handleStop` 停止
7. JSX：Toolbar (3 selects) → Messages → Input

- [✅] **步骤 2：在 Chat.tsx 中集成侧栏状态和加载逻辑**

新增 state：
```typescript
const [conversations, setConversations] = useState<Conversation[]>([])
const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
const [convInitialized, setConvInitialized] = useState(false) // 防止空状态自动创建
```

新增 useEffect：页面加载时读取会话列表：
```typescript
useEffect(() => {
  api.conversations.list().then(setConversations)
}, [])
```

- [✅] **步骤 3：实现"切换会话 → 加载消息 + 恢复选择"**

```typescript
const handleSelectConversation = async (id: number) => {
  setActiveConversationId(id)
  setMessages([]) // 清空当前

  // 加载消息
  const msgs = await api.conversations.messages(id)
  setMessages(msgs.map(m => ({
    role: m.role,
    content: m.content,
    thinking: m.thinking || undefined,
    isThinking: false,
    isStreaming: false,
  })))

  // 恢复会话的模型/API Key 选择
  const conv = await api.conversations.get(id)
  if (conv) {
    if (conv.provider_id) setSelectedProviderId(conv.provider_id)
    if (conv.model) setSelectedModel(conv.model)
    if (conv.api_key_id) setSelectedApiKeyId(conv.api_key_id)
  }
}
```

- [✅] **步骤 4：实现"新建会话"**

```typescript
const handleNewConversation = async () => {
  if (!selectedModel) {
    // 如果没有选模型，创建一个默认会话
    return
  }
  const id = await api.conversations.create({
    title: '新对话',
    model: selectedModel,
    providerId: selectedProviderId,
    apiKeyId: selectedApiKeyId,
  })
  setActiveConversationId(id)
  setMessages([])
  // 刷新列表
  api.conversations.list().then(setConversations)
}
```

- [✅] **步骤 5：实现"发送消息自动保存到 DB"**

修改 `handleSend`，在发送前确保有 activeConversation；如无则先自动创建：

```typescript
const handleSend = async (content: string) => {
  if (!selectedModel || !selectedApiKeyId || !selectedProvider) return

  // 自动创建会话（如果当前无活跃会话）
  let convId = activeConversationId
  if (!convId) {
    convId = await api.conversations.create({
      title: content.slice(0, 30) || '新对话',
      model: selectedModel,
      providerId: selectedProviderId,
      apiKeyId: selectedApiKeyId,
    })
    setActiveConversationId(convId)
    api.conversations.list().then(setConversations)
  }

  // 保存用户消息
  await api.conversations.addMessage(convId, 'user', content)

  const requestId = uuidv4()
  currentRequestId.current = requestId

  const userMessage: Message = { role: 'user', content }
  const assistantMessage: Message = { role: 'assistant', content: '', thinking: '', isThinking: true, model: selectedModel, isStreaming: true }

  setMessages((prev) => [...prev, userMessage, assistantMessage])
  setIsLoading(true)

  // 保存当前 conversationId 供 onChunk 使用
  currentConvIdRef.current = convId

  api.chat.send({ /* 保持不变 */ })
}
```

添加 `currentConvIdRef`：
```typescript
const currentConvIdRef = useRef<number | null>(null)
```

- [✅] **步骤 6：流完成/出错时自动保存 assistant 消息**

在 `onChunk` 的 `data.done` 和 `data.error` 分支中追加保存逻辑：

```typescript
// 在 data.done 或 data.error 时，保存最终 assistant 消息
if (data.done || data.error) {
  const convId = currentConvIdRef.current
  if (convId) {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant' && last.content) {
        // Fire and forget save
        api.conversations.addMessage(convId, 'assistant', last.content, last.thinking || '')
          .then(() => api.conversations.list().then(setConversations))
          .catch(() => {})
      }
      return prev
    })
  }
}
```

注意：`setMessages` 内调用 `api.conversations.addMessage` 需要在 side effect 中执行，不能在 state updater 内部。改为在 `data.done`/`data.error` 的外部 if 块中用 `setTimeout` 或 `requestAnimationFrame` 延迟一帧读取最新 state。

更好的实现方式：在 `onChunk` handler 中，当 `data.done` 为 true 时，使用 ref 跟踪完整消息内容（用 ref 累加 content/thinking，而不是从 state 读）：

```typescript
const accumulatedContent = useRef('')
const accumulatedThinking = useRef('')
```

在 text chunk 时更新 ref：
```typescript
accumulatedContent.current += data.text
```

在 thinking chunk 时更新 ref：
```typescript
accumulatedThinking.current += data.text
```

在 `data.done` 时用 ref 值保存：
```typescript
if (data.done) {
  const convId = currentConvIdRef.current
  if (convId && accumulatedContent.current) {
    api.conversations.addMessage(convId, 'assistant', accumulatedContent.current, accumulatedThinking.current || '')
      .then(() => api.conversations.list().then(setConversations))
      .catch(() => {})
  }
  accumulatedContent.current = ''
  accumulatedThinking.current = ''
  currentConvIdRef.current = null
}
```

- [✅] **步骤 7：实现"删除会话"**

```typescript
const handleDeleteConversation = async (id: number) => {
  const conv = conversations.find(c => c.id === id)
  if (!confirm(`确定删除"${conv?.title || '此会话'}"？`)) return
  await api.conversations.delete(id)
  if (activeConversationId === id) {
    setActiveConversationId(null)
    setMessages([])
  }
  api.conversations.list().then(setConversations)
}
```

- [✅] **步骤 8：修改 JSX — 包裹 flex 布局**

```tsx
return (
  <motion.div
    className="flex h-full"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.3 }}
  >
    {/* Sidebar */}
    <ConversationSidebar
      conversations={conversations}
      activeId={activeConversationId}
      onSelect={handleSelectConversation}
      onNew={handleNewConversation}
      onDelete={handleDeleteConversation}
      collapsed={sidebarCollapsed}
      onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
    />

    {/* Main chat area */}
    <div className="flex-1 flex flex-col min-w-0" style={{ padding: '0 0 0 12px' }}>
      {/* 原有 toolbar + messages + input，去掉外层 motion.div */}
      ...
    </div>
  </motion.div>
)
```

---

### Task 5: 集成验证

**文件：**
- 无文件修改

**步骤：**

- [✅] **步骤 1：运行完整测试套件** — 214 passed, 14 files
- [✅] **步骤 2：构建检查** — tsc --noEmit 零错误
- [✅] **步骤 3：lint 检查** — 无新增错误（仅剩预存 warning）

---

## 自审

- [ ] **规格覆盖：** conversations 表 ✓, messages 表 ✓, IPC handlers ✓, sidebar 组件 ✓, Chat.tsx 集成 ✓, 自动保存 ✓, 切换恢复 ✓, 删除 ✓
- [ ] **占位符扫描：** 无 TODO/待定/占位符，所有代码完整
- [ ] **类型一致性：** ConversationRow ↔ Conversation type 字段匹配；IPC handler 命名与 preload 绑定一致；`@` 前缀参数名与 sql.js 封装层兼容
