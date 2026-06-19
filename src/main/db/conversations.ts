/**
 * Conversation 数据访问层（Repository 模式）
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
 */

import type { Database } from './database'

export interface ConversationRow {
  id: number
  title: string
  provider_id: number | null
  model: string
  api_key_id: number | null
  // 思考执行方式 'disabled'|'enabled'|'adaptive'，NULL 视为 disabled（向后兼容旧对话）
  thinking_type: string | null
  // 思考强度 'minimal'|'low'|'medium'|'high'|'xhigh'|'max'，NULL 视为不传
  reasoning_effort: string | null
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

/**
 * 创建 Conversation Repository 实例
 *
 * @param db - Database 实例
 * @returns Conversation Repository 对象
 */
export function createConversationRepository(db: Database) {
  return {
    /** 列出所有会话，按最近更新时间降序排列 */
    async list(): Promise<ConversationRow[]> {
      return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as unknown as ConversationRow[]
    },

    /** 按 ID 获取单个会话 */
    async findById(id: number): Promise<ConversationRow | null> {
      const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
      return row ?? null
    },

    /**
     * 创建新会话
     *
     * 位置参数风格：title, model 必填；providerId/apiKeyId/thinkingType/reasoningEffort 可选。
     * 思考两参数为尾随可选，向后兼容（不传写 NULL）。
     * 数据层不校验枚举值，业务规则（枚举约束）由 service 层负责。
     */
    async create(
      title: string,
      model: string,
      providerId?: number | null,
      apiKeyId?: number | null,
      thinkingType?: string | null,
      reasoningEffort?: string | null
    ): Promise<ConversationRow> {
      const result = db
        .prepare(
          `INSERT INTO conversations (title, provider_id, model, api_key_id, thinking_type, reasoning_effort)
           VALUES (@title, @provider_id, @model, @api_key_id, @thinking_type, @reasoning_effort)`
        )
        .run({
          title,
          provider_id: providerId ?? null,
          model,
          api_key_id: apiKeyId ?? null,
          thinking_type: thinkingType ?? null,
          reasoning_effort: reasoningEffort ?? null
        })
      const created = await this.findById(result.lastInsertRowid)
      if (!created) throw new Error('Failed to create conversation: record not found after insert')
      return created
    },

    /**
     * 部分更新会话字段
     *
     * 动态拼 SET 子句：仅传入字段被更新，未传字段保持原值（部分更新语义）。
     * thinking_type/reasoning_effort 支持显式置 null（传 undefined 表示不改动，传 null 表示清空）。
     */
    async update(
      id: number,
      data: {
        title?: string
        provider_id?: number | null
        model?: string
        api_key_id?: number | null
        thinking_type?: string | null
        reasoning_effort?: string | null
      }
    ): Promise<void> {
      const fields: string[] = ["updated_at = datetime('now')"]
      const params: Record<string, unknown> = { id }

      if (data.title !== undefined) { fields.push('title = @title'); params.title = data.title }
      if (data.provider_id !== undefined) { fields.push('provider_id = @provider_id'); params.provider_id = data.provider_id }
      if (data.model !== undefined) { fields.push('model = @model'); params.model = data.model }
      if (data.api_key_id !== undefined) { fields.push('api_key_id = @api_key_id'); params.api_key_id = data.api_key_id }
      if (data.thinking_type !== undefined) { fields.push('thinking_type = @thinking_type'); params.thinking_type = data.thinking_type }
      if (data.reasoning_effort !== undefined) { fields.push('reasoning_effort = @reasoning_effort'); params.reasoning_effort = data.reasoning_effort }

      db.prepare(`UPDATE conversations SET ${fields.join(', ')} WHERE id = @id`).run(params)
    },

    /** 删除会话 */
    async remove(id: number): Promise<void> {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    },

    /**
     * 清空 conversations 表全部记录
     *
     * 供「按模块清空业务数据」功能调用，删除所有会话历史。
     * messages 表通过 FOREIGN KEY ... ON DELETE CASCADE 自动级联清空，
     * 无需单独 DELETE FROM messages（外键约束已在 Database.create 中启用）。
     * 风格与 remove(id) 一致：直接 prepare().run()，无返回值。
     */
    async clearAll(): Promise<void> {
      db.prepare('DELETE FROM conversations').run()
    },

    /** 获取某会话的所有消息，按 id ASC 升序 */
    async listMessages(conversationId: number): Promise<MessageRow[]> {
      return db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC')
        .all(conversationId) as unknown as MessageRow[]
    },

    /** 向会话中添加消息，同时更新父会话的 updated_at
     *
     * 跨 2 张表的写操作（INSERT messages + UPDATE conversations）必须事务化，
     * 否则 INSERT 成功而 UPDATE 失败会导致 messages 已写入但会话时间戳未更新。
     */
    async addMessage(conversationId: number, role: 'user' | 'assistant', content: string, thinking?: string): Promise<number> {
      db.exec('BEGIN')
      try {
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

        db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId)
        db.exec('COMMIT')
        return result.lastInsertRowid
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}

export type ConversationRepository = ReturnType<typeof createConversationRepository>
