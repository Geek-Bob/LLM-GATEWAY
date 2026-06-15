/**
 * Conversation IPC handlers — 对话与消息 CRUD
 */

import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Database } from '../db/database'
import { createConversationService } from '../domains/conversation/conversation.service'
import { createConversationSchema, updateConversationSchema, addMessageSchema } from '../domains/conversation/conversation.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * id 必须是正整数（防御 renderer 误传 NaN/0/负数/字符串）
 */
const idSchema = z.number().int().positive()

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

  ipcMain.handle('conversation:update', wrapIpcHandler(async (_event, id: unknown, data: unknown) => {
    const validId = idSchema.parse(id)
    const input = updateConversationSchema.parse(data)
    return conversationService.update(validId, input)
  }, 'conversation:update'))

  ipcMain.handle('conversation:delete', wrapIpcHandler(async (_event, id: unknown) => {
    const validId = idSchema.parse(id)
    return conversationService.remove(validId)
  }, 'conversation:delete'))

  ipcMain.handle('conversation:getById', wrapIpcHandler(async (_event, id: unknown) => {
    const validId = idSchema.parse(id)
    return conversationService.getById(validId) || null
  }, 'conversation:getById'))

  ipcMain.handle('conversation:listMessages', wrapIpcHandler(async (_event, conversationId: unknown) => {
    const validId = idSchema.parse(conversationId)
    return conversationService.messages(validId)
  }, 'conversation:listMessages'))

  ipcMain.handle('conversation:createMessage', wrapIpcHandler(async (_event, data: unknown) => {
    const input = addMessageSchema.parse(data)
    return conversationService.addMessage(input)
  }, 'conversation:createMessage'))
}
