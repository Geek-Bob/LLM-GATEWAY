# 模型映射功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现模型 ID 映射功能，客户端请求虚拟模型名，网关自动映射为实际模型名发送给上游。

**Architecture:** 在 proxy 层路由解析前插入映射逻辑，通过 domain 层的 models.service 提供映射查询和 CRUD 功能，配置 UI 通过 IPC 调用 domain 层。

**Tech Stack:** TypeScript, SQLite (sql.js), Zod, React, TanStack Query

---

## 文件结构

```
src/main/db/schema.ts                           # 修改：新增 model_mappings 表
src/main/domains/models/models.types.ts         # 新增：类型定义
src/main/domains/models/models.schema.ts        # 新增：Zod 校验
src/main/domains/models/models.service.ts       # 新增：业务逻辑
src/main/proxy/server.ts                        # 修改：插入映射逻辑
src/main/proxy/router.ts                        # 修改：删除 getAllModels
src/main/ipc/index.ts                           # 修改：注册 IPC handle
src/preload/index.ts                            # 修改：暴露 IPC 方法
src/renderer/pages/ModelMappings.tsx            # 新增：配置 UI
src/renderer/App.tsx                            # 修改：添加路由
```

---

### Task 1: 数据库表结构

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: 在 schema.ts 中新增 model_mappings 表**

在 `providers` 表定义之后添加：

```sql
CREATE TABLE IF NOT EXISTS model_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('anthropic', 'openai')),
  source_model TEXT NOT NULL,
  target_model TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_type, source_model)
);
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat: 新增 model_mappings 表"
```

---

### Task 2: Domain 层 - 类型定义

**Files:**
- Create: `src/main/domains/models/models.types.ts`

- [ ] **Step 1: 创建 models.types.ts**

```typescript
/**
 * 模型映射类型定义
 */

/** 模型映射实体 */
export interface ModelMapping {
  id: number
  providerType: string      // 'anthropic' | 'openai'
  sourceModel: string       // 完整模型 ID
  targetModel: string       // 完整模型 ID
  isActive: number
  createdAt: string
}

/** 创建映射输入 */
export interface CreateModelMappingInput {
  providerType: string
  sourceModel: string
  targetModel: string
}

/** 更新映射输入 */
export interface UpdateModelMappingInput {
  providerType?: string
  sourceModel?: string
  targetModel?: string
}

/** 模型信息（用于 /v1/models 端点和配置 UI） */
export interface ModelInfo {
  id: string                // 完整模型 ID，如 "anthropic/claude-sonnet-4"
  provider: string          // provider name
  providerType: string      // 'anthropic' | 'openai'
}
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/main/domains/models/models.types.ts
git commit -m "feat: 新增 models.types.ts 类型定义"
```

---

### Task 3: Domain 层 - Zod 校验

**Files:**
- Create: `src/main/domains/models/models.schema.ts`

- [ ] **Step 1: 创建 models.schema.ts**

```typescript
/**
 * 模型映射 Zod 校验
 */
import { z } from 'zod'

/** 创建映射校验 */
export const createModelMappingSchema = z.object({
  providerType: z.enum(['anthropic', 'openai']),
  sourceModel: z.string().min(1, 'sourceModel 不能为空'),
  targetModel: z.string().min(1, 'targetModel 不能为空'),
})

/** 更新映射校验 */
export const updateModelMappingSchema = z.object({
  providerType: z.enum(['anthropic', 'openai']).optional(),
  sourceModel: z.string().min(1, 'sourceModel 不能为空').optional(),
  targetModel: z.string().min(1, 'targetModel 不能为空').optional(),
})
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/main/domains/models/models.schema.ts
git commit -m "feat: 新增 models.schema.ts Zod 校验"
```

---

### Task 4: Domain 层 - Service 实现

**Files:**
- Create: `src/main/domains/models/models.service.ts`
- Create: `src/main/domains/models/__tests__/models.service.test.ts`

- [ ] **Step 1: 创建 models.service.test.ts**

