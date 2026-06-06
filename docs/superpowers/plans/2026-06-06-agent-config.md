# Agent 配置管理功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Agent 配置管理功能，支持管理多个 AI 编程助手的 settings 文件，支持一键切换。

**Architecture:** 新增 agent domain，独立管理 Agent 配置。数据库存储 Agent 定义和多个配置文件，切换时原子写入到 Agent 实际路径。与现有 Provider 系统解耦。

**Tech Stack:** TypeScript, SQLite (sql.js), Zod, TanStack Query, React, Electron IPC

---

## 文件结构

```
src/main/
├── db/
│   ├── schema.ts              # 新增 agents + agent_configs 表
│   ├── agents.ts              # Agent CRUD
│   └── agent-configs.ts       # 配置 CRUD
├── domains/agent/
│   ├── agent.types.ts         # 类型定义
│   ├── agent.schema.ts        # Zod 验证
│   └── agent.service.ts       # 业务逻辑
└── ipc/index.ts               # 新增 agent:* handlers

src/preload/
└── index.ts                   # 新增 agent API bridge

src/renderer/
├── lib/queries/agents.ts      # TanStack Query hooks
└── pages/Settings.tsx         # 新增 Agent 配置 UI
```

---

### Task 1: 数据库表创建

**Files:**
- Modify: `src/main/db/schema.ts`
- Test: `src/main/db/__tests__/schema.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/main/db/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest'
import { initDatabase } from '../schema'

describe('Database Schema', () => {
  it('should create agents table', async () => {
    const db = await initDatabase(':memory:')
    const tables = await db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agents'"
    )
    expect(tables[0]?.values[0]?.[0]).toBe('agents')
  })

  it('should create agent_configs table', async () => {
    const db = await initDatabase(':memory:')
    const tables = await db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_configs'"
    )
    expect(tables[0]?.values[0]?.[0]).toBe('agent_configs')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/main/db/__tests__/schema.test.ts`
Expected: FAIL with "agents table not found"

- [ ] **Step 3: 添加建表 SQL**

在 `src/main/db/schema.ts` 的 `SCHEMA_VERSION` 和建表语句中添加：

```typescript
// 在 SCHEMA_VERSION 之后添加
const CREATE_AGENTS_TABLE = `
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  config_path TEXT NOT NULL,
  config_format TEXT NOT NULL CHECK (config_format IN ('json', 'toml', 'env')),
  is_builtin INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`

const CREATE_AGENT_CONFIGS_TABLE = `
CREATE TABLE IF NOT EXISTS agent_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, name)
);`

// 在 initDatabase 函数中添加
await db.exec(CREATE_AGENTS_TABLE)
await db.exec(CREATE_AGENT_CONFIGS_TABLE)
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/main/db/__tests__/schema.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/db/schema.ts src/main/db/__tests__/schema.test.ts
git commit -m "feat(db): add agents and agent_configs tables"
```

---

### Task 2: 内置 Agent 预设初始化

**Files:**
- Modify: `src/main/db/schema.ts`
- Test: `src/main/db/__tests__/schema.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// 在 schema.test.ts 中添加
it('should initialize builtin agents', async () => {
  const db = await initDatabase(':memory:')
  const result = await db.exec('SELECT name FROM agents WHERE is_builtin = 1')
  const names = result[0]?.values.map(row => row[0]) || []
  expect(names).toContain('claude')
  expect(names).toContain('codex')
  expect(names).toContain('gemini')
  expect(names).toContain('claude-desktop')
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/main/db/__tests__/schema.test.ts`
Expected: FAIL with "agents table is empty"

- [ ] **Step 3: 添加内置 Agent 初始化**

在 `src/main/db/schema.ts` 中添加：

