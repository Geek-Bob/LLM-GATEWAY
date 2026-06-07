/**
 * Stats IPC handlers — 统计概要
 *
 * 注：logs:stats 和 logs:statsDetailed 已移至 ipc/logs.ts，
 * 因为它们属于日志域的查询能力。此文件保留为独立入口，
 * 若后续 stats domain 扩展（如实时统计推送），在此注册。
 */

import type { Database } from '../db/database'

/**
 * 注册统计相关的 IPC handler
 * 当前无独立 handler，统计查询通过 logs.ts 的 registerLogHandlers 统一注册。
 * 保留此函数签名以备 stats domain 扩展。
 *
 * @param _db - 注入的数据库实例
 */
export function registerStatsHandlers(_db: Database): void {
  // 当前无独立的 stats IPC handler。
  // logs:stats 和 logs:statsDetailed 由 registerLogHandlers 注册，
  // 因为它们底层调用 statsService 和 logsService 两个 domain。
}