```typescript
/**
 * models.service 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createModelsService } from '../models.service'

describe('models.service', () => {
  let service: ReturnType<typeof createModelsService>

  beforeEach(() => {
    service = createModelsService()
  })

  describe('getAllModels', () => {
    it('应返回所有活跃 provider 的模型列表', () => {
      const models = service.getAllModels()
      expect(Array.isArray(models)).toBe(true)
      // 每个模型应包含 id, provider, providerType
      if (models.length > 0) {
        expect(models[0]).toHaveProperty('id')
        expect(models[0]).toHaveProperty('provider')
        expect(models[0]).toHaveProperty('providerType')
        // id 格式应为 "provider-name/model"
        expect(models[0].id).toContain('/')
      }
    })
  })

  describe('findModelMapping', () => {
    it('未找到映射时应返回 null', () => {
      const result = service.findModelMapping('anthropic', 'nonexistent/model')
      expect(result).toBeNull()
    })
  })

  describe('CRUD', () => {
    it('应能创建、查询、更新、删除映射', () => {
      // 创建
      const created = service.createModelMapping({
        providerType: 'anthropic',
        sourceModel: 'test/source',
        targetModel: 'test/target'
      })
      expect(created.id).toBeDefined()
      expect(created.providerType).toBe('anthropic')
      expect(created.sourceModel).toBe('test/source')
      expect(created.targetModel).toBe('test/target')

      // 查询
      const mappings = service.listModelMappings()
      expect(mappings.length).toBeGreaterThan(0)

      // 更新
      const updated = service.updateModelMapping(created.id, {
        targetModel: 'test/updated'
      })
      expect(updated.targetModel).toBe('test/updated')

      // 删除
      service.deleteModelMapping(created.id)
      const afterDelete = service.listModelMappings()
      expect(afterDelete.find(m => m.id === created.id)).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run src/main/domains/models/__tests__/models.service.test.ts`
Expected: FAIL（service 文件不存在）

- [ ] **Step 3: 创建 models.service.ts**

```typescript
/**
 * 模型映射业务逻辑
 */
import { getDatabase } from '../../db/connection'
import { listActiveProviders } from '../../db/providers'
import type { ModelMapping, CreateModelMappingInput, UpdateModelMappingInput, ModelInfo } from './models.types'

export function createModelsService() {
  return {
    /** 获取所有活跃模型（从 router.ts 迁移） */
    getAllModels: (): ModelInfo[] => {
      const providers = listActiveProviders()
      const result: ModelInfo[] = []
      for (const p of providers) {
        for (const model of p.models) {
          result.push({
            id: `${p.name}/${model}`,
            provider: p.name,
            providerType: p.providerType
          })
        }
      }
      return result
    },

    /** 查找映射（供 proxy 和 IPC 使用） */
    findModelMapping: (providerType: string, sourceModel: string): ModelMapping | null => {
      const db = getDatabase()
      const stmt = db.prepare(
        'SELECT * FROM model_mappings WHERE provider_type = ? AND source_model = ? AND is_active = 1'
      )
      stmt.bind([providerType, sourceModel])
      if (stmt.step()) {
        const row = stmt.getAsObject()
        stmt.free()
        return {
          id: row.id as number,
          providerType: row.provider_type as string,
          sourceModel: row.source_model as string,
          targetModel: row.target_model as string,
          isActive: row.is_active as number,
          createdAt: row.created_at as string,
        }
      }
      stmt.free()
      return null
    },

    /** 查询所有映射 */
    listModelMappings: (): ModelMapping[] => {
      const db = getDatabase()
      const rows = db.exec('SELECT * FROM model_mappings ORDER BY id DESC')
      if (rows.length === 0) return []
      return rows[0].values.map((row: any[]) => ({
        id: row[0],
        providerType: row[1],
        sourceModel: row[2],
        targetModel: row[3],
        isActive: row[4],
        createdAt: row[5],
      }))
    },

    /** 创建映射 */
    createModelMapping: (data: CreateModelMappingInput): ModelMapping => {
      const db = getDatabase()
      db.run(
        'INSERT INTO model_mappings (provider_type, source_model, target_model) VALUES (?, ?, ?)',
        [data.providerType, data.sourceModel, data.targetModel]
      )
      const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number
      const mappings = db.exec(`SELECT * FROM model_mappings WHERE id = ${id}`)
      const row = mappings[0].values[0]
      return {
        id: row[0] as number,
        providerType: row[1] as string,
        sourceModel: row[2] as string,
        targetModel: row[3] as string,
        isActive: row[4] as number,
        createdAt: row[5] as string,
      }
    },

    /** 更新映射 */
    updateModelMapping: (id: number, data: UpdateModelMappingInput): ModelMapping => {
      const db = getDatabase()
      const updates: string[] = []
      const values: any[] = []

      if (data.providerType !== undefined) {
        updates.push('provider_type = ?')
        values.push(data.providerType)
      }
      if (data.sourceModel !== undefined) {
        updates.push('source_model = ?')
        values.push(data.sourceModel)
      }
      if (data.targetModel !== undefined) {
        updates.push('target_model = ?')
        values.push(data.targetModel)
      }

      if (updates.length > 0) {
        values.push(id)
        db.run(`UPDATE model_mappings SET ${updates.join(', ')} WHERE id = ?`, values)
      }

      const mappings = db.exec(`SELECT * FROM model_mappings WHERE id = ${id}`)
      const row = mappings[0].values[0]
      return {
        id: row[0] as number,
        providerType: row[1] as string,
        sourceModel: row[2] as string,
        targetModel: row[3] as string,
        isActive: row[4] as number,
        createdAt: row[5] as string,
      }
    },

    /** 删除映射 */
    deleteModelMapping: (id: number): void => {
      const db = getDatabase()
      db.run('DELETE FROM model_mappings WHERE id = ?', [id])
    },
  }
}

export type ModelsService = ReturnType<typeof createModelsService>
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run src/main/domains/models/__tests__/models.service.test.ts`
Expected: PASS