```typescript
const BUILTIN_AGENTS = [
  { name: 'claude', displayName: 'Claude Code', configPath: '~/.claude/settings.json', format: 'json' },
  { name: 'claude-desktop', displayName: 'Claude Desktop', configPath: '~/.claude-desktop/config.json', format: 'json' },
  { name: 'codex', displayName: 'Codex', configPath: '~/.codex/config.toml', format: 'toml' },
  { name: 'gemini', displayName: 'Gemini CLI', configPath: '~/.gemini/settings.json', format: 'json' },
  { name: 'opencode', displayName: 'OpenCode', configPath: '~/.opencode/config.json', format: 'json' },
  { name: 'openclaw', displayName: 'OpenClaw', configPath: '~/.openclaw/config.json', format: 'json' },
  { name: 'hermes', displayName: 'Hermes', configPath: '~/.hermes/config.json', format: 'json' },
]

// 在建表之后添加
for (const agent of BUILTIN_AGENTS) {
  await db.run(
    `INSERT OR IGNORE INTO agents (name, display_name, config_path, config_format, is_builtin)
     VALUES (?, ?, ?, ?, 1)`,
    [agent.name, agent.displayName, agent.configPath, agent.format]
  )
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/main/db/__tests__/schema.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/db/schema.ts
git commit -m "feat(db): initialize builtin agents"
```

---

### Task 3: Agent CRUD 数据库层

**Files:**
- Create: `src/main/db/agents.ts`
- Test: `src/main/db/__tests__/agents.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/main/db/__tests__/agents.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDatabase } from '../schema'
import { createAgentRepository } from '../agents'

describe('Agent Repository', () => {
  let db: any
  let repo: ReturnType<typeof createAgentRepository>

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    repo = createAgentRepository(db)
  })

  it('should list all agents', async () => {
    const agents = await repo.list()
    expect(agents.length).toBeGreaterThan(0)
    expect(agents[0]).toHaveProperty('id')
    expect(agents[0]).toHaveProperty('name')
    expect(agents[0]).toHaveProperty('displayName')
  })

  it('should get agent by id', async () => {
    const agents = await repo.list()
    const agent = await repo.getById(agents[0].id)
    expect(agent).toBeDefined()
    expect(agent?.name).toBe(agents[0].name)
  })

  it('should create custom agent', async () => {
    const agent = await repo.create({
      name: 'custom-agent',
      displayName: 'Custom Agent',
      configPath: '~/.custom/config.json',
      configFormat: 'json'
    })
    expect(agent.id).toBeDefined()
    expect(agent.isBuiltin).toBe(0)
  })

  it('should update agent', async () => {
    const agents = await repo.list()
    const updated = await repo.update(agents[0].id, { displayName: 'Updated Name' })
    expect(updated.displayName).toBe('Updated Name')
  })

  it('should delete custom agent', async () => {
    const agent = await repo.create({
      name: 'to-delete',
      displayName: 'To Delete',
      configPath: '~/.to-delete/config.json',
      configFormat: 'json'
    })
    await repo.remove(agent.id)
    const found = await repo.getById(agent.id)
    expect(found).toBeNull()
  })

  it('should not delete builtin agent', async () => {
    const agents = await repo.list()
    const builtin = agents.find(a => a.isBuiltin === 1)
    await expect(repo.remove(builtin!.id)).rejects.toThrow('Cannot delete builtin agent')
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/main/db/__tests__/agents.test.ts`
Expected: FAIL with "Cannot find module '../agents'"

- [ ] **Step 3: 实现 Agent Repository**

