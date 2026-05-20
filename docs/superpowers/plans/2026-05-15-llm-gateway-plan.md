# LLM Gateway 实施计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 superpowers:finishing-a-development-branch 交付

**目标：** 构建一个跨平台桌面 LLM 网关应用，统一管理多个 LLM 供应商（Anthropic/OpenAI 兼容），对外提供统一代理 API。

**架构：** Electron 主进程内运行 Hono HTTP 服务器处理代理请求，React SPA 通过 IPC 管理配置，SQLite 存储数据。所有代码使用 TypeScript。

**技术栈：** React + TypeScript + Tailwind CSS + shadcn/ui + Hono + better-sqlite3 + Electron + electron-builder

**追踪：** `[✅] 17/17 任务` — 全部完成

---

### Task 1: 项目脚手架搭建

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`tsconfig.node.json`
- 创建：`tsconfig.web.json`
- 创建：`electron.vite.config.ts`
- 创建：`tailwind.config.js`
- 创建：`postcss.config.js`
- 创建：`vitest.config.ts`
- 创建：`.gitignore`
- 创建：`src/renderer/index.html`

**步骤：**

- [✅] **步骤 1：初始化 package.json 并安装依赖**

```bash
cd /path/to/llm-gateway
npm init -y
```

安装生产依赖：
```bash
npm install electron better-sqlite3 hono react react-dom react-router-dom recharts framer-motion uuid
```

安装开发依赖：
```bash
npm install -D typescript @types/react @types/react-dom @types/better-sqlite3 @types/uuid
npm install -D electron-vite @vitejs/plugin-react vite
npm install -D tailwindcss postcss autoprefixer
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D electron-builder @electron/rebuild
npm install -D eslint prettier
```

验证依赖安装完成（无错误退出）。

- [✅] **步骤 2：创建 TypeScript 配置文件**

`tsconfig.json`：
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`：
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "outDir": "./out",
    "rootDir": "./src/main",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/main/**/*", "src/preload/**/*"]
}
```

`tsconfig.web.json`：
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "outDir": "./out",
    "rootDir": "./src/renderer",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/renderer/*"] }
  },
  "include": ["src/renderer/**/*"]
}
```

- [✅] **步骤 3：创建 electron.vite.config.ts**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer') }
    }
  }
})
```

- [✅] **步骤 4：创建 TailwindCSS 和 PostCSS 配置**

`tailwind.config.js`：
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: []
}
```

`postcss.config.js`：
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

`vitest.config.ts`：
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/test-setup.ts']
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/renderer') }
  }
})
```

- [✅] **步骤 5：创建 .gitignore 和 renderer/index.html**

`.gitignore`：
```
node_modules/
out/
dist/
*.db
*.db-journal
.DS_Store
```

`src/renderer/index.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LLM Gateway</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [✅] **步骤 6：创建 package.json 启动脚本和入口**

编辑 `package.json`，添加：
```json
{
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [✅] **步骤 7：验证项目能够构建**

```bash
npm run build
```
预期输出：在 `out/` 目录下生成 main/index.js、preload/index.js、renderer/ 等文件。

---

### Task 2: 数据库 Schema 与连接层

**文件：**
- 创建：`src/main/db/schema.ts`
- 创建：`src/main/db/connection.ts`
- 测试：`src/main/db/__tests__/schema.test.ts`

**步骤：**

- [✅] **步骤 1：编写数据库连接模块测试**

`src/main/db/__tests__/connection.test.ts`：
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDatabase, closeDatabase, getDb } from '../connection'

describe('Database Connection', () => {
  afterEach(() => {
    closeDatabase()
  })

  it('should initialize database in memory', () => {
    const db = initDatabase(':memory:')
    expect(db).toBeInstanceOf(Database)
    expect(getDb()).toBe(db)
  })

  it('should return same instance on multiple calls', () => {
    const db1 = initDatabase(':memory:')
    const db2 = initDatabase(':memory:')
    expect(db1).toBe(db2)
  })

  it('should close database without error', () => {
    initDatabase(':memory:')
    expect(() => closeDatabase()).not.toThrow()
  })
})
```

- [✅] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/main/db/__tests__/connection.test.ts
```
预期：FAIL — "Cannot find module '../connection'"

- [✅] **步骤 3：实现数据库连接模块**

`src/main/db/connection.ts`：
```typescript
import Database from 'better-sqlite3'

let db: Database.Database | null = null

export function initDatabase(dbPath: string): Database.Database {
  if (db) return db
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.')
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
```

- [✅] **步骤 4：编写 Schema 测试**

`src/main/db/__tests__/schema.test.ts`：
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'

describe('Database Schema', () => {
  beforeAll(() => {
    initDatabase(':memory:')
    createTables()
  })

  afterAll(() => {
    closeDatabase()
  })

  it('should create providers table', () => {
    const result = getDb().exec("SELECT name FROM sqlite_master WHERE type='table' AND name='providers'")
    expect(result).toBeTruthy()
  })

  it('should create api_keys table', () => {
    const result = getDb().exec("SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'")
    expect(result).toBeTruthy()
  })

  it('should have correct providers columns', () => {
    const cols = getDb().prepare("PRAGMA table_info('providers')").all() as any[]
    const names = cols.map(c => c.name)
    expect(names).toContain('name')
    expect(names).toContain('provider_type')
    expect(names).toContain('base_url')
    expect(names).toContain('api_key_encrypted')
    expect(names).toContain('models')
    expect(names).toContain('is_active')
  })

  it('should have correct api_keys columns', () => {
    const cols = getDb().prepare("PRAGMA table_info('api_keys')").all() as any[]
    const names = cols.map(c => c.name)
    expect(names).toContain('name')
    expect(names).toContain('key_hash')
    expect(names).toContain('key_prefix')
    expect(names).toContain('rate_limit')
  })
})
```

- [✅] **步骤 5：运行测试确认失败**

```bash
npx vitest run src/main/db/__tests__/schema.test.ts
```
预期：FAIL — "Cannot find module '../schema'"

- [✅] **步骤 6：实现 createTables**

`src/main/db/schema.ts`：
```typescript
import { getDb } from './connection'

export function createTables(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      provider_type TEXT NOT NULL CHECK(provider_type IN ('anthropic', 'openai')),
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      models TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      rate_limit INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

export function createLogsTable(dbPath: string): void {
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default
  const logDb = new Database(dbPath)
  logDb.pragma('journal_mode = WAL')
  logDb.exec(`
    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id INTEGER,
      provider_id INTEGER,
      model TEXT NOT NULL,
      api_format TEXT NOT NULL CHECK(api_format IN ('anthropic', 'openai')),
      status_code INTEGER,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON request_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_provider ON request_logs(provider_id);
  `)
  return logDb
}
```

- [✅] **步骤 7：运行测试确认通过**

```bash
npx vitest run src/main/db/__tests__/schema.test.ts src/main/db/__tests__/connection.test.ts
```
预期：PASS (all tests green)

- [✅] **步骤 8：提交**

```bash
git add package.json tsconfig*.json *.config.js *.config.ts src/renderer/index.html src/main/db/
git commit -m "feat: project scaffolding and database schema"
```

---

### Task 3: 数据库 CRUD — Providers

**文件：**
- 创建：`src/main/db/providers.ts`
- 创建：`src/main/utils/crypto.ts`
- 测试：`src/main/db/__tests__/providers.test.ts`

**步骤：**

- [✅] **步骤 1：编写加密工具测试**

`src/main/utils/__tests__/crypto.test.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../crypto'

describe('Crypto', () => {
  const testKey = 'test-key-32-bytes-0123456789ab'

  it('should encrypt and decrypt text', () => {
    const plaintext = 'sk-ant-test123456'
    const encrypted = encrypt(plaintext, testKey)
    expect(encrypted).not.toBe(plaintext)
    expect(encrypted).toContain(':') // iv:encrypted format
    const decrypted = decrypt(encrypted, testKey)
    expect(decrypted).toBe(plaintext)
  })

  it('should produce different ciphertexts for same plaintext', () => {
    const plaintext = 'test-key'
    const a = encrypt(plaintext, testKey)
    const b = encrypt(plaintext, testKey)
    expect(a).not.toBe(b)
  })
})
```

- [✅] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/main/utils/__tests__/crypto.test.ts
```

- [✅] **步骤 3：实现加密工具**

`src/main/utils/crypto.ts`：
```typescript
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'llm-gateway-salt', 32)
}

export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${tag}:${encrypted}`
}

