import { Database } from './database'

let db: Database | null = null

export async function initDatabase(dbPath: string): Promise<Database> {
  if (db) {
    return db
  }

  db = await Database.create(dbPath)
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}