```typescript
// src/main/db/agents.ts
import type { Database } from './database'

export interface AgentRow {
  id: number
  name: string
  display_name: string
  config_path: string
  config_format: 'json' | 'toml' | 'env'
  is_builtin: number
  created_at: string
  updated_at: string
}

export interface Agent {
  id: number
  name: string
  displayName: string
  configPath: string
  configFormat: 'json' | 'toml' | 'env'
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

export interface CreateAgentInput {
  name: string
  displayName: string
  configPath: string
  configFormat: 'json' | 'toml' | 'env'
}

export interface UpdateAgentInput {
  displayName?: string
  configPath?: string
  configFormat?: 'json' | 'toml' | 'env'
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name,
    configPath: row.config_path,
    configFormat: row.config_format,
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createAgentRepository(db: Database) {
  return {
    async list(): Promise<Agent[]> {
      const rows = await db.all<AgentRow>('SELECT * FROM agents ORDER BY is_builtin DESC, name')
      return rows.map(rowToAgent)
    },

    async getById(id: number): Promise<Agent | null> {
      const row = await db.get<AgentRow>('SELECT * FROM agents WHERE id = ?', [id])
      return row ? rowToAgent(row) : null
    },

    async getByName(name: string): Promise<Agent | null> {
      const row = await db.get<AgentRow>('SELECT * FROM agents WHERE name = ?', [name])
      return row ? rowToAgent(row) : null
    },

    async create(input: CreateAgentInput): Promise<Agent> {
      const result = await db.run(
        `INSERT INTO agents (name, display_name, config_path, config_format, is_builtin)
         VALUES (?, ?, ?, ?, 0)`,
        [input.name, input.displayName, input.configPath, input.configFormat]
      )
      const agent = await this.getById(result.lastID)
      if (!agent) throw new Error('Failed to create agent')
      return agent
    },

    async update(id: number, input: UpdateAgentInput): Promise<Agent> {
      const updates: string[] = []
      const values: any[] = []

      if (input.displayName !== undefined) {
        updates.push('display_name = ?')
        values.push(input.displayName)
      }
      if (input.configPath !== undefined) {
        updates.push('config_path = ?')
        values.push(input.configPath)
      }
      if (input.configFormat !== undefined) {
        updates.push('config_format = ?')
        values.push(input.configFormat)
      }

      if (updates.length === 0) {
        const agent = await this.getById(id)
        if (!agent) throw new Error('Agent not found')
        return agent
      }

      updates.push("updated_at = datetime('now')")
      values.push(id)

      await db.run(
        `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`,
        values
      )

      const agent = await this.getById(id)
      if (!agent) throw new Error('Agent not found')
      return agent
    },

    async remove(id: number): Promise<void> {
      const agent = await this.getById(id)
      if (!agent) throw new Error('Agent not found')
      if (agent.isBuiltin === 1) throw new Error('Cannot delete builtin agent')
      await db.run('DELETE FROM agents WHERE id = ?', [id])
    },
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/main/db/__tests__/agents.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/db/agents.ts src/main/db/__tests__/agents.test.ts
git commit -m "feat(db): add agent repository CRUD"
```

---

### Task 4: Agent Config CRUD 数据库层

**Files:**
- Create: `src/main/db/agent-configs.ts`
- Test: `src/main/db/__tests__/agent-configs.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/main/db/__tests__/agent-configs.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDatabase } from '../schema'
import { createAgentConfigRepository } from '../agent-configs'

describe('Agent Config Repository', () => {
  let db: any
  let repo: ReturnType<typeof createAgentConfigRepository>

  beforeEach(async () => {
    db = await initDatabase(':memory:')
    repo = createAgentConfigRepository(db)
  })

  it('should list configs for agent', async () => {
    // Claude agent id = 1 (first builtin)
    const configs = await repo.listByAgent(1)
    expect(configs).toEqual([])
  })

  it('should create config', async () => {
    const config = await repo.create({
      agentId: 1,
      name: 'default',
      content: '{"env": {"ANTHROPIC_API_KEY": "test"}}'
    })
    expect(config.id).toBeDefined()
    expect(config.name).toBe('default')
    expect(config.isCurrent).toBe(0)
  })

  it('should get config by id', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'default',
      content: '{"test": true}'
    })
    const config = await repo.getById(created.id)
    expect(config).toBeDefined()
    expect(config?.content).toBe('{"test": true}')
  })

  it('should update config content', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'default',
      content: '{"old": true}'
    })
    const updated = await repo.updateContent(created.id, '{"new": true}')
    expect(updated.content).toBe('{"new": true}')
  })

  it('should delete config', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'to-delete',
      content: '{}'
    })
    await repo.remove(created.id)
    const found = await repo.getById(created.id)
    expect(found).toBeNull()
  })

  it('should not delete current config', async () => {
    const created = await repo.create({
      agentId: 1,
      name: 'current',
      content: '{}'
    })
    await repo.setCurrent(1, created.id)
    await expect(repo.remove(created.id)).rejects.toThrow('Cannot delete current config')
  })

  it('should switch current config', async () => {
    const config1 = await repo.create({ agentId: 1, name: 'c1', content: '{}' })
    const config2 = await repo.create({ agentId: 1, name: 'c2', content: '{}' })

    await repo.setCurrent(1, config1.id)
    let current = await repo.getCurrent(1)
    expect(current?.id).toBe(config1.id)

    await repo.setCurrent(1, config2.id)
    current = await repo.getCurrent(1)
    expect(current?.id).toBe(config2.id)
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/main/db/__tests__/agent-configs.test.ts`
Expected: FAIL with "Cannot find module '../agent-configs'"