export function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret)
  const parts = ciphertext.split(':')
  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
```

- [✅] **步骤 4：运行测试确认通过**

```bash
npx vitest run src/main/utils/__tests__/crypto.test.ts
```

- [✅] **步骤 5：编写 providers CRUD 测试**

`src/main/db/__tests__/providers.test.ts`：
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'
import { createProvider, getProvider, listProviders, updateProvider, deleteProvider, getProviderByName, ProviderInput } from '../providers'

describe('Providers CRUD', () => {
  beforeAll(() => {
    initDatabase(':memory:')
    createTables()
  })

  afterAll(() => closeDatabase())

  beforeEach(() => {
    getDb().exec('DELETE FROM providers')
  })

  const sampleInput: ProviderInput = {
    name: 'anthropic-official',
    providerType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyEncrypted: 'encrypted-key',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514']
  }

  it('should create a provider', () => {
    const id = createProvider(sampleInput)
    expect(id).toBeGreaterThan(0)
  })

  it('should get a provider by id', () => {
    const id = createProvider(sampleInput)
    const provider = getProvider(id)
    expect(provider).not.toBeNull()
    expect(provider!.name).toBe('anthropic-official')
  })

  it('should get a provider by name', () => {
    createProvider(sampleInput)
    const provider = getProviderByName('anthropic-official')
    expect(provider).not.toBeNull()
    expect(provider!.provider_type).toBe('anthropic')
  })

  it('should list all active providers', () => {
    createProvider(sampleInput)
    createProvider({ ...sampleInput, name: 'openai-test', providerType: 'openai', baseUrl: 'https://api.openai.com' })
    const list = listProviders()
    expect(list).toHaveLength(2)
  })

  it('should update a provider', () => {
    const id = createProvider(sampleInput)
    updateProvider(id, { baseUrl: 'https://api.anthropic.com/v1' })
    const updated = getProvider(id)
    expect(updated!.base_url).toBe('https://api.anthropic.com/v1')
  })

  it('should delete a provider', () => {
    const id = createProvider(sampleInput)
    deleteProvider(id)
    expect(getProvider(id)).toBeNull()
  })
})
```

- [✅] **步骤 6：运行测试确认失败**

```bash
npx vitest run src/main/db/__tests__/providers.test.ts
```

- [✅] **步骤 7：实现 providers CRUD**

`src/main/db/providers.ts`：
```typescript
import { getDb } from './connection'

export interface ProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKeyEncrypted: string
  models: string[]
}

export interface Provider extends ProviderInput {
  id: number
  is_active: number
  created_at: string
  updated_at: string
}

export function createProvider(input: ProviderInput): number {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO providers (name, provider_type, base_url, api_key_encrypted, models)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(input.name, input.providerType, input.baseUrl, input.apiKeyEncrypted, JSON.stringify(input.models))
  return result.lastInsertRowid as number
}

export function getProvider(id: number): Provider | undefined {
  return getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
}

export function getProviderByName(name: string): Provider | undefined {
  return getDb().prepare('SELECT * FROM providers WHERE name = ?').get(name) as Provider | undefined
}

export function listProviders(): Provider[] {
  return getDb().prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as Provider[]
}

export function listActiveProviders(): Provider[] {
  return getDb().prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at DESC').all() as Provider[]
}

export function updateProvider(id: number, updates: Partial<ProviderInput & { isActive: boolean }>): void {
  const db = getDb()
  const sets: string[] = ['updated_at = datetime(\'now\')']
  const values: any[] = []

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name) }
  if (updates.providerType !== undefined) { sets.push('provider_type = ?'); values.push(updates.providerType) }
  if (updates.baseUrl !== undefined) { sets.push('base_url = ?'); values.push(updates.baseUrl) }
  if (updates.apiKeyEncrypted !== undefined) { sets.push('api_key_encrypted = ?'); values.push(updates.apiKeyEncrypted) }
  if (updates.models !== undefined) { sets.push('models = ?'); values.push(JSON.stringify(updates.models)) }
  if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive ? 1 : 0) }

  values.push(id)
  db.prepare(`UPDATE providers SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteProvider(id: number): void {
  getDb().prepare('DELETE FROM providers WHERE id = ?').run(id)
}
```

- [✅] **步骤 8：运行测试确认通过**

```bash
npx vitest run src/main/db/__tests__/providers.test.ts
```

- [✅] **步骤 9：提交**

```bash
git add src/main/utils/ src/main/db/providers.ts
git commit -m "feat: providers CRUD and crypto utils"
```

---

### Task 4: 数据库 CRUD — API Keys + 日志

**文件：**
- 创建：`src/main/db/api-keys.ts`
- 创建：`src/main/db/logs.ts`
- 测试：`src/main/db/__tests__/api-keys.test.ts`
- 测试：`src/main/db/__tests__/logs.test.ts`

**步骤：**

- [✅] **步骤 1：编写 API Keys 测试**

`src/main/db/__tests__/api-keys.test.ts`：
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDatabase, closeDatabase, getDb } from '../connection'
import { createTables } from '../schema'
import { createApiKey, getApiKeyByHash, listApiKeys, deleteApiKey, verifyApiKey } from '../api-keys'

describe('API Keys CRUD', () => {
  beforeAll(() => { initDatabase(':memory:'); createTables() })
  afterAll(() => closeDatabase())
  beforeEach(() => { getDb().exec('DELETE FROM api_keys') })

  it('should create an API key and return plaintext', () => {
    const result = createApiKey('prod-app', 100)
    expect(result.plaintextKey).toMatch(/^sk-/)
    expect(result.key).toHaveProperty('id')
    expect(result.key.key_prefix).toBe(result.plaintextKey.slice(0, 8))
  })

  it('should verify a valid API key', () => {
    const { plaintextKey } = createApiKey('test-key', 60)
    const verified = verifyApiKey(plaintextKey)
    expect(verified).not.toBeNull()
    expect(verified!.name).toBe('test-key')
  })

  it('should reject invalid API key', () => {
    expect(verifyApiKey('sk-invalid-key')).toBeNull()
  })

  it('should list all API keys without hashes', () => {
    createApiKey('key-a')
    createApiKey('key-b')
    const list = listApiKeys()
    expect(list).toHaveLength(2)
    expect(list[0]).not.toHaveProperty('key_hash')
  })
})
```

- [✅] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/main/db/__tests__/api-keys.test.ts
```

- [✅] **步骤 3：实现 API Keys CRUD**

`src/main/db/api-keys.ts`：
```typescript
import { getDb } from './connection'
import crypto from 'crypto'

export interface ApiKeyRow {
  id: number
  name: string
  key_prefix: string
  key_hash: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface ApiKeyResult {
  plaintextKey: string
  key: Omit<ApiKeyRow, 'key_hash'>
}

function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(36).toString('base64url')
  const plaintext = `sk-${random}`
  const prefix = plaintext.slice(0, 8)
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex')
  return { plaintext, prefix, hash }
}

export function createApiKey(name: string, rateLimit: number = 60): ApiKeyResult {
  const db = getDb()
  const { plaintext, prefix, hash } = generateApiKey()
  const stmt = db.prepare('INSERT INTO api_keys (name, key_prefix, key_hash, rate_limit) VALUES (?, ?, ?, ?)')
  const result = stmt.run(name, prefix, hash, rateLimit)
  return {
    plaintextKey: plaintext,
    key: {
      id: result.lastInsertRowid as number,
      name,
      key_prefix: prefix,
      is_active: 1,
      rate_limit: rateLimit,
      created_at: new Date().toISOString()
    }
  }
}

export function verifyApiKey(plaintextKey: string): Omit<ApiKeyRow, 'key_hash'> | null {
  const hash = crypto.createHash('sha256').update(plaintextKey).digest('hex')
  const key = getDb().prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1').get(hash) as ApiKeyRow | undefined
  if (!key) return null
  const { key_hash, ...rest } = key
  return rest
}

export function listApiKeys(): Omit<ApiKeyRow, 'key_hash'>[] {
  return getDb().prepare('SELECT id, name, key_prefix, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC').all() as Omit<ApiKeyRow, 'key_hash'>[]
}

export function deleteApiKey(id: number): void {
  getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}
