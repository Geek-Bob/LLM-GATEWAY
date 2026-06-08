/**
 * Conversation IPC handlers — 对话与消息 CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../domains/conversation/conversation.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册对话相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerConversationHandlers(db: Database): void {
  const conversationService = createConversationService(db)

  ipcMain.handle('conversation:list', wrapIpcHandler(async () => {
    return conversationService.list()
  }, 'conversation:list'))

  ipcMain.handle('conversation:create', wrapIpcHandler(async (_event, data: unknown) => {
    const input = createConversationSchema.parse(data)
    return conversationService.create(input)
  }, 'conversation:create'))

  ipcMain.handle('conversation:update', wrapIpcHandler(async (_event, id: number, data: unknown) => {
    const input = updateConversationSchema.parse(data)
    return conversationService.update(id, input)
  }, 'conversation:update'))

  ipcMain.handle('conversation:delete', wrapIpcHandler(async (_event, id: number) => {
    return conversationService.remove(id)
  }, 'conversation:delete'))

  ipcMain.handle('conversation:getById', wrapIpcHandler(async (_event, id: number) => {
    return conversationService.getById(id) || null
  }, 'conversation:getById'))

  ipcMain.handle('conversation:listMessages', wrapIpcHandler(async (_event, conversationId: number) => {
    return conversationService.messages(conversationId)
  }, 'conversation:listMessages'))

  ipcMain.handle('conversation:createMessage', wrapIpcHandler(async (_event, data: { conversationId: number; role: 'user' | 'assistant'; content: string; thinking?: string }) => {
    const input = addMessageSchema.parse(data)
    return conversationService.addMessage(input)
  }, 'conversation:createMessage'))
}
