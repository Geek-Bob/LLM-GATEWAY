# 模型映射功能设计

## 功能概述

支持模型 ID 映射，客户端请求时使用虚拟模型名，网关自动映射为实际模型名发送给上游。

**使用场景**：
- 客户端请求 `anthropic/opus-4.8`，网关映射为 `deepseek/deepseek-v4-pro`
- 未配置映射的模型，保持原名不变

## 现有代码分析

### 关键函数

| 文件 | 函数 | 作用 | 输入 | 输出 |
|------|------|------|------|------|
| `router.ts` | `getAllModels()` | 获取所有可用模型 | 无 | `{ id: "provider-name/model", provider, providerType }[]` |
| `router.ts` | `resolveProvider(modelId)` | 路由解析 | `"provider-name/model-id"` | `{ prefix, modelName, provider }` |
| `server.ts` | `handleProxyRequest()` | 代理请求入口 | `(c, path, apiFormat)` | `Response` |

### 数据流（现有）

```
1. 解析请求体，提取 model（如 "anthropic/opus-4.8"）
2. 路由解析 → resolveProvider(model)
   - parseModelId: 拆分 prefix="anthropic", modelName="opus-4.8"
   - getProviderByName("anthropic") → provider
   - 校验 isActive + models 白名单
3. 协议转换判断（apiFormat !== provider.providerType）
4. 构建上游请求（用 route.modelName）
```

### 数据格式确认

- `getAllModels()` 返回的 `id`：带前缀的完整模型 ID（如 `anthropic/claude-sonnet-4`）
- `resolveProvider()` 期望的输入：带前缀的完整模型 ID
- `models` 白名单：不带前缀的模型名（如 `claude-sonnet-4`）
- `apiFormat`：在路由解析前已知（从请求路径判断，`/v1/messages` → `anthropic`，`/v1/chat/completions` → `openai`）

## 设计方案

### 架构分层

```
配置 UI → IPC → models.service.ts → db（数据访问层）
proxy  → models.service.ts → db（数据访问层）
```

### 1. 数据库表结构

```sql
CREATE TABLE model_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('anthropic', 'openai')),
  source_model TEXT NOT NULL,      -- 完整模型 ID，如 "anthropic/opus-4.8"
  target_model TEXT NOT NULL,      -- 完整模型 ID，如 "deepseek/deepseek-v4-pro"
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_type, source_model)
);
```

**字段说明**：
- `provider_type`：区分映射规则属于哪种 API 格式
- `source_model`：客户端请求的完整模型 ID（带前缀）
- `target_model`：映射后的完整模型 ID（带前缀），来自 `getAllModels()` 的 `id` 字段

### 2. Domain 层

**新增目录**：`src/main/domains/models/`

**文件结构**：
```
src/main/domains/models/
├── models.service.ts   # 业务逻辑，唯一入口
├── models.schema.ts    # Zod 校验（必须）
└── models.types.ts     # 类型定义
```

**`models.types.ts`**：
```typescript
export interface ModelMapping {
  id: number
  providerType: string      // 'anthropic' | 'openai'
  sourceModel: string       // 完整模型 ID
  targetModel: string       // 完整模型 ID
  isActive: number
  createdAt: string
}

export interface CreateModelMappingInput {
  providerType: string
  sourceModel: string
  targetModel: string
}

export interface UpdateModelMappingInput {
  providerType?: string
  sourceModel?: string
  targetModel?: string
}

export interface ModelInfo {
  id: string                // 完整模型 ID，如 "anthropic/claude-sonnet-4"
  provider: string          // provider name
  providerType: string      // 'anthropic' | 'openai'
}
```

**`models.schema.ts`**：
```typescript
import { z } from 'zod'

export const createModelMappingSchema = z.object({
  providerType: z.enum(['anthropic', 'openai']),
  sourceModel: z.string().min(1),
  targetModel: z.string().min(1),
})

export const updateModelMappingSchema = z.object({
  providerType: z.enum(['anthropic', 'openai']).optional(),
  sourceModel: z.string().min(1).optional(),
  targetModel: z.string().min(1).optional(),
})
```

**`models.service.ts`**（模式 B：无状态 service）：
```typescript
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
    findModelMapping: (providerType: string, sourceModel: string): ModelMapping | null => { ... },

    /** CRUD 函数（供 IPC 使用） */
    listModelMappings: (): ModelMapping[] => { ... },
    createModelMapping: (data: CreateModelMappingInput): ModelMapping => { ... },
    updateModelMapping: (id: number, data: UpdateModelMappingInput): ModelMapping => { ... },
    deleteModelMapping: (id: number): void => { ... },
  }
}

export type ModelsService = ReturnType<typeof createModelsService>
```

### 3. 代理逻辑修改

**修改文件**：`src/main/proxy/server.ts`（第 193 行前）