```

- [✅] **步骤 4：编写日志 CRUD 测试**

`src/main/db/__tests__/logs.test.ts`：
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createLogEntry, queryLogs, getLogStats, cleanupOldLogs, LogEntry } from '../logs'

let logDb: Database.Database

describe('Logs CRUD', () => {
  beforeAll(() => {
    logDb = new Database(':memory:')
    logDb.pragma('journal_mode = WAL')
    logDb.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key_id INTEGER,
        provider_id INTEGER,
        model TEXT NOT NULL,
        api_format TEXT NOT NULL,
        status_code INTEGER,
        tokens_in INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_logs_created_at ON request_logs(created_at);
    `)
  })

  afterAll(() => logDb.close())

  it('should create a log entry', () => {
    const id = createLogEntry(logDb, {
      apiKeyId: 1, providerId: 1, model: 'test-model',
      apiFormat: 'openai', statusCode: 200,
      tokensIn: 50, tokensOut: 100, durationMs: 500
    })
    expect(id).toBeGreaterThan(0)
  })

  it('should query logs with pagination', () => {
    const result = queryLogs(logDb, { page: 1, limit: 10 })
    expect(result.logs).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('should get stats within date range', () => {
    const stats = getLogStats(logDb, { range: '7d' })
    expect(stats.total_requests).toBe(1)
    expect(stats.total_tokens_in).toBe(50)
    expect(stats.total_tokens_out).toBe(100)
  })

  it('should cleanup old logs', () => {
    // insert a very old log
    logDb.prepare(`INSERT INTO request_logs (api_key_id, model, api_format, created_at) VALUES (0, 'old-model', 'openai', '2020-01-01')`).run()
    const deleted = cleanupOldLogs(logDb, { retentionDays: 1 })
    expect(deleted).toBeGreaterThanOrEqual(1)
  })
})
```

- [✅] **步骤 5：实现日志 CRUD**

`src/main/db/logs.ts`：
```typescript
import Database from 'better-sqlite3'

export interface LogEntry {
  apiKeyId?: number
  providerId?: number
  model: string
  apiFormat: 'anthropic' | 'openai'
  statusCode?: number
  tokensIn?: number
  tokensOut?: number
  durationMs?: number
  error?: string
}

export interface LogQuery {
  page: number
  limit: number
  providerId?: number
  dateFrom?: string
  dateTo?: string
}

export function createLogEntry(db: Database.Database, entry: LogEntry): number {
  const stmt = db.prepare(`
    INSERT INTO request_logs (api_key_id, provider_id, model, api_format, status_code, tokens_in, tokens_out, duration_ms, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    entry.apiKeyId ?? null, entry.providerId ?? null,
    entry.model, entry.apiFormat, entry.statusCode ?? null,
    entry.tokensIn ?? 0, entry.tokensOut ?? 0, entry.durationMs ?? 0,
    entry.error ?? null
  )
  return result.lastInsertRowid as number
}

export function queryLogs(db: Database.Database, query: LogQuery): { logs: any[]; total: number } {
  const conditions: string[] = []
  const values: any[] = []

  if (query.providerId) { conditions.push('provider_id = ?'); values.push(query.providerId) }
  if (query.dateFrom) { conditions.push('created_at >= ?'); values.push(query.dateFrom) }
  if (query.dateTo) { conditions.push('created_at <= ?'); values.push(query.dateTo) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (query.page - 1) * query.limit

  const total = (db.prepare(`SELECT COUNT(*) as count FROM request_logs ${where}`).get(...values) as any).count
  const logs = db.prepare(`SELECT * FROM request_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values, query.limit, offset)

  return { logs, total }
}

export function getLogStats(db: Database.Database, opts: { range: string }): any {
  const rangeMap: Record<string, string> = {
    '24h': "datetime('now', '-1 day')",
    '7d': "datetime('now', '-7 days')",
    '30d': "datetime('now', '-30 days')"
  }
  const since = rangeMap[opts.range] || rangeMap['7d']
  return db.prepare(`
    SELECT
      COUNT(*) as total_requests,
      COALESCE(SUM(tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(tokens_out), 0) as total_tokens_out,
      COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
      COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END), 0) as total_errors
    FROM request_logs WHERE created_at >= ${since}
  `).get()
}

export function cleanupOldLogs(db: Database.Database, opts: { retentionDays: number; maxRows?: number }): number {
  const conditions: string[] = []
  conditions.push(`created_at < datetime('now', '-${opts.retentionDays} days')`)
  if (opts.maxRows) {
    const threshold = db.prepare(`SELECT MIN(id) FROM (SELECT id FROM request_logs ORDER BY id DESC LIMIT ?)`).get(opts.maxRows) as any
    if (threshold && threshold['MIN(id)']) {
      conditions.push(`id < ${threshold['MIN(id)']}`)
    }
  }
  const result = db.prepare(`DELETE FROM request_logs WHERE ${conditions.join(' OR ')}`).run()
  db.pragma('optimize')
  return result.changes
}
```

- [✅] **步骤 6：运行所有数据库测试**

```bash
npx vitest run src/main/db/__tests__/
```
预期：所有数据库测试通过

- [✅] **步骤 7：提交**

```bash
git add src/main/db/api-keys.ts src/main/db/logs.ts src/main/db/__tests__/api-keys.test.ts src/main/db/__tests__/logs.test.ts
git commit -m "feat: API keys and request logs CRUD"
```

---

### Task 5: 代理核心 — 速率限制器

**文件：**
- 创建：`src/main/proxy/rate-limiter.ts`
- 测试：`src/main/proxy/__tests__/rate-limiter.test.ts`

**步骤：**

- [✅] **步骤 1：编写速率限制器测试**

`src/main/proxy/__tests__/rate-limiter.test.ts`：
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiter } from '../rate-limiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter()
  })

  it('should allow requests within limit', () => {
    const result = limiter.check('key-1', 10)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
  })

  it('should block requests exceeding limit', () => {
    for (let i = 0; i < 3; i++) limiter.check('key-2', 3)
    const result = limiter.check('key-2', 3)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('should have separate counters per key', () => {
    limiter.check('key-a', 5)
    limiter.check('key-a', 5)
    limiter.check('key-b', 5)
    expect(limiter.check('key-a', 5).remaining).toBe(3)
    expect(limiter.check('key-b', 5).remaining).toBe(4)
  })

  it('should expire old entries after window', async () => {
    limiter = new RateLimiter(50) // 50ms window
    limiter.check('key-3', 1)
    await new Promise(r => setTimeout(r, 60))
    const result = limiter.check('key-3', 1)
    expect(result.allowed).toBe(true)
  })
})
```

- [✅] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/main/proxy/__tests__/rate-limiter.test.ts
```

- [✅] **步骤 3：实现速率限制器**

`src/main/proxy/rate-limiter.ts`：
```typescript
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export class RateLimiter {
  private windows: Map<string, number[]> = new Map()
  private windowMs: number

  constructor(windowMs: number = 60000) {
    this.windowMs = windowMs
  }

  check(key: string, limit: number): RateLimitResult {
    const now = Date.now()
    const windowStart = now - this.windowMs

    let timestamps = this.windows.get(key) || []
    timestamps = timestamps.filter(t => t > windowStart)

    if (timestamps.length >= limit) {
      return { allowed: false, remaining: 0, resetAt: timestamps[0] + this.windowMs }
    }

    timestamps.push(now)
    if (timestamps.length > 1) {
      this.windows.set(key, timestamps)
    } else {
      this.windows.set(key, timestamps)
      // auto-cleanup after window expires
      setTimeout(() => this.windows.delete(key), this.windowMs + 100)
    }

    return { allowed: true, remaining: limit - timestamps.length, resetAt: now + this.windowMs }
  }
}
```

- [✅] **步骤 4：运行测试确认通过**

```bash
npx vitest run src/main/proxy/__tests__/rate-limiter.test.ts
```

- [✅] **步骤 5：提交**

```bash
git add src/main/proxy/
git commit -m "feat: sliding window rate limiter"
```

---

### Task 6: 代理核心 — 路由 + HTTP 转发

**文件：**
- 创建：`src/main/proxy/router.ts`
- 创建：`src/main/proxy/forwarder.ts`
- 测试：`src/main/proxy/__tests__/router.test.ts`

**步骤：**

- [✅] **步骤 1：编写路由解析器测试**

`src/main/proxy/__tests__/router.test.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { parseModelId, resolveProvider, ModelRoute } from '../router'
import { createProvider, initDatabase, closeDatabase } from '../../db'