- [ ] **Step 5: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/main/domains/models/models.service.ts src/main/domains/models/__tests__/models.service.test.ts
git commit -m "feat: 新增 models.service.ts 业务逻辑"
```

---

### Task 5: Proxy 层 - 插入映射逻辑

**Files:**
- Modify: `src/main/proxy/server.ts`

- [ ] **Step 1: 在 server.ts 中导入 models.service**

在文件顶部添加导入：

```typescript
import { createModelsService } from '../domains/models/models.service'
```

在 `createProxyApp` 函数内部创建 service 实例：

```typescript
const modelsService = createModelsService()
```

- [ ] **Step 2: 在 handleProxyRequest 中插入映射逻辑**

在第 167 行 `const model = body.model` 之后、第 193 行 `const route = resolveProvider(model)` 之前插入：

```typescript
// 模型映射：根据 apiFormat + model 查找映射，有则替换，无则透传
const mapping = modelsService.findModelMapping(apiFormat, model)
const resolvedModel = mapping ? mapping.target_model : model
```

将第 193 行的 `const route = resolveProvider(model)` 改为：

```typescript
const route = resolveProvider(resolvedModel)
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 运行现有测试**

Run: `npx vitest run src/main/proxy/__tests__/`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add src/main/proxy/server.ts
git commit -m "feat: proxy 层插入模型映射逻辑"
```

---

### Task 6: Proxy 层 - 迁移 getAllModels

**Files:**
- Modify: `src/main/proxy/router.ts`
- Modify: `src/main/proxy/server.ts`

- [ ] **Step 1: 删除 router.ts 中的 getAllModels 函数**

删除第 64-80 行的 `getAllModels` 函数。

- [ ] **Step 2: 在 server.ts 中使用 modelsService.getAllModels()**

找到调用 `getAllModels()` 的地方（在 `/v1/models` 路由中），改为调用 `modelsService.getAllModels()`。

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/main/proxy/__tests__/`
Expected: 全部通过

- [ ] **Step 5: Commit**

```bash
git add src/main/proxy/router.ts src/main/proxy/server.ts
git commit -m "refactor: 迁移 getAllModels 到 models.service"
```

---

### Task 7: IPC 层 - 注册 handle

**Files:**
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: 在 ipc/index.ts 中注册 models 相关 handle**

在现有 IPC handle 注册之后添加：