- [ ] **Step 3: 实现 Config Repository**

```typescript
// src/main/db/agent-configs.ts
import type { Database } from './database'

export interface AgentConfigRow {
  id: number
  agent_id: number
  name: string
  content: string
  is_current: number
  created_at: string
  updated_at: string
}

export interface AgentConfig {
  id: number
  agentId: number
  name: string
  content: string
  isCurrent: number
  createdAt: string
  updatedAt: string
}

export interface CreateAgentConfigInput {
  agentId: number
  name: string
  content: string
}

function rowToConfig(row: AgentConfigRow): AgentConfig {
  return {
    id: row.id,
    agentId: row.agent_id,
    name: row.name,
    content: row.content,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createAgentConfigRepository(db: Database) {
  return {
    async listByAgent(agentId: number): Promise<AgentConfig[]> {
      const rows = await db.all<AgentConfigRow>(
        'SELECT * FROM agent_configs WHERE agent_id = ? ORDER BY name',
        [agentId]
      )
      return rows.map(rowToConfig)
    },

    async getById(id: number): Promise<AgentConfig | null> {
      const row = await db.get<AgentConfigRow>('SELECT * FROM agent_configs WHERE id = ?', [id])
      return row ? rowToConfig(row) : null
    },

    async getCurrent(agentId: number): Promise<AgentConfig | null> {
      const row = await db.get<AgentConfigRow>(
        'SELECT * FROM agent_configs WHERE agent_id = ? AND is_current = 1',
        [agentId]
      )
      return row ? rowToConfig(row) : null
    },

    async create(input: CreateAgentConfigInput): Promise<AgentConfig> {
      const result = await db.run(
        'INSERT INTO agent_configs (agent_id, name, content) VALUES (?, ?, ?)',
        [input.agentId, input.name, input.content]
      )
      const config = await this.getById(result.lastID)
      if (!config) throw new Error('Failed to create config')
      return config
    },

    async updateContent(id: number, content: string): Promise<AgentConfig> {
      await db.run(
        "UPDATE agent_configs SET content = ?, updated_at = datetime('now') WHERE id = ?",
        [content, id]
      )
      const config = await this.getById(id)
      if (!config) throw new Error('Config not found')
      return config
    },

    async setCurrent(agentId: number, configId: number): Promise<void> {
      // Clear current for this agent
      await db.run(
        'UPDATE agent_configs SET is_current = 0 WHERE agent_id = ?',
        [agentId]
      )
      // Set new current
      await db.run(
        'UPDATE agent_configs SET is_current = 1 WHERE id = ? AND agent_id = ?',
        [configId, agentId]
      )
    },

    async remove(id: number): Promise<void> {
      const config = await this.getById(id)
      if (!config) throw new Error('Config not found')
      if (config.isCurrent === 1) throw new Error('Cannot delete current config')
      await db.run('DELETE FROM agent_configs WHERE id = ?', [id])
    },
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/main/db/__tests__/agent-configs.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/db/agent-configs.ts src/main/db/__tests__/agent-configs.test.ts
git commit -m "feat(db): add agent config repository CRUD"
```

---

### Task 5: Agent Domain 类型和验证

**Files:**
- Create: `src/main/domains/agent/agent.types.ts`
- Create: `src/main/domains/agent/agent.schema.ts`