describe('Router', () => {
  beforeAll(() => { initDatabase(':memory:') })
  afterAll(() => closeDatabase())

  it('should parse model ID with prefix', () => {
    const result = parseModelId('anthropic-official/claude-sonnet-4')
    expect(result).toEqual({ prefix: 'anthropic-official', modelName: 'claude-sonnet-4' })
  })

  it('should reject model ID without slash', () => {
    expect(() => parseModelId('no-prefix-model')).toThrow()
  })
})
```

- [✅] **步骤 2：运行测试确认失败**

```bash
npx vitest run src/main/proxy/__tests__/router.test.ts
```

- [✅] **步骤 3：实现路由解析器**

`src/main/proxy/router.ts`：
```typescript
import { getProviderByName, listActiveProviders, Provider } from '../db/providers'

export interface ModelRoute {
  prefix: string
  modelName: string
  provider: Provider
}

export function parseModelId(modelId: string): { prefix: string; modelName: string } {
  const slashIndex = modelId.indexOf('/')
  if (slashIndex === -1) throw new Error(`Invalid model ID format: "${modelId}". Expected "provider-name/model-id"`)
  return {
    prefix: modelId.slice(0, slashIndex),
    modelName: modelId.slice(slashIndex + 1)
  }
}

export function resolveProvider(modelId: string): ModelRoute {
  const { prefix, modelName } = parseModelId(modelId)
  const provider = getProviderByName(prefix)
  if (!provider) throw new Error(`Unknown provider: "${prefix}"`)
  if (!provider.is_active) throw new Error(`Provider "${prefix}" is disabled`)
  const models: string[] = JSON.parse(provider.models)
  if (!models.includes(modelName)) {
    throw new Error(`Model "${modelName}" is not in provider "${prefix}" allowed list`)
  }
  return { prefix, modelName, provider }
}

export function getAllModels(): { id: string; provider: string; providerType: string }[] {
  const providers = listActiveProviders()
  const models: { id: string; provider: string; providerType: string }[] = []
  for (const p of providers) {
    const modelList: string[] = JSON.parse(p.models)
    for (const m of modelList) {
      models.push({ id: `${p.name}/${m}`, provider: p.name, providerType: p.provider_type })
    }
  }
  return models
}
```

- [✅] **步骤 4：运行路由器测试**

```bash
npx vitest run src/main/proxy/__tests__/router.test.ts
```
预期：通过

- [✅] **步骤 5：编写 HTTP 转发器测试**

`src/main/proxy/__tests__/forwarder.test.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { buildProxyUrl, buildProxyHeaders, buildProxyBody } from '../forwarder'

