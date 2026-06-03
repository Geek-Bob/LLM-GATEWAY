/**
 * 数据库连接管理模块
 *
 * 提供 SQLite 数据库实例的初始化和全局访问入口。
 * 采用单例模式，确保整个主进程生命周期内只有一个数据库连接。
 */

import { Database } from './database'

let db: Database | null = null

/**
 * 初始化数据库连接（幂等）
 * 如果已经初始化过则直接返回现有实例，不会重复创建
 * @param dbPath - 数据库文件路径
 */
export async function initDatabase(dbPath: string): Promise<Database> {
  if (db) {
    return db
  }

  db = await Database.create(dbPath)
  return db
}

/**
 * 关闭数据库连接并释放资源
 * 在 app.before-quit 事件中调用，确保数据持久化完成
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * 获取全局数据库实例
 * @throws 如果数据库尚未初始化则抛出错误
 */
export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}