- [ ] **Step 1: 创建类型定义**

```typescript
// src/main/domains/agent/agent.types.ts
export type ConfigFormat = 'json' | 'toml' | 'env'

export interface AgentResponse {
  id: number
  name: string
  displayName: string
  configPath: string
  configFormat: ConfigFormat
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

export interface AgentConfigResponse {
  id: number
  agentId: number
  name: string
  content: string
  isCurrent: number
  createdAt: string
  updatedAt: string
}

export interface CreateAgentInput {
  name: string
  displayName: string
  configPath: string
  configFormat: ConfigFormat
}

export interface UpdateAgentInput {
  displayName?: string
  configPath?: string
  configFormat?: ConfigFormat
}

export interface CreateAgentConfigInput {
  agentId: number
  name: string
  content: string
}

export interface UpdateAgentConfigInput {
  content: string
}

export interface SwitchConfigInput {
  agentId: number
  configId: number
}
```

- [ ] **Step 2: 创建 Zod 验证 Schema**

```typescript
// src/main/domains/agent/agent.schema.ts
import { z } from 'zod'

export const configFormatSchema = z.enum(['json', 'toml', 'env'])

export const createAgentSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens'),
  displayName: z.string().min(1).max(100),
  configPath: z.string().min(1),
  configFormat: configFormatSchema,
})

export const updateAgentSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  configPath: z.string().min(1).optional(),
  configFormat: configFormatSchema.optional(),
})

export const createAgentConfigSchema = z.object({
  agentId: z.number().int().positive(),
  name: z.string().min(1).max(50),
  content: z.string(),
})

export const updateAgentConfigSchema = z.object({
  content: z.string(),
})

export const switchConfigSchema = z.object({
  agentId: z.number().int().positive(),
  configId: z.number().int().positive(),
})
```

- [ ] **Step 3: 提交**

```bash
mkdir -p src/main/domains/agent
git add src/main/domains/agent/agent.types.ts src/main/domains/agent/agent.schema.ts
git commit -m "feat(agent): add types and validation schemas"
```

---

### Task 6: Agent Service 业务逻辑

**Files:**
- Create: `src/main/domains/agent/agent.service.ts`
- Test: `src/main/domains/agent/__tests__/agent.service.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// src/main/domains/agent/__tests__/agent.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAgentService } from '../agent.service'

// Mock fs module
vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}))

describe('Agent Service', () => {
  let service: ReturnType<typeof createAgentService>
  let mockDb: any

  beforeEach(async () => {
    mockDb = await createMockDb()
    service = createAgentService(mockDb)
  })

  it('should list agents', async () => {
    const agents = await service.list()
    expect(agents.length).toBeGreaterThan(0)
  })

  it('should list configs for agent', async () => {
    const configs = await service.listConfigs(1)
    expect(Array.isArray(configs)).toBe(true)
  })

  it('should create config', async () => {
    const config = await service.createConfig({
      agentId: 1,
      name: 'test',
      content: '{"test": true}'
    })
    expect(config.name).toBe('test')
  })

  it('should switch config with atomic write', async () => {
    const { writeFile, rename } = await import('fs/promises')
    const config = await service.createConfig({
      agentId: 1,
      name: 'to-switch',
      content: '{"switch": true}'
    })

    await service.switchConfig({ agentId: 1, configId: config.id })

    expect(writeFile).toHaveBeenCalled()
    expect(rename).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test -- --run src/main/domains/agent/__tests__/agent.service.test.ts`
Expected: FAIL with "Cannot find module '../agent.service'"

- [ ] **Step 3: 实现 Agent Service**

