import fs from 'fs'

// sql.js has no type definitions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _initSqlJs = require('sql.js') as (opts?: { locateFile?: (file: string) => string }) => Promise<{
  Database: new (data?: Uint8Array | number[] | null) => any
}>

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

export class Statement {
  private db: any
  private sql: string
  private save: () => void

  constructor(db: any, sql: string, save: () => void) {
    this.db = db
    this.sql = sql
    this.save = save
  }

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

export class Database {
  private db: any
  private filePath: string | null
  private _saveTimer: ReturnType<typeof setTimeout> | null = null

  private constructor(db: any, filePath: string | null) {
    this.db = db
    this.filePath = filePath
  }

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

  prepare(sql: string): Statement {
    return new Statement(this.db, sql, () => this.save())
  }

  exec(sql: string): void {
    this.db.exec(sql)
    this.save()
  }

  pragma(sql: string): unknown[][] {
    const result = this.db.exec(`PRAGMA ${sql}`)
    if (result.length > 0) {
      return result[0].values as unknown[][]
    }
    return []
  }

  save(): void {
    if (!this.filePath) return
    // Debounce: coalesce rapid writes (e.g. stats updates per request)
    if (this._saveTimer) clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => {
      const data = this.db.export()
      fs.writeFileSync(this.filePath!, Buffer.from(data))
      this._saveTimer = null
    }, 2000)
  }

  /** Force an immediate save, bypassing the debounce */
  saveImmediate(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    if (!this.filePath) return
    const data = this.db.export()
    fs.writeFileSync(this.filePath, Buffer.from(data))
  }

  close(): void {
    this.saveImmediate()
    this.db.close()
  }
}

export default Database
