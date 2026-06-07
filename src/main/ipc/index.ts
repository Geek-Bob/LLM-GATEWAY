/**
 * IPC 处理器注册入口 — 薄编排层
 *
 * 按 domain 拆分为独立文件，本文件仅负责：
 * 1. 获取数据库实例
 * 2. 调用各 domain 的 registerXxxHandlers() 完成 handler 注册
 *
 * 每个 domain handler 文件独立管理自己的 service 创建和 Zod 校验。
 */

import { getDb } from '../db/connection'
import type { UpdateManager } from '../update/manager'
import { registerProviderHandlers } from './providers'
import { registerApiKeyHandlers } from './apikeys'
import { registerConversationHandlers } from './conversations'
import { registerLogHandlers } from './logs'
import { registerStatsHandlers } from './stats'
import { registerProxyHandlers } from './proxy'
import { registerModelHandlers } from './models'
import { registerAgentHandlers } from './agents'
import { registerUpdateHandlers } from './update'
import { registerSystemHandlers } from './system'

/**
 * 注册所有 IPC handler，连接渲染进程请求与 domain service 层
 *
 * @param updateManager - 自动更新管理器实例，用于注册更新相关 IPC handler
 */
export function setupIpcHandlers(updateManager: UpdateManager): void {
  const db = getDb()

  registerProviderHandlers(db)
  registerApiKeyHandlers(db)
  registerConversationHandlers(db)
  registerLogHandlers(db)
  registerStatsHandlers(db)
  registerProxyHandlers()
  registerModelHandlers(db)
  registerAgentHandlers(db)
  registerUpdateHandlers(updateManager)
  registerSystemHandlers()
}
