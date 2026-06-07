/**
 * 会话与消息数据访问层
 *
 * 管理两个相关联的表：
 * - conversations：会话元信息（标题、关联供应商、模型、API Key）
 * - messages：会话内的消息记录（按 id ASC 排序保证时序）
 *
 * 关键设计：
 * - 会话列表始终按 updated_at 降序，最近活动的排最前
 * - 添加消息时会自动更新父会话的 updated_at
 * - messages.thinking 字段用于存储 Anthropic 的思考过程（streaming 模式）
 * - provider_id 可为 null，兼容未选择供应商的历史会话
 *
 * 所有函数通过参数注入 Database 实例，禁止内部调用 getDb()。
 */

import type { Database } from './database'

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

/** 列出所有会话，按最近更新时间降序排列。 */
export function listConversations(db: Database): ConversationRow[] {
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as unknown as ConversationRow[]
}

/** 创建新会话，关联可选的供应商和 API 密钥。返回新会话的自增主键 ID。 */
export function createConversation(
  db: Database,
  title: string,
  model: string,
  providerId?: number | null,
  apiKeyId?: number | null
): number {
  const result = db
    .prepare(
      `INSERT INTO conversations (title, provider_id, model, api_key_id)
       VALUES (@title, @provider_id, @model, @api_key_id)`
    )
    .run({
      title,
      provider_id: providerId ?? null,
      model,
      api_key_id: apiKeyId ?? null
    })
  return result.lastInsertRowid
}

/**
 * 部分更新会话字段（标题、供应商、模型、API Key）。
 * 使用 undefined 判断而非 falsy 判断，以便支持将字段显式设为 null。
 * 每次更新自动刷新 updated_at 时间戳。
 */
export function updateConversation(
  db: Database,
  id: number,
  data: {
    title?: string
    provider_id?: number | null
    model?: string
    api_key_id?: number | null
  }
): void {
  const fields: string[] = ["updated_at = datetime('now')"]
  const params: Record<string, unknown> = { id }

  if (data.title !== undefined) {
    fields.push('title = @title')
    params.title = data.title
  }
  if (data.provider_id !== undefined) {
    fields.push('provider_id = @provider_id')
    params.provider_id = data.provider_id
  }
  if (data.model !== undefined) {
    fields.push('model = @model')
    params.model = data.model
  }
  if (data.api_key_id !== undefined) {
    fields.push('api_key_id = @api_key_id')
    params.api_key_id = data.api_key_id
  }

  db.prepare(
    `UPDATE conversations SET ${fields.join(', ')} WHERE id = @id`
  ).run(params)
}

/** 删除会话。注意：不会级联删除关联的消息（SQLite 外键默认行为），需待 schema 层 CASCADE 支持。 */
export function deleteConversation(db: Database, id: number): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

/** 按 ID 获取单个会话，找不到返回 undefined。 */
export function getConversation(db: Database, id: number): ConversationRow | undefined {
  return db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as ConversationRow | undefined
}

/** 获取某会话的所有消息，按 id ASC 升序（即对话发生的自然时序）。 */
export function listMessages(db: Database, conversationId: number): MessageRow[] {
  return db
    .prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC'
    )
    .all(conversationId) as unknown as MessageRow[]
}

/**
 * 向会话中添加消息。
 * - role 仅允许 'user' 或 'assistant'
 * - thinking 字段用于存储模型推理的中间思考文本（Anthropic 特有），默认为空字符串
 * - 新消息插入后自动更新父会话的 updated_at，确保会话列表按最新消息活动排序
 */
export function addMessage(
  db: Database,
  conversationId: number,
  role: 'user' | 'assistant',
  content: string,
  thinking?: string
): number {
  const result = db
    .prepare(
      `INSERT INTO messages (conversation_id, role, content, thinking)
       VALUES (@conversation_id, @role, @content, @thinking)`
    )
    .run({
      conversation_id: conversationId,
      role,
      content,
      thinking: thinking || ''
    })

  // 新消息添加后刷新父会话时间戳，以便排序
  db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).run(conversationId)

  return result.lastInsertRowid
}
