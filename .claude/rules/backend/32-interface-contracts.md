---
description: IPC/代理接口契约（输入校验、输出格式），始终加载
---

# 接口契约

## 输入校验
- 所有外部入口（IPC handler、代理路由）的输入必须校验
- 校验在接口层完成，业务层假设输入已合法
- 使用 Zod schema 定义输入契约，`.parse()` 在 handler 入口调用
- 校验失败返回明确的错误信息（字段名 + 失败原因）

## 输出契约
- 成功响应：返回结构化数据，类型与 service 返回类型一致
- 错误响应：统一错误格式 `{ error: string, code?: string }`
- 禁止返回裸字符串或 undefined 作为成功响应

## IPC 通道命名
- 格式：`{domain}:{action}`，如 `providers:list`、`agents:create`
- 动作词：list / getById / create / update / delete
- 禁止使用驼峰或下划线混用

## IPC handler 规范
- handler 参数必须有显式类型标注（禁止隐式 any）
- handler 只做：校验输入 → 调用 service → 捕获错误并映射 → 返回结果（错误映射规则见 34-error-handling.md）
- handler 内禁止 catch 后返回 null 或静默吞没错误（错误映射规则见 34-error-handling）

## 代理路由规范
- 代理端点遵循标准 API 路径（如 `/v1/chat/completions`）
- 工具端点：`/v1/models`、`/health`
- 流式响应使用 SSE，非流式返回 JSON

## 禁止
- IPC handler 的 data 参数使用隐式 any
- IPC create/update handler 入口缺少 Zod `.parse()` 验证
- handler 中编写业务逻辑（Map 聚合、条件判断、数据转换）
- 返回值类型与 service 返回类型不一致（handler 做了额外转换）
- 代理路由（proxy/）导入 db/、domains/ 下的文件（导入约束见 30-layered-architecture.md 导入路径约束）

```typescript
// ❌ 错误：隐式 any + 缺少 Zod 校验 + handler 内写业务逻辑
ipcMain.handle('agents:create', async (_event, data) => {  // data 隐式 any
  const agent = await agentService.create(data)             // 无 Zod 校验
  const config = await agentService.getConfig(agent.id)     // 业务逻辑应在 service
  if (!config) throw new Error('no config')
  return { ...agent, config }
})

// ✅ 正确：显式类型 + Zod 校验 + 委托 service
const createAgentSchema = z.object({ name: z.string().min(1), providerId: z.number() })
ipcMain.handle('agents:create', async (_event, data: CreateAgentInput) => {
  const parsed = createAgentSchema.parse(data)  // 校验在入口
  return agentService.create(parsed)            // 透传 service 返回值
})
```
