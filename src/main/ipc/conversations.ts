/**
 * Conversation IPC handlers — 对话与消息 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../domains/conversation/conversation.schema'

/**
 * 注册对话相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerConversationHandlers(db: Database): void {
  const conversationService = createConversationService(db)

  ipcMain.handle('conversation:list', async () => {
    return conversationService.list()
  })

  ipcMain.handle('conversation:create', async (_event, data: unknown) => {
    const input = createConversationSchema.parse(data)
    return conversationService.create(input)
  })

  ipcMain.handle('conversation:update', async (_event, id: number, data: unknown) => {
    const input = updateConversationSchema.parse(data)
    return conversationService.update(id, input)
  })

  ipcMain.handle('conversation:delete', async (_event, id: number) => {
    return conversationService.remove(id)
  })

  ipcMain.handle('conversation:getById', async (_event, id: number) => {
    return conversationService.getById(id) || null
  })

  ipcMain.handle('conversation:listMessages', async (_event, conversationId: number) => {
    return conversationService.messages(conversationId)
  })

  ipcMain.handle('conversation:createMessage', async (_event, data: { conversationId: number; role: 'user' | 'assistant'; content: string; thinking?: string }) => {
    const input = addMessageSchema.parse(data)
    return conversationService.addMessage(input)
  })
}