```typescript
// src/main/domains/agent/agent.service.ts
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { Database } from '../../db/database'
import { createAgentRepository, type Agent } from '../../db/agents'
import { createAgentConfigRepository, type AgentConfig } from '../../db/agent-configs'
import type {
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentConfigInput,
  UpdateAgentConfigInput,
  SwitchConfigInput,
} from './agent.types'

/**
 * 展开 ~ 路径为用户主目录
 */
function expandHomePath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}

export function createAgentService(db: Database) {
  const agentRepo = createAgentRepository(db)
  const configRepo = createAgentConfigRepository(db)

  return {
    /**
     * 列出所有 Agent
     */
    async list(): Promise<Agent[]> {
      return agentRepo.list()
    },

    /**
     * 获取单个 Agent
     */
    async getById(id: number): Promise<Agent | null> {
      return agentRepo.getById(id)
    },

    /**
     * 创建自定义 Agent
     */
    async create(input: CreateAgentInput): Promise<Agent> {
      return agentRepo.create(input)
    },

    /**
     * 更新 Agent
     */
    async update(id: number, input: UpdateAgentInput): Promise<Agent> {
      return agentRepo.update(id, input)
    },

    /**
     * 删除自定义 Agent（内置不可删）
     */
    async remove(id: number): Promise<void> {
      return agentRepo.remove(id)
    },

    /**
     * 列出某个 Agent 的所有配置
     */
    async listConfigs(agentId: number): Promise<AgentConfig[]> {
      return configRepo.listByAgent(agentId)
    },

    /**
     * 获取单个配置
     */
    async getConfig(id: number): Promise<AgentConfig | null> {
      return configRepo.getById(id)
    },

    /**
     * 创建配置
     */
    async createConfig(input: CreateAgentConfigInput): Promise<AgentConfig> {
      return configRepo.create(input)
    },

    /**
     * 更新配置内容
     */
    async updateConfig(id: number, input: UpdateAgentConfigInput): Promise<AgentConfig> {
      return configRepo.updateContent(id, input.content)
    },

    /**
     * 删除配置
     */
    async deleteConfig(id: number): Promise<void> {
      return configRepo.remove(id)
    },

    /**
     * 切换配置（原子写入到 Agent 路径）
     */
    async switchConfig(input: SwitchConfigInput): Promise<void> {
      const { agentId, configId } = input

      // 1. 读取配置和 Agent 信息
      const config = await configRepo.getById(configId)
      if (!config) throw new Error('Config not found')
      if (config.agentId !== agentId) throw new Error('Config does not belong to this agent')

      const agent = await agentRepo.getById(agentId)
      if (!agent) throw new Error('Agent not found')

      // 2. 更新数据库状态
      await configRepo.setCurrent(agentId, configId)

      // 3. 原子写入到 Agent 路径
      const configPath = expandHomePath(agent.configPath)
      const dir = path.dirname(configPath)
      const tmpPath = `${configPath}.tmp.${Date.now()}`

      try {
        // 确保目录存在
        await fs.mkdir(dir, { recursive: true })

        // 写入临时文件
        await fs.writeFile(tmpPath, config.content, 'utf-8')

        // 原子替换
        await fs.rename(tmpPath, configPath)
      } catch (error) {
        // 写入失败，回滚数据库状态
        const current = await configRepo.getCurrent(agentId)
        if (current) {
          await configRepo.setCurrent(agentId, current.id)
        }
        throw error
      }
    },
  }
}

export type AgentService = ReturnType<typeof createAgentService>
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test -- --run src/main/domains/agent/__tests__/agent.service.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/main/domains/agent/agent.service.ts src/main/domains/agent/__tests__/agent.service.test.ts
git commit -m "feat(agent): add agent service with switch logic"
```

---

### Task 7: IPC Handler 注册

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 在 IPC 注册中添加 agent handlers**

在 `src/main/ipc/index.ts` 中添加：

```typescript
// 在文件顶部导入
import { createAgentService } from '../domains/agent/agent.service'
import {
  createAgentSchema,
  updateAgentSchema,
  createAgentConfigSchema,
  updateAgentConfigSchema,
  switchConfigSchema,
} from '../domains/agent/agent.schema'

// 在 registerIpcHandlers 函数中添加
export function registerIpcHandlers(db: Database) {
  // ... 现有代码 ...

  // Agent handlers
  const agentService = createAgentService(db)

  ipcMain.handle('agent:list', async () => {
    return agentService.list()
  })

  ipcMain.handle('agent:get', async (_event, id: number) => {
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
```

