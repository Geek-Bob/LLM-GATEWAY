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

/**
 * 注册 Agent 配置管理相关的 IPC handler
 * @param db - 注入的数据库实例
 */
export function registerAgentHandlers(db: Database): void {
  const agentService = createAgentService(db)

  ipcMain.handle('agent:list', async () => {
    return agentService.list()
  })

  ipcMain.handle('agent:getById', async (_event, id: number) => {
    return agentService.getById(id)
  })

  ipcMain.handle('agent:create', async (_event, data: unknown) => {
    const input = createAgentSchema.parse(data)
    return agentService.create(input)
  })

  ipcMain.handle('agent:update', async (_event, id: number, data: unknown) => {
    const input = updateAgentSchema.parse(data)
    return agentService.update(id, input)
  })

  ipcMain.handle('agent:delete', async (_event, id: number) => {
    return agentService.remove(id)
  })

  ipcMain.handle('agent:listConfigs', async (_event, agentId: number) => {
    return agentService.listConfigs(agentId)
  })

  ipcMain.handle('agent:getConfig', async (_event, id: number) => {
    return agentService.getConfig(id)
  })

  ipcMain.handle('agent:createConfig', async (_event, data: unknown) => {
    const input = createAgentConfigSchema.parse(data)
    return agentService.createConfig(input)
  })

  ipcMain.handle('agent:updateConfig', async (_event, id: number, data: unknown) => {
    const input = updateAgentConfigSchema.parse(data)
    return agentService.updateConfig(id, input)
  })

  ipcMain.handle('agent:deleteConfig', async (_event, id: number) => {
    return agentService.deleteConfig(id)
  })

  ipcMain.handle('agent:switchConfig', async (_event, data: unknown) => {
    const input = switchConfigSchema.parse(data)
    return agentService.switchConfig(input)
  })
}
