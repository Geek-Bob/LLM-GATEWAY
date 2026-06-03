# Chat 功能结构优化

**日期**: 2026-06-02
**状态**: 待实施
**依赖**: `2026-06-02-chat-ui-openai-unification-design.md`（已实施）

## 背景

经历上一轮 OpenAI 协议统一后，`useChatStream.ts` 已精简至 234 行。但 `Chat.tsx` 仍是 359 行的"上帝组件"——持有 7 个 useState，承担了工具栏渲染、会话 CRUD、SSE 回调处理等全部职责，违反 `.claude/rules/31-renderer.md` 的 feature pattern。

同时发现 6 个具体问题需要修复。

## 目标

1. 修复 6 个功能正确性/性能问题
2. 按 feature pattern 拆分：提取 `ChatToolbar` 组件 + `useConversationManager` hook
3. `Chat.tsx` 从 359 行降到 ~160 行

## 问题清单

### P1 — 功能正确性

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 1 | `ensureApiKey()` 冗余 IPC 调用 | Chat.tsx L79-90 | 直接用内存中的 `activeApiKeys`，从 async 变同步 |
| 2 | 会话创建失败时仍发 HTTP 请求 | Chat.tsx L143-171 | 只有 DB 写入成功才调 `send()`；或改为 fire-and-forget 允许失败 |
| 3 | `handleStreamUpdate` 闭包陷阱 | Chat.tsx L118 | 用 `useRef` 追踪 `activeConversationId`，回调中读 ref 而非闭包值 |

### P2 — 性能/体验

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 4 | 用户消息保存阻塞 HTTP 请求 ~100ms | Chat.tsx L144-162 | 改为 fire-and-forget，`saveConversationContext().catch(() => {})` |
| 5 | 切换会话先清空再加载，产生空白闪烁 | Chat.tsx L192-193 | 移除 `setMessages([])`，拿到消息后再一次性替换 |
| 6 | 每次发送都无意义调 `conversations.update()` | Chat.tsx L156-160 | 仅当 providerId/model/apiKeyId 实际变化时才更新 |

### P3 — 代码结构

| # | 问题 | 位置 | 修复 |
|---|------|------|------|
| 7 | ChatPage 上帝组件 | Chat.tsx 整体 | 提取 `ChatToolbar` + `useConversationManager` |
| 8 | ConversationSidebar 重复定义 Conversation 接口 | ConversationSidebar.tsx L20-25 | 统一用 `lib/types.ts` 的 `Conversation` |
| 9 | 魔数字符串 `'新对话'` | Chat.tsx 3 处 | 常量化 `DEFAULT_TITLE` |

## 设计决策

### 修复方案

**#1 ensureApiKey — 同步化**

```typescript
const ensureApiKey = () => {
  const match = activeApiKeys.find((k) => k.id === selectedApiKeyId)
  if (match?.key_plaintext) setApiKey(match.key_plaintext)
}
```

**#2 会话创建失败 → 不阻塞 send**

改为 fire-and-forget：消息保存失败不影响 HTTP 请求。如果 `activeConversationId` 为 null（新建失败），助手消息不保存，但用户仍能正常对话。

**#3 闭包陷阱 → useRef**

```typescript
const convIdRef = useRef(activeConversationId)
useEffect(() => { convIdRef.current = activeConversationId }, [activeConversationId])
// handleStreamUpdate 中用 convIdRef.current
```

**#4 用户消息保存 → fire-and-forget**

```typescript
// 不 await，不阻塞 send()
saveConversationContext(content).catch(() => {})

async function saveConversationContext(content: string) {
  let convId = activeConversationId
  if (!convId) {
    const conv = await api.conversations.create({...})
    convId = conv.id
    setActiveConversationId(convId)
    invalidateConversations()
  }
  await api.conversations.addMessage(convId, 'user', content)
}
```

**#5 切换会话消除闪烁**

直接移除 `setMessages([])`，`handleSelectConversation` 中先加载消息再一次性设值。

**#6 避免无意义 update**

比较当前会话的 model/providerId/apiKeyId，只有变化时才调 `update`。

### 结构拆分

**ChatToolbar 组件** (`features/chat/components/ChatToolbar.tsx`)

纯 UI 组件，通过 props 接收数据，不自己做 fetch：

```typescript
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
```

**useConversationManager hook** (`features/chat/hooks/useConversationManager.ts`)

封装会话的列表获取 + 切换/新建/删除操作：

```typescript
export function useConversationManager() {
  const { data: conversations = [] } = useConversations()
  const queryClient = useQueryClient()

  const selectConversation = async (id: number) => { ... }
  const newConversation = () => { ... }
  const deleteConversation = async (id: number) => { ... }
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['conversations'] })

  return { conversations, selectConversation, newConversation, deleteConversation, invalidate }
}
```

### ChatPage 精简后结构

```
ChatPage (~160行)
  ├─ 状态: selectedProviderId, selectedModel, selectedApiKeyId
  ├─ 状态: activeConversationId, messages, inputKey
  ├─ useProviders() → data
  ├─ useApiKeys() → data
  ├─ useConversationManager() → { conversations, select, new, delete }
  ├─ useChatStream(handleStreamUpdate) → { send, abort, isLoading }
  │
  ├─ handleStreamUpdate → setMessages + 保存助手消息
  ├─ handleSend → fire-and-forget 保存 + send()
  ├─ handleRegenerate → send(历史消息)
  ├─ handleStop → abort()
  │
  └─ JSX:
       ConversationSidebar
       ChatToolbar
       消息列表 (ChatMessage × N)
       ChatInput + 停止按钮
```

## 影响范围

| 文件 | 操作 | 行数 |
|------|------|------|
| `pages/Chat.tsx` | 重写 | 359→160 |
| `features/chat/components/ChatToolbar.tsx` | **新建** | ~70 |
| `features/chat/hooks/useConversationManager.ts` | **新建** | ~70 |
| `components/ConversationSidebar.tsx` | 类型统一 | -5 |
| `lib/types.ts` | 注释修复 | 1 |
| `pages/__tests__/Chat.test.tsx` | 适配拆分 | ~调整 |

## 风险

| 风险 | 缓解 |
|------|------|
| fire-and-forget 保存失败 | `.catch(() => {})` 静默处理，用户无感知 |
| 拆分后测试适配 | ChatToolbar 纯 UI 无需独立测试；现有 38 个测试保持通过 |
| 行为回退 | 所有改动为"删减+拆分"，逻辑不变 |