- [ ] **Step 2: 在 Preload 中添加 agent bridge**

在 `src/preload/index.ts` 中添加：

```typescript
// 在 electronAPI 对象中添加
agents: {
  list: () => ipcRenderer.invoke('agent:list'),
  get: (id: number) => ipcRenderer.invoke('agent:get', id),
  create: (data: any) => ipcRenderer.invoke('agent:create', data),
  update: (id: number, data: any) => ipcRenderer.invoke('agent:update', id, data),
  delete: (id: number) => ipcRenderer.invoke('agent:delete', id),
  listConfigs: (agentId: number) => ipcRenderer.invoke('agent:listConfigs', agentId),
  getConfig: (id: number) => ipcRenderer.invoke('agent:getConfig', id),
  createConfig: (data: any) => ipcRenderer.invoke('agent:createConfig', data),
  updateConfig: (id: number, data: any) => ipcRenderer.invoke('agent:updateConfig', id, data),
  deleteConfig: (id: number) => ipcRenderer.invoke('agent:deleteConfig', id),
  switchConfig: (data: any) => ipcRenderer.invoke('agent:switchConfig', data),
},
```

- [ ] **Step 3: 更新 Preload 类型定义**

在 `src/preload/types.ts` 中添加 agents 类型：

```typescript
agents: {
  list: () => Promise<AgentResponse[]>
  get: (id: number) => Promise<AgentResponse | null>
  create: (data: CreateAgentInput) => Promise<AgentResponse>
  update: (id: number, data: UpdateAgentInput) => Promise<AgentResponse>
  delete: (id: number) => Promise<void>
  listConfigs: (agentId: number) => Promise<AgentConfigResponse[]>
  getConfig: (id: number) => Promise<AgentConfigResponse | null>
  createConfig: (data: CreateAgentConfigInput) => Promise<AgentConfigResponse>
  updateConfig: (id: number, data: UpdateAgentConfigInput) => Promise<AgentConfigResponse>
  deleteConfig: (id: number) => Promise<void>
  switchConfig: (data: SwitchConfigInput) => Promise<void>
}
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add src/main/ipc/index.ts src/preload/index.ts src/preload/types.ts
git commit -m "feat(agent): add IPC handlers and preload bridge"
```

---

### Task 8: TanStack Query Hooks

**Files:**
- Create: `src/renderer/lib/queries/agents.ts`

- [ ] **Step 1: 创建 Query Hooks**

```typescript
// src/renderer/lib/queries/agents.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'

// Agent hooks
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () => api.agents.list(),
  })
}

export function useAgent(id: number | null) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => api.agents.get(id!),
    enabled: id !== null,
  })
}

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.agents.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useUpdateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.agents.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

// Config hooks
export function useAgentConfigs(agentId: number | null) {
  return useQuery({
    queryKey: ['agent-configs', agentId],
    queryFn: () => api.agents.listConfigs(agentId!),
    enabled: agentId !== null,
  })
}

export function useCreateAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.agents.createConfig(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['agent-configs', variables.agentId] })
    },
  })
}

export function useUpdateAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.agents.updateConfig(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-configs'] })
    },
  })
}

export function useDeleteAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.agents.deleteConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-configs'] })
    },
  })
}

export function useSwitchAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: any) => api.agents.switchConfig(data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['agent-configs', variables.agentId] })
    },
  })
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add src/renderer/lib/queries/agents.ts
git commit -m "feat(agent): add TanStack Query hooks"
```

---

### Task 9: Settings 页面 UI

**Files:**
- Modify: `src/renderer/pages/Settings.tsx`

- [ ] **Step 1: 添加 Agent 配置区域**

在 Settings.tsx 中添加：