```typescript
// 现有逻辑：解析请求体，提取 model
const body = await c.req.json()
const model = body.model

// 新增：模型映射（调用 domain 层）
import { findModelMapping } from '../domains/models/models.service'
const mapping = findModelMapping(apiFormat, model)
const resolvedModel = mapping ? mapping.target_model : model

// 现有逻辑：路由解析（用映射后的 model）
const route = resolveProvider(resolvedModel)
```

### 4. 完整数据流（修改后）

```
1. 解析请求体，提取 model（如 "anthropic/opus-4.8"）
2. 判断 apiFormat（从请求路径）
3. 【新增】模型映射：findModelMapping(apiFormat, model)
   - 找到 → resolvedModel = target_model（如 "deepseek/deepseek-v4-pro"）
   - 未找到 → resolvedModel = model（原名）
4. 路由解析 → resolveProvider(resolvedModel)
5. 后续协议转换等逻辑不变
```

### 5. IPC 接口

**修改文件**：`src/main/ipc/index.ts`

```typescript
// 创建 service 实例
import { createModelsService } from '../domains/models/models.service'
import { createModelMappingSchema, updateModelMappingSchema } from '../domains/models/models.schema'

const modelsService = createModelsService()

// 注册 IPC handle（调用 domain 层，带 Zod 验证）
ipcMain.handle('models:list', async () => modelsService.getAllModels())
ipcMain.handle('models:mapping:find', async (_event, { providerType, sourceModel }) => modelsService.findModelMapping(providerType, sourceModel))
ipcMain.handle('models:mapping:list', async () => modelsService.listModelMappings())
ipcMain.handle('models:mapping:create', async (_event, data) => {
  const input = createModelMappingSchema.parse(data)  // 入口验证
  return modelsService.createModelMapping(input)
})
ipcMain.handle('models:mapping:update', async (_event, id, data) => {
  const input = updateModelMappingSchema.parse(data)  // 入口验证
  return modelsService.updateModelMapping(id, input)
})
ipcMain.handle('models:mapping:delete', async (_event, id) => modelsService.deleteModelMapping(id))
```

### 6. Preload 暴露

**修改文件**：`src/preload/index.ts`

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 现有方法
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    mapping: {
      find: (params) => ipcRenderer.invoke('models:mapping:find', params),
      list: () => ipcRenderer.invoke('models:mapping:list'),
      create: (input) => ipcRenderer.invoke('models:mapping:create', input),
      update: (id, updates) => ipcRenderer.invoke('models:mapping:update', { id, updates }),
      delete: (id) => ipcRenderer.invoke('models:mapping:delete', id),
    }
  }
})
```

### 7. 配置 UI

**新增页面**：`src/renderer/pages/ModelMappings.tsx`

**功能**：
- 映射列表（表格形式）
- 新增/编辑映射（对话框）
- 删除映射

**表单字段**：
- `provider_type`：下拉选择（anthropic / openai）
- `source_model`：下拉选择，调用 IPC `models:list`，过滤对应 providerType 的模型
- `target_model`：下拉选择，调用 IPC `models:list`，过滤对应 providerType 的模型

## 影响范围

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `src/main/db/schema.ts` | 修改 | 新增 model_mappings 表 |
| `src/main/domains/models/models.types.ts` | 新增 | 类型定义 |
| `src/main/domains/models/models.schema.ts` | 新增 | Zod 校验（必须） |
| `src/main/domains/models/models.service.ts` | 新增 | 业务逻辑层（getAllModels + 映射 CRUD） |
| `src/main/proxy/server.ts` | 修改 | 调用 domain 层的 findModelMapping |
| `src/main/proxy/router.ts` | 修改 | 删除 getAllModels（迁移到 domain 层） |
| `src/main/ipc/index.ts` | 修改 | 注册 models 相关 IPC handle（带 Zod 验证） |
| `src/preload/index.ts` | 修改 | 暴露 models IPC 方法 |
| `src/renderer/pages/ModelMappings.tsx` | 新增 | 配置 UI |
| `src/renderer/App.tsx` | 修改 | 添加路由 |

## 测试策略

### 单元测试

1. **数据访问层测试**（`model-mappings.test.ts`）
   - CRUD 操作
   - findModelMapping 查找逻辑
   - UNIQUE 约束

2. **代理逻辑测试**（`server.test.ts`）
   - 有映射时，model 被替换
   - 无映射时，model 保持不变
   - 映射后路由解析正确

### 集成测试

1. **端到端流程**
   - 配置映射 → 发送请求 → 验证上游收到映射后的模型名
   - 未配置映射 → 发送请求 → 验证上游收到原始模型名

## 边界情况

1. **映射不存在**：保持原 model 不变，后续逻辑正常执行
2. **映射禁用**（is_active=0）：等同于不存在
3. **target_model 的 provider 不存在**：路由解析阶段报错（现有逻辑）
4. **target_model 的 provider 未激活**：路由解析阶段报错（现有逻辑）
5. **target_model 不在 provider 的 models 白名单中**：路由解析阶段报错（现有逻辑）