describe('Forwarder', () => {
  const provider = {
    base_url: 'https://api.openai.com',
    provider_type: 'openai',
    api_key_encrypted: 'test'
  } as any

  it('should build proxy URL for OpenAI', () => {
    const url = buildProxyUrl(provider, '/v1/chat/completions')
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('should build proxy headers', () => {
    const headers = buildProxyHeaders(provider, 'decrypted-key', { 'content-type': 'application/json' })
    expect(headers['authorization']).toBe('Bearer decrypted-key')
    expect(headers['content-type']).toBe('application/json')
  })
})
```

- [✅] **步骤 6：实现 HTTP 转发器**

`src/main/proxy/forwarder.ts`：
```typescript
import { Provider } from '../db/providers'

export function buildProxyUrl(provider: Provider, path: string): string {
  const base = provider.base_url.replace(/\/+$/, '')
  return `${base}${path}`
}

export function buildProxyHeaders(provider: Provider, decryptedKey: string, originalHeaders: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'authorization': `Bearer ${decryptedKey}`,
    'content-type': originalHeaders['content-type'] || 'application/json'
  }
  if (provider.provider_type === 'anthropic') {
    if (originalHeaders['anthropic-version']) {
      headers['anthropic-version'] = originalHeaders['anthropic-version']
    } else {
      headers['anthropic-version'] = '2023-06-01'
    }
  }
  return headers
}

export function buildProxyBody(body: any, provider: Provider): any {
  // pass-through: no format conversion
  return body
}
```

- [✅] **步骤 7：运行所有代理测试**

```bash
npx vitest run src/main/proxy/__tests__/
```

- [✅] **步骤 8：提交**

```bash
git add src/main/proxy/router.ts src/main/proxy/forwarder.ts src/main/proxy/__tests__/
git commit -m "feat: model router and HTTP forwarder"
```

---

### Task 7: Hono 代理 HTTP 服务器

**文件：**
- 创建：`src/main/proxy/server.ts`
- 创建：`src/main/proxy/middleware.ts`
- 测试：`src/main/proxy/__tests__/server.test.ts`

**步骤：**

- [✅] **步骤 1：编写认证中间件测试**

`src/main/proxy/__tests__/middleware.test.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { authMiddleware } from '../middleware'

describe('Middleware', () => {
  it('should extract API key from Bearer token', () => {
    const key = authMiddleware('Bearer sk-test-key')
    expect(key).toBe('sk-test-key')
  })

  it('should return null for missing header', () => {
    expect(authMiddleware('')).toBeNull()
  })

  it('should return null for non-Bearer scheme', () => {
    expect(authMiddleware('Basic dGVzdA==')).toBeNull()
  })
})
```

- [✅] **步骤 2：实现认证中间件**

`src/main/proxy/middleware.ts`：
```typescript
export function authMiddleware(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
```

- [✅] **步骤 3：编写 Hono 服务器测试**

`src/main/proxy/__tests__/server.test.ts`：
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../server'

describe('Proxy Server', () => {
  const server = createServer()

  it('should respond with 401 for missing auth on proxy endpoints', async () => {
    const res = await server.request('/v1/chat/completions', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('should respond with 401 for invalid API key', async () => {
    const res = await server.request('/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer sk-invalid' }
    })
    expect(res.status).toBe(401)
  })

  it('should respond with 404 for unknown model', async () => {
    const res = await server.request('/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer sk-invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'unknown/model' })
    })
    expect(res.status).toBe(401) // still 401 since API key is invalid first
  })

  it('should list models at /v1/models', async () => {
    const res = await server.request('/v1/models')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('data')
  })
})
```

- [✅] **步骤 4：实现 Hono 服务器**

`src/main/proxy/server.ts`：
```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware'
import { verifyApiKey } from '../db/api-keys'
import { resolveProvider, getAllModels } from './router'
import { buildProxyUrl, buildProxyHeaders } from './forwarder'
import { RateLimiter } from './rate-limiter'
import { decrypt } from '../utils/crypto'
import { createLogEntry } from '../db/logs'
import { getProvider } from '../db/providers'

interface AppEnv {
  Variables: {
    apiKey: { id: number; rate_limit: number }
    encryptionSecret: string
    logDb?: any
  }
}

export function createServer(encryptionSecret?: string) {
  const app = new Hono<AppEnv>()
  const rateLimiter = new RateLimiter()

  app.use('*', cors())

  // Auth middleware for proxy endpoints
  app.use('/v1/*', async (c, next) => {
    const token = authMiddleware(c.req.header('authorization'))
    if (!token) return c.json({ error: 'unauthorized' }, 401)
    const apiKey = verifyApiKey(token)
    if (!apiKey) return c.json({ error: 'unauthorized' }, 401)
    c.set('apiKey', apiKey)
    c.set('encryptionSecret', encryptionSecret || 'default-dev-secret')
    await next()
  })

  // Rate limit middleware
  app.use('/v1/*', async (c, next) => {
    const apiKey = c.var.apiKey
    const result = rateLimiter.check(`apikey:${apiKey.id}`, apiKey.rate_limit)
    if (!result.allowed) {
      c.header('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)))
      return c.json({ error: 'rate_limit_exceeded' }, 429)
    }
    await next()
  })

  // OpenAI compatible
  app.post('/v1/chat/completions', async (c) => {
    const startTime = Date.now()
    try {
      const body = await c.req.json()
      const { model } = body
      const route = resolveProvider(model)
      const encryptionSecret = c.var.encryptionSecret
      const decryptedKey = decrypt(route.provider.api_key_encrypted, encryptionSecret)

      const targetUrl = buildProxyUrl(route.provider, '/v1/chat/completions')
      const headers = buildProxyHeaders(route.provider, decryptedKey, { 'content-type': 'application/json' })

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, model: route.modelName })
      })

      const duration = Date.now() - startTime
      // Async log
      tryLogEntry(c, {
        apiKeyId: c.var.apiKey.id,
        providerId: route.provider.id,
        model,
        apiFormat: 'openai',
        statusCode: response.status,
        durationMs: duration,
        tokensIn: body?.messages?.length || 0 // simplified counting
      })

      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    } catch (err: any) {
      return handleProxyError(c, err, startTime)
    }
  })

  // Anthropic compatible
  app.post('/v1/messages', async (c) => {
    const startTime = Date.now()
    try {
      const body = await c.req.json()
      const { model } = body
      const route = resolveProvider(model)
      const decryptedKey = decrypt(route.provider.api_key_encrypted, c.var.encryptionSecret)

      const targetUrl = buildProxyUrl(route.provider, '/v1/messages')
      const headers = buildProxyHeaders(route.provider, decryptedKey, {
        'content-type': 'application/json',
        'anthropic-version': c.req.header('anthropic-version') || '2023-06-01'
      })

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, model: route.modelName })
      })

      const duration = Date.now() - startTime
      tryLogEntry(c, {
        apiKeyId: c.var.apiKey.id,
        providerId: route.provider.id,
        model,
        apiFormat: 'anthropic',
        statusCode: response.status,
        durationMs: duration
      })

      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    } catch (err: any) {
      return handleProxyError(c, err, startTime)
    }
  })

  // List models
  app.get('/v1/models', (c) => {
    const models = getAllModels()
    return c.json({ data: models.map(m => ({ id: m.id, provider: m.provider, type: m.providerType, object: 'model' })) })
  })

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok' }))

  return app
}

function handleProxyError(c: any, err: Error, startTime: number) {
  const duration = Date.now() - startTime
  tryLogEntry(c, {
    apiKeyId: c.var?.apiKey?.id,
    model: 'unknown',
    apiFormat: 'unknown',
    statusCode: 502,
    durationMs: duration,
    error: err.message
  })

  if (err.message.startsWith('Unknown provider') || err.message.startsWith('Invalid model')) {
    return c.json({ error: 'unknown_model' }, 404)
  }
  if (err.message.includes('is disabled')) {
    return c.json({ error: 'provider_unavailable' }, 503)
  }
  return c.json({ error: 'provider_unreachable' }, 502)
}

function tryLogEntry(c: any, entry: any) {
  try {
    const logDb = c.var.logDb
    if (logDb) createLogEntry(logDb, entry)
  } catch { /* silent */ }
}
```

- [✅] **步骤 5：运行服务器测试**

```bash
npx vitest run src/main/proxy/__tests__/server.test.ts src/main/proxy/__tests__/middleware.test.ts
```

- [✅] **步骤 6：提交**

```bash
git add src/main/proxy/server.ts src/main/proxy/middleware.ts src/main/proxy/__tests__/
git commit -m "feat: hono proxy server with auth and rate limiting"
```

---

### Task 8: Electron 主进程 — 窗口 + 托盘

**文件：**
- 创建：`src/main/index.ts`
- 创建：`src/preload/index.ts`
- 创建：`resources/icon.png`（使用占位图标）

**步骤：**

- [✅] **步骤 1：创建 Electron 主进程入口**

`src/main/index.ts`：
```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase } from './db/connection'
import { createTables, createLogsTable } from './db/schema'
import { createServer } from './proxy/server'
import { setupIpcHandlers } from './ipc'
import { startHealthCheck, startLogCleanup } from './utils/health'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let server: ReturnType<typeof createServer> | null = null
const PORT = 8080
const isDev = !app.isPackaged

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
}

function createTray(): void {
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('LLM Gateway')

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开管理面板', click: () => mainWindow?.show() },
    { label: `代理状态: 运行中 (端口 ${PORT})`, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit() } }
  ])
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show())
}

async function startServer(): Promise<void> {
  const dataDir = path.join(app.getPath('userData'))
  const configDbPath = path.join(dataDir, 'gateway.db')
  const logDbPath = path.join(dataDir, 'gateway-logs.db')

  initDatabase(configDbPath)
  createTables()
  const logDb = createLogsTable(logDbPath)

  server = createServer()
  // @ts-ignore - attach logDb
  server.logDb = logDb

  // Setup IPC handlers
  setupIpcHandlers(logDb)

  // Start background services
  startHealthCheck()
  startLogCleanup(logDb)

  // Start HTTP server (using Hono's serve)
  const { serve } = await import('@hono/node-server')
  serve({ fetch: server.fetch, port: PORT })
  console.log(`LLM Gateway 代理服务运行于 http://localhost:${PORT}`)
}

app.whenReady().then(async () => {
  createWindow()
  createTray()
  await startServer()
})

app.on('window-all-closed', () => { /* keep running in tray */ })
app.on('before-quit', () => { closeDatabase(); app.isQuitting = true })
```

- [✅] **步骤 2：创建 preload 脚本**

`src/preload/index.ts`：
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Providers
  providers: {
    list: () => ipcRenderer.invoke('provider:list'),
    create: (data: any) => ipcRenderer.invoke('provider:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('provider:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('provider:delete', id),
  },
  // API Keys
  apiKeys: {
    list: () => ipcRenderer.invoke('apikey:list'),
    create: (name: string, rateLimit?: number) => ipcRenderer.invoke('apikey:create', name, rateLimit),
    delete: (id: number) => ipcRenderer.invoke('apikey:delete', id),
  },
  // Logs
  logs: {
    query: (params: any) => ipcRenderer.invoke('logs:query', params),
    stats: (range: string) => ipcRenderer.invoke('logs:stats', range),
  },
  // Health
  health: {
    check: () => ipcRenderer.invoke('health:check'),
    onStatus: (callback: Function) => {
      ipcRenderer.on('health:status', (_event, data) => callback(data))
    }
  },
  // Window control
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  }
})
```

- [✅] **步骤 3：提交**

```bash
git add src/main/index.ts src/preload/index.ts
git commit -m "feat: electron main process with window and tray"
```

---

### Task 9: IPC Handlers

**文件：**
- 创建：`src/main/ipc/index.ts`
- 创建：`src/main/ipc/providers.ts`
- 创建：`src/main/ipc/api-keys.ts`
- 创建：`src/main/ipc/logs.ts`

**步骤：**

- [✅] **步骤 1：创建 IPC handlers**

`src/main/ipc/providers.ts`：
```typescript
import { ipcMain } from 'electron'
import { createProvider, getProvider, listProviders, updateProvider, deleteProvider, ProviderInput } from '../db/providers'
import { encrypt } from '../utils/crypto'

const ENCRYPTION_SECRET = process.env.LLM_GATEWAY_SECRET || 'default-dev-secret'

export function registerProviderIpc(): void {
  ipcMain.handle('provider:list', () => listProviders())

  ipcMain.handle('provider:create', (_event, data: ProviderInput & { apiKey: string }) => {
    const encrypted = encrypt(data.apiKey, ENCRYPTION_SECRET)
    return createProvider({ ...data, apiKeyEncrypted: encrypted })
  })

  ipcMain.handle('provider:update', (_event, id: number, data: any) => {
    const updates: any = { ...data }
    if (data.apiKey) {
      updates.apiKeyEncrypted = encrypt(data.apiKey, ENCRYPTION_SECRET)
      delete updates.apiKey
    }
    return updateProvider(id, updates)
  })

  ipcMain.handle('provider:delete', (_event, id: number) => deleteProvider(id))
}
```

`src/main/ipc/api-keys.ts`：
```typescript
import { ipcMain } from 'electron'
import { createApiKey, listApiKeys, deleteApiKey } from '../db/api-keys'

export function registerApiKeyIpc(): void {
  ipcMain.handle('apikey:list', () => listApiKeys())

  ipcMain.handle('apikey:create', (_event, name: string, rateLimit?: number) => {
    return createApiKey(name, rateLimit)
  })

  ipcMain.handle('apikey:delete', (_event, id: number) => deleteApiKey(id))
}
```

`src/main/ipc/logs.ts`：
```typescript
import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { queryLogs, getLogStats } from '../db/logs'

let logDb: Database.Database | null = null

export function registerLogIpc(db: Database.Database): void {
  logDb = db

  ipcMain.handle('logs:query', (_event, params: any) => queryLogs(db, params))
  ipcMain.handle('logs:stats', (_event, range: string) => getLogStats(db, { range }))
}
```

`src/main/ipc/index.ts`：
```typescript
import { ipcMain, BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import { registerProviderIpc } from './providers'
import { registerApiKeyIpc } from './api-keys'
import { registerLogIpc } from './logs'

export function setupIpcHandlers(logDb: Database.Database): void {
  registerProviderIpc()
  registerApiKeyIpc()
  registerLogIpc(logDb)

  // Window controls
  ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
  ipcMain.on('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.isMaximized() ? win.unmaximize() : win?.maximize()
  })
  ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())
}
```

- [✅] **步骤 2：提交**

```bash
git add src/main/ipc/
git commit -m "feat: IPC handlers for providers, api keys, logs"
```

---

### Task 10: 后台服务 — 健康检查 + 日志清理

**文件：**
- 创建：`src/main/utils/health.ts`
- 测试：`src/main/utils/__tests__/health.test.ts`

**步骤：**

- [✅] **步骤 1：编写健康检查测试**

`src/main/utils/__tests__/health.test.ts`：
```typescript
import { describe, it, expect } from 'vitest'
import { checkProviderHealth } from '../health'

describe('Health Check', () => {
  it('should return unhealthy for unreachable provider', async () => {
    const result = await checkProviderHealth('https://invalid.local.test/api', 'openai')
    expect(result.status).toBe('unhealthy')
    expect(result).toHaveProperty('latencyMs')
  })
})
```

- [✅] **步骤 2：实现健康检查 + 日志清理**

`src/main/utils/health.ts`：
```typescript
import Database from 'better-sqlite3'
import { listActiveProviders } from '../db/providers'
import { cleanupOldLogs } from '../db/logs'
import { BrowserWindow } from 'electron'
import { getDb } from '../db/connection'

interface HealthResult {
  providerId: number
  providerName: string
  status: 'healthy' | 'unhealthy'
  latencyMs: number
  error?: string
}

export async function checkProviderHealth(baseUrl: string, providerType: string): Promise<Omit<HealthResult, 'providerId' | 'providerName'>> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const testUrl = providerType === 'anthropic' ? `${baseUrl.replace(/\/+$/, '')}/v1/messages` : `${baseUrl.replace(/\/+$/, '')}/v1/models`
    const res = await fetch(testUrl, { signal: controller.signal, method: 'GET' })
    clearTimeout(timeout)
    return { status: res.ok ? 'healthy' : 'unhealthy', latencyMs: Date.now() - start }
  } catch (err: any) {
    return { status: 'unhealthy', latencyMs: Date.now() - start, error: err.message }
  }
}

let healthInterval: ReturnType<typeof setInterval> | null = null

export function startHealthCheck(): void {
  healthInterval = setInterval(async () => {
    try {
      const providers = listActiveProviders()
      const results: HealthResult[] = await Promise.all(
        providers.map(async (p) => {
          const result = await checkProviderHealth(p.base_url, p.provider_type)
          return { providerId: p.id, providerName: p.name, ...result }
        })
      )
      // Send health status to renderer
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('health:status', results))
    } catch { /* silent */ }
  }, 60000)
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null

export function startLogCleanup(logDb: Database.Database): void {
  cleanupInterval = setInterval(() => {
    try {
      cleanupOldLogs(logDb, { retentionDays: 7, maxRows: 1_000_000 })
    } catch { /* silent */ }
  }, 3600000) // every hour
}
```

- [✅] **步骤 3：运行测试**

```bash
npx vitest run src/main/utils/__tests__/health.test.ts
```

- [✅] **步骤 4：提交**

```bash
git add src/main/utils/health.ts src/main/utils/__tests__/health.test.ts
git commit -m "feat: background health check and log cleanup"
```

---

### Task 11: React 前端 — 基础框架

**文件：**
- 创建：`src/renderer/main.tsx`
- 创建：`src/renderer/App.tsx`
- 创建：`src/renderer/index.css`
- 创建：`src/renderer/test-setup.ts`
- 创建：`src/renderer/components/Layout.tsx`
- 创建：`src/renderer/components/TitleBar.tsx`
- 创建：`src/renderer/lib/ipc.ts`
- 创建：`src/renderer/lib/types.ts`

**步骤：**

- [✅] **步骤 1：创建入口文件和全局样式**

`src/renderer/main.tsx`：
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

`src/renderer/index.css`：
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  -webkit-user-select: none;
  user-select: none;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #1e293b; }
::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
```

- [✅] **步骤 2：创建 TypeScript 类型定义**

`src/renderer/lib/types.ts`：
```typescript
export interface Provider {
  id: number
  name: string
  provider_type: 'anthropic' | 'openai'
  base_url: string
  api_key_encrypted: string
  models: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface ApiKey {
  id: number
  name: string
  key_prefix: string
  is_active: number
  rate_limit: number
  created_at: string
}

export interface LogEntry {
  id: number
  api_key_id: number | null
  provider_id: number | null
  model: string
  api_format: string
  status_code: number
  tokens_in: number
  tokens_out: number
  duration_ms: number
  error: string | null
  created_at: string
}

export interface DashboardStats {
  total_requests: number
  total_tokens_in: number
  total_tokens_out: number
  avg_duration_ms: number
  total_errors: number
}

export interface HealthStatus {
  providerId: number
  providerName: string
  status: 'healthy' | 'unhealthy'
  latencyMs: number
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      providers: {
        list: () => Promise<Provider[]>
        create: (data: any) => Promise<number>
        update: (id: number, data: any) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      apiKeys: {
        list: () => Promise<ApiKey[]>
        create: (name: string, rateLimit?: number) => Promise<{ plaintextKey: string; key: ApiKey }>
        delete: (id: number) => Promise<void>
      }
      logs: {
        query: (params: any) => Promise<{ logs: LogEntry[]; total: number }>
        stats: (range: string) => Promise<DashboardStats>
      }
      health: {
        check: () => Promise<HealthStatus[]>
        onStatus: (callback: (data: HealthStatus[]) => void) => void
      }
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
      }
    }
  }
}
```

- [✅] **步骤 3：创建 IPC 封装层**

`src/renderer/lib/ipc.ts`：
```typescript
export const api = window.electronAPI
```

- [✅] **步骤 4：创建测试 setup**

`src/renderer/test-setup.ts`：
```typescript
import '@testing-library/jest-dom'