```typescript
// 在文件顶部添加导入
import { useAgents, useAgentConfigs, useSwitchAgentConfig, useCreateAgentConfig, useDeleteAgentConfig } from '../lib/queries/agents'
import { useState } from 'react'
import { toast } from 'sonner'

// 在组件内部添加
export function SettingsPage() {
  // ... 现有代码 ...

  // Agent 配置状态
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null)
  const { data: agents = [] } = useAgents()
  const { data: configs = [] } = useAgentConfigs(expandedAgent)
  const switchConfig = useSwitchAgentConfig()
  const createConfig = useCreateAgentConfig()
  const deleteConfig = useDeleteAgentConfig()

  const handleSwitchConfig = async (agentId: number, configId: number) => {
    try {
      await switchConfig.mutateAsync({ agentId, configId })
      toast.success('配置已切换')
    } catch (error) {
      toast.error('切换失败: ' + (error as Error).message)
    }
  }

  return (
    // ... 现有 JSX ...
    // 在更新设置区域之后添加
    <Card>
      <CardHeader>
        <CardTitle>Agent 配置</CardTitle>
        <CardDescription>管理 AI 编程助手的配置文件</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {agents.map(agent => (
          <div key={agent.id} className="border rounded-lg p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
            >
              <div>
                <h4 className="font-medium">{agent.displayName}</h4>
                <p className="text-sm text-muted-foreground">{agent.configPath}</p>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedAgent === agent.id ? 'rotate-180' : ''}`} />
            </div>

            {expandedAgent === agent.id && (
              <div className="mt-4 space-y-2">
                {configs.map(config => (
                  <div
                    key={config.id}
                    className={`flex items-center justify-between p-2 rounded ${config.isCurrent ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${config.isCurrent ? 'bg-primary' : 'bg-muted-foreground'}`} />
                      <span className="text-sm">
                        {config.name}
                        {config.isCurrent ? ' (当前)' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!config.isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSwitchConfig(agent.id, config.id)}
                        >
                          切换
                        </Button>
                      )}
                      {!config.isCurrent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteConfig.mutate(config.id)}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full">
                  添加配置
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add src/renderer/pages/Settings.tsx
git commit -m "feat(agent): add agent config UI to Settings page"
```

---

### Task 10: 端到端测试

**Files:**
- Test: `src/main/domains/agent/__tests__/e2e.test.ts`

- [ ] **Step 1: 写端到端测试**

```typescript
// src/main/domains/agent/__tests__/e2e.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAgentService } from '../agent.service'
import { initDatabase } from '../../../db/schema'

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}))

describe('Agent Config E2E', () => {
  let service: ReturnType<typeof createAgentService>

  beforeEach(async () => {
    const db = await initDatabase(':memory:')
    service = createAgentService(db)
  })

  it('should complete full workflow: list agents, create config, switch', async () => {
    // 1. List agents
    const agents = await service.list()
    expect(agents.length).toBeGreaterThan(0)
    const claude = agents.find(a => a.name === 'claude')
    expect(claude).toBeDefined()

    // 2. Create config
    const config = await service.createConfig({
      agentId: claude!.id,
      name: 'work',
      content: JSON.stringify({
        env: {
          ANTHROPIC_API_KEY: 'sk-work-key',
          ANTHROPIC_BASE_URL: 'https://api.anthropic.com'
        }
      })
    })
    expect(config.name).toBe('work')

    // 3. Switch config
    await service.switchConfig({
      agentId: claude!.id,
      configId: config.id
    })

    // 4. Verify current
    const current = await service.listConfigs(claude!.id)
    const currentConfig = current.find(c => c.isCurrent === 1)
    expect(currentConfig?.id).toBe(config.id)

    // 5. Verify file was written
    const { writeFile, rename } = await import('fs/promises')
    expect(writeFile).toHaveBeenCalled()
    expect(rename).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npm test -- --run src/main/domains/agent/__tests__/e2e.test.ts`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/main/domains/agent/__tests__/e2e.test.ts
git commit -m "test(agent): add end-to-end workflow test"
```

---

## 实施计划完成

**计划已保存到 `docs/superpowers/plans/2026-06-06-agent-config.md`**

两种执行方式：

**1. Subagent-Driven（推荐）** - 每个任务派发一个新的子代理执行，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

选择哪种方式？
