/**
 * SQLite 数据库封装模块
 *
 * 基于 sql.js（WebAssembly SQLite）实现嵌入式数据库，
 * 提供 Statement 预编译语句和 Database 类，支持自动持久化（带防抖写入）。
 * 整个主进程共享一个数据库实例，通过 connection.ts 管理生命周期。
 */

import fs from 'fs'

// sql.js 暂无 TypeScript 类型定义，使用 require 导入并手动声明类型
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _initSqlJs = require('sql.js') as (opts?: { locateFile?: (file: string) => string }) => Promise<{
  Database: new (data?: Uint8Array | number[] | null) => any
}>

/**
 * SQL 执行结果，包含插入行的自增 ID 和受影响行数
 */
export interface RunResult {
  lastInsertRowid: number
  changes: number
}

let _modulePromise: Promise<{
  Database: new (data?: Uint8Array | number[] | null) => any
}> | null = null

async function getSqlModule(): Promise<{
  Database: new (data?: Uint8Array | number[] | null) => any
}> {
  if (!_modulePromise) {
    _modulePromise = _initSqlJs()
  }
  return _modulePromise
}

/**
 * 统一参数格式转换为 sql.js 支持的绑定格式
 *
 * sql.js 的 bind 方法要求命名参数必须以 :/@/$ 开头。
 * 如果参数的 key 不以这些前缀开头，则自动添加 @ 前缀。
 * 此函数确保上层业务代码无需关心底层绑定格式差异。
 */
function convertParams(
  params: unknown
): Record<string, unknown> | unknown[] | undefined {
  if (params === undefined || params === null) return undefined
  if (Array.isArray(params)) return params
  if (typeof params !== 'object') return [params]

  const keys = Object.keys(params as Record<string, unknown>)
  if (keys.length > 0 && /^[:@$]/.test(keys[0])) {
    return params as Record<string, unknown>
  }

  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(
    params as Record<string, unknown>
  )) {
    converted[`@${key}`] = value
  }
  return converted
}

/**
 * 获取上一条 SQL 操作的影响行数和最后插入 ID
 * 通过 sql.js 的 last_insert_rowid() 和 changes() 函数实现
 */
function getAffectedCount(db: any): RunResult {
  const r = db.exec(
    'SELECT last_insert_rowid() as rowid, changes() as changes'
  )
  if (r.length > 0 && r[0].values.length > 0) {
    return {
      lastInsertRowid: Number(r[0].values[0][0]),
      changes: Number(r[0].values[0][1])
    }
  }
  return { lastInsertRowid: 0, changes: 0 }
}

/**
 * 预编译 SQL 语句
 *
 * 包装 sql.js 的 prepare/bind/step 流程，提供简洁的 run/get/all 接口。
 * 每次执行后自动触发 save 回调，确保持久化。
 */
export class Statement {
  private db: any
  private sql: string
  private save: () => void

  constructor(db: any, sql: string, save: () => void) {
    this.db = db
    this.sql = sql
    this.save = save
  }

  /**
   * 执行写操作（INSERT/UPDATE/DELETE）
   * @returns 包含 lastInsertRowid 和 changes 的执行结果
   */
  run(params?: unknown): RunResult {
    const converted = convertParams(params)
    if (converted !== undefined) {
      this.db.run(this.sql, converted)
    } else {
      this.db.run(this.sql)
    }
    this.save()
    return getAffectedCount(this.db)
  }

  /**
   * 查询单条记录
   * @returns 结果对象，无匹配时返回 undefined
   */
  get(params?: unknown): Record<string, unknown> | undefined {
    const converted = convertParams(params)
    const stmt = this.db.prepare(this.sql)
    try {
      if (converted !== undefined) {
        stmt.bind(converted)
      }
      return stmt.step()
        ? (stmt.getAsObject() as Record<string, unknown>)
        : undefined
    } finally {
      stmt.free()
    }
  }

  /**
   * 查询多条记录
   * @returns 结果对象数组，无匹配时返回空数组
   */
  all(params?: unknown): Record<string, unknown>[] {
    const converted = convertParams(params)
    const stmt = this.db.prepare(this.sql)
    try {
      if (converted !== undefined) {
        stmt.bind(converted)
      }
      const results: Record<string, unknown>[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject() as Record<string, unknown>)
      }
      return results
    } finally {
      stmt.free()
    }
  }
}

/**
 * 数据库封装类
 *
 * 封装 sql.js 的 Database 对象，提供：
 * - 文件持久化（带防抖写入，避免频繁 I/O）
 * - 预编译语句模板（prepare）
 * - 直接执行（exec）
 * - PRAGMA 查询支持
 */
export class Database {
  private db: any
  private filePath: string | null
  private _saveTimer: ReturnType<typeof setTimeout> | null = null

  private constructor(db: any, filePath: string | null) {
    this.db = db
    this.filePath = filePath
  }

  /**
   * 创建或打开数据库
   * - 文件已存在则从文件加载，否则创建空库
   * - ':memory:' 视为无持久化的内存库
   * - 默认启用外键约束（PRAGMA foreign_keys = ON）
   */
  static async create(filePath?: string): Promise<Database> {
    const SQL = await getSqlModule()
    let sqlDb: any
    if (filePath && fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath)
      sqlDb = new SQL.Database(new Uint8Array(data))
    } else {
      sqlDb = new SQL.Database()
    }

    // Treat ':memory:' as null to avoid file persistence errors
    const effectivePath = filePath && filePath !== ':memory:' ? filePath : null
    const db = new Database(sqlDb, effectivePath)
    sqlDb.run('PRAGMA foreign_keys = ON')
    return db
  }

  /**
   * 创建预编译 SQL 语句
   * 每次执行写操作后自动触发持久化回调
   */
  prepare(sql: string): Statement {
    return new Statement(this.db, sql, () => this.save())
  }

  /**
   * 直接执行 SQL 语句（适合 DDL 或批量操作）
   * 执行后自动持久化到文件
   */
  exec(sql: string): void {
    this.db.exec(sql)
    this.save()
  }

  /**
   * 执行 PRAGMA 查询（如 table_info, foreign_keys 等）
   * @returns 二维数组结果集
   */
  pragma(sql: string): unknown[][] {
    const result = this.db.exec(`PRAGMA ${sql}`)
    if (result.length > 0) {
      return result[0].values as unknown[][]
    }
    return []
  }

  /**
   * 持久化数据库到文件（防抖）
   *
   * 使用 2 秒防抖窗口合并高频写入（如逐请求的统计更新）。
   * 内存库（filePath 为空）直接跳过，避免不必要的文件操作。
   */
  save(): void {
    if (!this.filePath) return
    // 防抖：合并高频写入（如统计更新每请求触发一次）
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      const data = this.db.export()
      fs.writeFileSync(this.filePath!, Buffer.from(data))
      this._saveTimer = null
    }, 2000)
  }

  /**
   * 强制立即持久化（绕过防抖）
   * 在应用退出前调用，确保数据不丢失
   */
  saveImmediate(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    if (!this.filePath) return
    const data = this.db.export()
    fs.writeFileSync(this.filePath, Buffer.from(data))
  }

  /**
   * 关闭数据库连接
   * 先强制持久化（确保所有待写入数据落盘），再释放 sql.js 资源
   */
  close(): void {
    this.saveImmediate()
    this.db.close()
  }
}

export default Database