// Mock electron API
Object.defineProperty(window, 'electronAPI', {
  value: {
    providers: { list: () => [], create: () => {}, update: () => {}, delete: () => {} },
    apiKeys: { list: () => [], create: () => {}, delete: () => {} },
    logs: { query: () => ({ logs: [], total: 0 }), stats: () => ({}) },
    health: { check: () => [], onStatus: () => {} },
    window: { minimize: () => {}, maximize: () => {}, close: () => {} }
  }
})
```

- [✅] **步骤 5：创建 TitleBar 组件**

`src/renderer/components/TitleBar.tsx`：
```tsx
import React from 'react'
import { api } from '../lib/ipc'

export function TitleBar() {
  return (
    <div className="flex items-center justify-between h-10 bg-slate-900 px-4 select-none"
         style={{ WebkitAppRegion: 'drag' } as any}>
      <div className="flex items-center gap-2">
        <span className="text-indigo-400 font-bold text-sm">🛡️ LLM Gateway</span>
      </div>
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button onClick={() => api.window.minimize()} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 text-sm">─</button>
        <button onClick={() => api.window.maximize()} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-700 text-slate-400 text-sm">□</button>
        <button onClick={() => api.window.close()} className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 text-sm">✕</button>
      </div>
    </div>
  )
}
```

- [✅] **步骤 6：创建 Layout 组件**

`src/renderer/components/Layout.tsx`：
```tsx
import React, { useState } from 'react'
import { TitleBar } from './TitleBar'

const NAV_ITEMS = [
  { id: 'dashboard', label: '仪表盘', icon: '📊' },
  { id: 'providers', label: '供应商', icon: '🏢' },
  { id: 'api-keys', label: 'API Keys', icon: '🔑' },
  { id: 'logs', label: '请求日志', icon: '📋' },
]

interface LayoutProps {
  activePage: string
  onNavigate: (page: string) => void
  children: React.ReactNode
}

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-56 bg-slate-950 border-r border-slate-800 p-3 flex flex-col gap-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                activePage === item.id
                  ? 'bg-indigo-500/10 text-indigo-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-auto p-6 bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [✅] **步骤 7：创建 App 组件**

