/**
 * Agent IPC handlers — Agent 与 AgentConfig CRUD
 */

import { ipcMain } from 'electron'
import type { Database } from '../db/database'
import { createAgentService } from '../domains/agent/agent.service'
import {
  createAgentSchema,
  updateAgentSchema,
  createAgentConfigSchema,
  updateAgentConfigSchema,
  switchConfigSchema,
} from '../domains/agent/agent.schema'
import { wrapIpcHandler } from './ipc-utils'

/**
 * 注册 Agent 配置管理相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerAgentHandlers(db: Database): void {
  const agentService = createAgentService(db)

  ipcMain.handle('agent:list', wrapIpcHandler(async () => {
    return agentService.list()
  }, 'agent:list'))

  ipcMain.handle('agent:getById', wrapIpcHandler(async (_event, id: number) => {
    return agentService.getById(id)
  }, 'agent:getById'))

  ipcMain.handle('agent:create', wrapIpcHandler(async (_event, data: unknown) => {
    const input = createAgentSchema.parse(data)
    return agentService.create(input)
  }, 'agent:create'))

  ipcMain.handle('agent:update', wrapIpcHandler(async (_event, id: number, data: unknown) => {
    const input = updateAgentSchema.parse(data)
    return agentService.update(id, input)
  }, 'agent:update'))

  ipcMain.handle('agent:delete', wrapIpcHandler(async (_event, id: number) => {
    return agentService.remove(id)
  }, 'agent:delete'))

  ipcMain.handle('agent:listConfigs', wrapIpcHandler(async (_event, agentId: number) => {
    return agentService.listConfigs(agentId)
  }, 'agent:listConfigs'))

  ipcMain.handle('agent:getConfig', wrapIpcHandler(async (_event, id: number) => {
    return agentService.getConfig(id)
  }, 'agent:getConfig'))

  ipcMain.handle('agent:createConfig', wrapIpcHandler(async (_event, data: unknown) => {
    const input = createAgentConfigSchema.parse(data)
    return agentService.createConfig(input)
  }, 'agent:createConfig'))

  ipcMain.handle('agent:updateConfig', wrapIpcHandler(async (_event, id: number, data: unknown) => {
    const input = updateAgentConfigSchema.parse(data)
    return agentService.updateConfig(id, input)
  }, 'agent:updateConfig'))

  ipcMain.handle('agent:deleteConfig', wrapIpcHandler(async (_event, id: number) => {
    return agentService.deleteConfig(id)
  }, 'agent:deleteConfig'))

  ipcMain.handle('agent:switchConfig', wrapIpcHandler(async (_event, data: unknown) => {
    const input = switchConfigSchema.parse(data)
    return agentService.switchConfig(input)
  }, 'agent:switchConfig'))
}