```typescript
// ========== 模型映射 ==========
import { createModelsService } from '../domains/models/models.service'
import { createModelMappingSchema, updateModelMappingSchema } from '../domains/models/models.schema'

const modelsService = createModelsService()

ipcMain.handle('models:list', async () => modelsService.getAllModels())
ipcMain.handle('models:mapping:find', async (_event, { providerType, sourceModel }: { providerType: string; sourceModel: string }) => modelsService.findModelMapping(providerType, sourceModel))
ipcMain.handle('models:mapping:list', async () => modelsService.listModelMappings())
ipcMain.handle('models:mapping:create', async (_event, data) => {
  const input = createModelMappingSchema.parse(data)
  return modelsService.createModelMapping(input)
})
ipcMain.handle('models:mapping:update', async (_event, id: number, data) => {
  const input = updateModelMappingSchema.parse(data)
  return modelsService.updateModelMapping(id, input)
})
ipcMain.handle('models:mapping:delete', async (_event, id: number) => modelsService.deleteModelMapping(id))
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/index.ts
git commit -m "feat: 注册 models 相关 IPC handle"
```

---

### Task 8: Preload 层 - 暴露 IPC 方法

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 在 preload/index.ts 中暴露 models 方法**

在 `contextBridge.exposeInMainWorld` 中添加：

```typescript
models: {
  list: () => ipcRenderer.invoke('models:list'),
  mapping: {
    find: (params: { providerType: string; sourceModel: string }) => ipcRenderer.invoke('models:mapping:find', params),
    list: () => ipcRenderer.invoke('models:mapping:list'),
    create: (input: { providerType: string; sourceModel: string; targetModel: string }) => ipcRenderer.invoke('models:mapping:create', input),
    update: (id: number, updates: { providerType?: string; sourceModel?: string; targetModel?: string }) => ipcRenderer.invoke('models:mapping:update', { id, updates }),
    delete: (id: number) => ipcRenderer.invoke('models:mapping:delete', id),
  }
},
```

- [ ] **Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: preload 暴露 models IPC 方法"
```

---

### Task 9: 配置 UI - ModelMappings 页面

**Files:**
- Create: `src/renderer/pages/ModelMappings.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: 创建 ModelMappings.tsx**