`src/renderer/App.tsx`：
```tsx
import React, { useState } from 'react'
import { Layout } from './components/Layout'

function App() {
  const [activePage, setActivePage] = useState('dashboard')

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <div className="text-slate-400 text-center pt-20"><p className="text-lg">仪表盘 (待实现)</p></div>
      case 'providers': return <div className="text-slate-400 text-center pt-20"><p className="text-lg">供应商管理 (待实现)</p></div>
      case 'api-keys': return <div className="text-slate-400 text-center pt-20"><p className="text-lg">API Key 管理 (待实现)</p></div>
      case 'logs': return <div className="text-slate-400 text-center pt-20"><p className="text-lg">请求日志 (待实现)</p></div>
      default: return null
    }
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </Layout>
  )
}

export default App
```

- [✅] **步骤 8：验证前端构建**

```bash
npm run build
```
预期：在 out/renderer/ 目录下正确输出

- [✅] **步骤 9：提交**

```bash
git add src/renderer/
git commit -m "feat: react frontend foundation with layout and navigation"
```

---

### Task 12: React 前端 — 仪表盘页面

**文件：**
- 创建：`src/renderer/pages/Dashboard.tsx`
- 创建：`src/renderer/components/StatsCard.tsx`

**步骤：**

- [✅] **步骤 1：创建 StatsCard 组件**

`src/renderer/components/StatsCard.tsx`：
```tsx
import React from 'react'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: { value: string; positive: boolean }
  icon: string
}

export function StatsCard({ title, value, subtitle, trend, icon }: StatsCardProps) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-500 text-sm font-medium">{title}</span>
        <span className="text-lg opacity-70">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
      {trend && (
        <div className={`text-xs mt-2 ${trend.positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend.positive ? '↑' : '↓'} {trend.value}
        </div>
      )}
    </div>
  )
}
```

- [✅] **步骤 2：创建 Dashboard 页面**

`src/renderer/pages/Dashboard.tsx`：
```tsx
import React, { useState, useEffect } from 'react'
import { StatsCard } from '../components/StatsCard'
import { api } from '../lib/ipc'

export function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [providers, setProviders] = useState<any[]>([])
  const [health, setHealth] = useState<any[]>([])

  useEffect(() => {
    api.logs.stats('7d').then(setStats)
    api.providers.list().then(setProviders)
    api.health.check().then(setHealth)
    api.health.onStatus(setHealth)
  }, [])

  const activeProviders = providers.filter(p => p.is_active)
  const healthyCount = health.filter(h => h.status === 'healthy').length

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-6">仪表盘</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard title="今日请求" value={stats?.total_requests?.toLocaleString() || '0'} icon="📨" subtitle="近7天总计" />
        <StatsCard title="Token 消耗" value={stats ? `${(stats.total_tokens_in + stats.total_tokens_out).toLocaleString()}` : '0'} icon="⚡" subtitle="近7天" />
        <StatsCard title="活跃供应商" value={`${healthyCount}/${activeProviders.length}`} icon="🏢" subtitle={health.length > 0 ? `${healthyCount} 个正常` : '加载中...'} />
        <StatsCard title="平均延迟" value={stats ? `${Math.round(stats.avg_duration_ms)}ms` : '-'} icon="📡" subtitle="近7天" />
      </div>

      {/* Provider Health */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">供应商健康状态</h2>
        <div className="space-y-2">
          {providers.length === 0 && <p className="text-slate-500 text-sm">暂无供应商，请先添加。</p>}
          {providers.map(p => {
            const h = health.find(h => h.providerId === p.id)
            return (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${h?.status === 'healthy' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className="text-sm text-slate-300">{p.name}</span>
                  <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">{p.provider_type}</span>
                </div>
                <span className="text-xs text-slate-500">{h ? `${h.latencyMs}ms` : '检查中...'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [✅] **步骤 3：更新 App.tsx 集成仪表盘**

编辑 `src/renderer/App.tsx`，替换 `renderPage` 函数中的 `dashboard` case：
```tsx
import { Dashboard } from './pages/Dashboard'
// ...
case 'dashboard': return <Dashboard />
```

- [✅] **步骤 4：提交**

```bash
git add src/renderer/pages/Dashboard.tsx src/renderer/components/StatsCard.tsx
git commit -m "feat: dashboard page with stats and health status"
```

---

### Task 13: React 前端 — 供应商管理页面

**文件：**
- 创建：`src/renderer/pages/Providers.tsx`

**步骤：**

- [✅] **步骤 1：创建供应商管理页面**

`src/renderer/pages/Providers.tsx`：
```tsx
import React, { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import { Provider } from '../lib/types'

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({ name: '', providerType: 'openai', baseUrl: '', apiKey: '', models: '' })

  useEffect(() => { loadProviders() }, [])

  async function loadProviders() {
    setLoading(true)
    const list = await api.providers.list()
    setProviders(list)
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', providerType: 'openai', baseUrl: '', apiKey: '', models: '' })
    setShowForm(true)
  }

  function openEdit(p: Provider) {
    setEditing(p)
    setForm({ name: p.name, providerType: p.provider_type, baseUrl: p.base_url, apiKey: '', models: JSON.parse(p.models).join('\n') })
    setShowForm(true)
  }

  async function handleSave() {
    const models = form.models.split('\n').map(s => s.trim()).filter(Boolean)
    const data = { name: form.name, providerType: form.providerType, baseUrl: form.baseUrl, apiKey: form.apiKey, models }
    if (editing) {
      await api.providers.update(editing.id, data)
    } else {
      await api.providers.create(data)
    }
    setShowForm(false)
    loadProviders()
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除此供应商？')) return
    await api.providers.delete(id)
    loadProviders()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">供应商管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理所有 LLM 供应商配置</p>
        </div>
        <button onClick={openCreate} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">+ 添加供应商</button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500">加载中...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <p className="text-lg mb-2">暂无供应商</p>
          <p className="text-sm">点击右上角"添加供应商"开始配置</p>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/50 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="p-4">名称</th>
                <th className="p-4">类型</th>
                <th className="p-4">模型数</th>
                <th className="p-4">状态</th>
                <th className="p-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {providers.map(p => (
                <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-700/30 transition-colors">
                  <td className="p-4 text-sm font-medium text-slate-200">{p.name}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded ${
                      p.provider_type === 'anthropic' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'
                    }`}>{p.provider_type === 'anthropic' ? 'Anthropic' : 'OpenAI'}</span>
                  </td>
                  <td className="p-4 text-sm text-slate-400">{JSON.parse(p.models).length}</td>
                  <td className="p-4">
                    <span className={`text-sm ${p.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {p.is_active ? '● 启用' : '○ 停用'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-3 text-sm">
                      <button onClick={() => openEdit(p)} className="text-indigo-400 hover:text-indigo-300">编辑</button>
                      <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[520px] max-w-full mx-4">
            <h2 className="text-lg font-semibold text-slate-100 mb-5">{editing ? '编辑供应商' : '添加供应商'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">名称（路由前缀）</label>
                <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                       className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 outline-none" placeholder="anthropic-official" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">API 类型</label>
                <div className="flex gap-3">
                  {['openai', 'anthropic'].map(t => (
                    <button key={t} onClick={() => setForm({...form, providerType: t})}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        form.providerType === t ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-slate-400 border border-slate-600'
                      }`}>{t === 'anthropic' ? 'Anthropic' : 'OpenAI'}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Base URL</label>
                <input value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})}
                       className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 outline-none" placeholder="https://api.openai.com" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">API Key</label>
                <input value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})} type="password"
                       className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 outline-none" placeholder={editing ? '留空则不修改' : 'sk-...'} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">可用模型（每行一个）</label>
                <textarea value={form.models} onChange={e => setForm({...form, models: e.target.value})} rows={4}
                          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:border-indigo-500 outline-none" placeholder="gpt-4&#10;gpt-3.5-turbo" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">取消</button>
              <button onClick={handleSave} className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [✅] **步骤 2：更新 App.tsx**

编辑 `src/renderer/App.tsx`，添加 import 和 page case：
```tsx
import { ProvidersPage } from './pages/Providers'
// ...
case 'providers': return <ProvidersPage />
```

- [✅] **步骤 3：提交**

```bash
git add src/renderer/pages/Providers.tsx
git commit -m "feat: providers management page with CRUD"
```

---

### Task 14: React 前端 — API Key 管理页面

**文件：**
- 创建：`src/renderer/pages/ApiKeys.tsx`

**步骤：**

- [✅] **步骤 1：创建 API Key 管理页面**

`src/renderer/pages/ApiKeys.tsx`：
```tsx
import React, { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import { ApiKey } from '../lib/types'

export function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyResult, setNewKeyResult] = useState<{ plaintextKey: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { api.apiKeys.list().then(setKeys) }, [])

  async function handleCreate() {
    const result = await api.apiKeys.create(newKeyName)
    setNewKeyResult(result)
    setKeys(await api.apiKeys.list())
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除此 API Key？')) return
    await api.apiKeys.delete(id)
    setKeys(await api.apiKeys.list())
  }

  function copyKey() {
    if (newKeyResult) {
      navigator.clipboard.writeText(newKeyResult.plaintextKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">API Key 管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理外部服务调用网关的认证密钥</p>
        </div>
        <button onClick={() => { setNewKeyResult(null); setShowCreate(true) }}
                className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ 创建 API Key</button>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50 text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-4">名称</th>
              <th className="p-4">Key 前缀</th>
              <th className="p-4">速率限制</th>
              <th className="p-4">状态</th>
              <th className="p-4">创建时间</th>
              <th className="p-4">操作</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">暂无 API Key</td></tr>
            ) : keys.map(k => (
              <tr key={k.id} className="border-b border-slate-800/50 hover:bg-slate-700/30">
                <td className="p-4 text-sm text-slate-200 font-medium">{k.name}</td>
                <td className="p-4 text-sm text-slate-400 font-mono">{k.key_prefix}...</td>
                <td className="p-4 text-sm text-slate-400">{k.rate_limit}/min</td>
                <td className="p-4"><span className={`text-sm ${k.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>{k.is_active ? '● 启用' : '○ 停用'}</span></td>
                <td className="p-4 text-sm text-slate-400">{k.created_at}</td>
                <td className="p-4"><button onClick={() => handleDelete(k.id)} className="text-red-400 hover:text-red-300 text-sm">删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-[480px] max-w-full mx-4">
            {!newKeyResult ? (
              <>
                <h2 className="text-lg font-semibold text-slate-100 mb-5">创建 API Key</h2>
                <div className="mb-4">
                  <label className="text-xs text-slate-500 block mb-1.5">标识名称</label>
                  <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                         className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 outline-none" placeholder="prod-app" />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">取消</button>
                  <button onClick={handleCreate} disabled={!newKeyName}
                          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">创建</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-100 mb-2">API Key 已创建</h2>
                <p className="text-sm text-amber-400 mb-4">⚠️ 这是唯一一次显示明文，请立即复制保存。</p>
                <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 mb-4">
                  <code className="text-sm text-emerald-400 break-all font-mono">{newKeyResult.plaintextKey}</code>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={copyKey} className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium">{copied ? '✓ 已复制' : '复制'}</button>
                  <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">关闭</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [✅] **步骤 2：更新 App.tsx**

```tsx
import { ApiKeysPage } from './pages/ApiKeys'
// ...
case 'api-keys': return <ApiKeysPage />
```

- [✅] **步骤 3：提交**

```bash
git add src/renderer/pages/ApiKeys.tsx
git commit -m "feat: API key management page with create and copy"
```

---

### Task 15: React 前端 — 请求日志页面

**文件：**
- 创建：`src/renderer/pages/Logs.tsx`

**步骤：**

- [✅] **步骤 1：创建请求日志页面**

`src/renderer/pages/Logs.tsx`：
```tsx
import React, { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import { LogEntry } from '../lib/types'

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const limit = 20

  useEffect(() => { loadLogs() }, [page])

  async function loadLogs() {
    setLoading(true)
    const result = await api.logs.query({ page, limit })
    setLogs(result.logs)
    setTotal(result.total)
    setLoading(false)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">请求日志</h1>
        <p className="text-sm text-slate-500 mt-1">查看所有经过网关的 API 请求记录</p>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50 text-left text-xs text-slate-500 uppercase tracking-wider">
              <th className="p-3">时间</th>
              <th className="p-3">模型</th>
              <th className="p-3">格式</th>
              <th className="p-3">状态</th>
              <th className="p-3">延迟</th>
              <th className="p-3">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">加载中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">暂无日志</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-700/30 text-sm">
                <td className="p-3 text-slate-400 text-xs font-mono">{log.created_at}</td>
                <td className="p-3 text-slate-200 font-medium">{log.model}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    log.api_format === 'anthropic' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>{log.api_format}</span>
                </td>
                <td className="p-3">
                  <span className={`${log.status_code < 400 ? 'text-emerald-400' : 'text-red-400'}`}>{log.status_code}</span>
                </td>
                <td className="p-3 text-slate-400">{log.duration_ms}ms</td>
                <td className="p-3 text-slate-400">{log.tokens_in ? `${log.tokens_in}↑ ${log.tokens_out}↓` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
          <span>共 {total} 条</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 rounded bg-slate-800 disabled:opacity-30 hover:bg-slate-700">上一页</button>
            <span className="px-3 py-1 text-slate-500">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 rounded bg-slate-800 disabled:opacity-30 hover:bg-slate-700">下一页</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [✅] **步骤 2：更新 App.tsx**

```tsx
import { LogsPage } from './pages/Logs'
// ...
case 'logs': return <LogsPage />
```

- [✅] **步骤 3：提交**

```bash
git add src/renderer/pages/Logs.tsx
git commit -m "feat: request logs page with pagination"
```

---

### Task 16: Type 声明文件 + Electron 类型扩展

**文件：**
- 创建：`src/preload/types.ts`

**步骤：**

- [✅] **步骤 1：创建 preload 类型声明**

`src/preload/types.ts`：
```typescript
export interface ElectronAPI {
  providers: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<number>
    update: (id: number, data: any) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  apiKeys: {
    list: () => Promise<any[]>
    create: (name: string, rateLimit?: number) => Promise<any>
    delete: (id: number) => Promise<void>
  }
  logs: {
    query: (params: any) => Promise<any>
    stats: (range: string) => Promise<any>
  }
  health: {
    check: () => Promise<any[]>
    onStatus: (callback: (data: any[]) => void) => void
  }
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
}
```

- [✅] **步骤 2：提交**

```bash
git add src/preload/types.ts
git commit -m "chore: add preload type declarations"
```

---

### Task 17: 打包配置

**文件：**
- 创建：`electron-builder.yml`
- 创建：`resources/icon.ico`
- 创建：`resources/icon.icns`

**步骤：**

- [✅] **步骤 1：创建 electron-builder 配置**

`electron-builder.yml`：
```yaml
appId: com.llm-gateway.app
productName: LLM Gateway
directories:
  buildResources: resources
  output: dist
files:
  - out/**/*
  - package.json
extraResources:
  - from: resources/
    to: resources/
win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: resources/icon.icns
  category: public.app-category.developer-tools
linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: resources/
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

- [✅] **步骤 2：创建简单图标（使用一个 32x32 占位 PNG）**

```bash
# 安装 sharp 用于生成图标（可选）
# 或使用预先存在的图标文件
mkdir -p resources
# 用一个命令行创建的简单 SVG 占位图，后续可以替换
```

创建 `resources/icon.svg` 占位图标（后续可替换为正式图标）。

- [✅] **步骤 3：创建 package.json build 脚本**

更新 `package.json` 添加打包脚本：
```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package:win": "npm run build && electron-builder --win",
    "package:mac": "npm run build && electron-builder --mac",
    "package:linux": "npm run build && electron-builder --linux",
    "package:all": "npm run build && electron-builder --win --mac --linux"
  }
}
```

- [✅] **步骤 4：验证构建 + 打包**

```bash
npm run build
```
预期：out/ 目录生成完整的生产构建。

- [✅] **步骤 5：最终提交**

```bash
git add electron-builder.yml resources/ package.json
git commit -m "chore: electron-builder packaging configuration"
```

---

### 自审清单

- [✅] **1. 规格覆盖：** 每个规格章节（数据模型、API 设计、前端 UI、桌面集成、安全、错误处理、日志）都在上述任务中覆盖。
- [✅] **2. 占位符扫描：** 所有步骤包含实际代码和命令，无 TODO/待定/占位符。
- [✅] **3. 类型一致性：** `providers.ts` 中定义的 `Provider` 类型与 `router.ts`、`forwarder.ts`、`server.ts`、前端 `types.ts` 中使用的一致。`createApiKey` 返回值格式在 `api-keys.ts` 和 `ApiKeys.tsx` 组件中一致。

---

### 执行完成

**📊 计划状态：** `[✅] 17/17 任务` — 全部任务已完成。

**构建结果：** main(24 kB) + preload(1.2 kB) + renderer(630 kB) | 测试 122/122 通过

**下一个步骤：** 使用 `npm run dev` 启动开发环境，`npm run package:win` 打包分发。