```tsx
/**
 * 模型映射配置页面
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'

/** 模型映射类型 */
interface ModelMapping {
  id: number
  providerType: string
  sourceModel: string
  targetModel: string
  isActive: number
  createdAt: string
}

/** 模型信息类型 */
interface ModelInfo {
  id: string
  provider: string
  providerType: string
}

export default function ModelMappings() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    providerType: 'anthropic',
    sourceModel: '',
    targetModel: ''
  })

  // 查询映射列表
  const { data: mappings = [] } = useQuery<ModelMapping[]>({
    queryKey: ['model-mappings'],
    queryFn: () => api.models.mapping.list(),
  })

  // 查询模型列表（用于下拉选择）
  const { data: models = [] } = useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: () => api.models.list(),
  })

  // 创建映射
  const createMutation = useMutation({
    mutationFn: (data: { providerType: string; sourceModel: string; targetModel: string }) =>
      api.models.mapping.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-mappings'] })
      setShowForm(false)
      setFormData({ providerType: 'anthropic', sourceModel: '', targetModel: '' })
    }
  })

  // 更新映射
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; providerType?: string; sourceModel?: string; targetModel?: string }) =>
      api.models.mapping.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-mappings'] })
      setEditingId(null)
    }
  })

  // 删除映射
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.models.mapping.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-mappings'] })
  })

  // 过滤模型列表
  const filteredSourceModels = models.filter(m => m.providerType === formData.providerType)
  const filteredTargetModels = models.filter(m => m.providerType === formData.providerType)

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">模型映射</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          新增映射
        </button>
      </div>

      {/* 新增/编辑表单 */}
      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 rounded">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? '编辑映射' : '新增映射'}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Provider Type</label>
              <select
                value={formData.providerType}
                onChange={(e) => setFormData({ ...formData, providerType: e.target.value, sourceModel: '', targetModel: '' })}
                className="w-full p-2 border rounded"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">源模型</label>
              <select
                value={formData.sourceModel}
                onChange={(e) => setFormData({ ...formData, sourceModel: e.target.value })}
                className="w-full p-2 border rounded"
              >
                <option value="">请选择</option>
                {filteredSourceModels.map(m => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">目标模型</label>
              <select
                value={formData.targetModel}
                onChange={(e) => setFormData({ ...formData, targetModel: e.target.value })}
                className="w-full p-2 border rounded"
              >
                <option value="">请选择</option>
                {filteredTargetModels.map(m => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                if (editingId) {
                  updateMutation.mutate({ id: editingId, ...formData })
                } else {
                  createMutation.mutate(formData)
                }
              }}
              disabled={!formData.sourceModel || !formData.targetModel}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {editingId ? '更新' : '创建'}
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
                setFormData({ providerType: 'anthropic', sourceModel: '', targetModel: '' })
              }}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 映射列表 */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-3 text-left">Provider Type</th>
            <th className="p-3 text-left">源模型</th>
            <th className="p-3 text-left">目标模型</th>
            <th className="p-3 text-left">状态</th>
            <th className="p-3 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m) => (
            <tr key={m.id} className="border-t">
              <td className="p-3">{m.providerType}</td>
              <td className="p-3">{m.sourceModel}</td>
              <td className="p-3">{m.targetModel}</td>
              <td className="p-3">
                <span className={`px-2 py-1 rounded text-sm ${m.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {m.isActive ? '启用' : '禁用'}
                </span>
              </td>
              <td className="p-3">
                <button
                  onClick={() => {
                    setEditingId(m.id)
                    setFormData({
                      providerType: m.providerType,
                      sourceModel: m.sourceModel,
                      targetModel: m.targetModel
                    })
                    setShowForm(true)
                  }}
                  className="mr-2 px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  编辑
                </button>
                <button
                  onClick={() => deleteMutation.mutate(m.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 在 App.tsx 中添加路由**

在路由配置中添加：

```tsx
import ModelMappings from './pages/ModelMappings'

// 在 Routes 中添加
<Route path="/model-mappings" element={<ModelMappings />} />
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/ModelMappings.tsx src/renderer/App.tsx
git commit -m "feat: 新增模型映射配置页面"
```

---

### Task 10: 端到端测试

**Files:**
- Create: `src/main/proxy/__tests__/model-mapping.test.ts`

- [ ] **Step 1: 创建模型映射集成测试**

```typescript
/**
 * 模型映射集成测试
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createModelsService } from '../../domains/models/models.service'

describe('模型映射端到端', () => {
  let service: ReturnType<typeof createModelsService>

  beforeAll(() => {
    service = createModelsService()
  })

  it('完整流程：创建映射 → 查找映射 → 删除映射', () => {
    // 1. 创建映射
    const mapping = service.createModelMapping({
      providerType: 'anthropic',
      sourceModel: 'test/source-model',
      targetModel: 'test/target-model'
    })
    expect(mapping.id).toBeDefined()

    // 2. 查找映射
    const found = service.findModelMapping('anthropic', 'test/source-model')
    expect(found).not.toBeNull()
    expect(found!.targetModel).toBe('test/target-model')

    // 3. 查找不存在的映射
    const notFound = service.findModelMapping('anthropic', 'nonexistent/model')
    expect(notFound).toBeNull()

    // 4. 删除映射
    service.deleteModelMapping(mapping.id)
    const afterDelete = service.findModelMapping('anthropic', 'test/source-model')
    expect(afterDelete).toBeNull()
  })

  it('UNIQUE 约束：同一 provider_type + source_model 不能重复', () => {
    service.createModelMapping({
      providerType: 'openai',
      sourceModel: 'test/duplicate',
      targetModel: 'test/first'
    })

    expect(() => {
      service.createModelMapping({
        providerType: 'openai',
        sourceModel: 'test/duplicate',
        targetModel: 'test/second'
      })
    }).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/main/proxy/__tests__/model-mapping.test.ts`
Expected: PASS

- [ ] **Step 3: 运行全量测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add src/main/proxy/__tests__/model-mapping.test.ts
git commit -m "test: 新增模型映射集成测试"
```

---

### Task 11: 最终验证

- [ ] **Step 1: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`
Expected: 无错误

- [ ] **Step 3: 运行全量测试**

Run: `npm test`
Expected: 全部通过

- [ ] **Step 4: 运行构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 5: 最终 Commit**

```bash
git add .
git commit -m "feat: 模型映射功能完成"
```
