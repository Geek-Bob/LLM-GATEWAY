---
description: 错误处理规范（分类、传播、映射），始终加载
---

# 错误处理

## 错误分类（基于消息格式，非自定义类）

使用原生 `Error`，通过消息前缀区分错误类型：

| 类别 | 消息格式 | 触发层 |
|------|---------|--------|
| 验证错误 | `Invalid input: {field}: {message}` | 接口层（Zod `.parse()` 后映射） |
| 业务错误 | `Failed to {action} {entity}: {reason}` | 业务层（service 抛出） |
| 系统错误 | `Database not initialized` 等基础设施消息 | 数据层 / 基础设施层 |

```typescript
// IPC handler 中的 Zod 错误映射
try {
  const data = schema.parse(input)
} catch (e) {
  if (e instanceof ZodError) {
    const issues = e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    return { error: `Invalid input: ${issues}` }
  }
  throw e
}
```

- 禁止用一个通用错误消息格式处理所有错误（必须能从消息区分来源）
- 禁止自定义错误子类（除非项目引入错误类体系，此条自动废止）

## 错误传播规则
- 数据层：抛出基础设施错误（数据库操作失败），不抛业务规则错误
- 业务层：抛出业务规则错误（实体不存在、规则不允许），不处理系统错误
- 接口层：捕获所有错误，映射为统一格式返回给调用方
- 错误从底层向顶层传播，每层添加自己层的上下文信息

## 错误上下文
- 每次 throw 必须携带：操作名 + 关键参数
- 错误消息格式：`Failed to {action} {entity}: {reason}`
- 禁止抛出无上下文的错误（如 `throw new Error('error')`）

```typescript
// ✅ 正确
throw new Error(`Failed to delete agent: cannot delete builtin agent ${id}`)
throw new Error(`Failed to switch config: config ${configId} not found`)
throw new Error(`Failed to resolve provider: provider is disabled "${prefix}"`)

// ❌ 错误
throw new Error('error')                    // 无上下文
throw new Error('delete failed')            // 无实体名
throw new Error(`Agent ${id} not found`)    // 格式不符
```

## 统一包装

项目提供 src/main/ipc/ipc-utils.ts#wrapIpcHandler(handler, channel)，所有 ipcMain.handle **必须**经它包装：

```typescript
import { wrapIpcHandler } from './ipc-utils'

ipcMain.handle('provider:create', wrapIpcHandler(async (_event, data: unknown) => {
  const input = createProviderSchema.parse(data)
  return providerService.create(input)
}, 'provider:create'))
```

禁止在 handler 内手写 try/catch（除非需要分支化处理 ZodError 之外的特定错误，且必须有充分理由说明）。

## IPC 错误映射
- IPC handler **必须**用 `wrapIpcHandler`（见上文「统一包装」）包装，禁止依赖 Electron 自动序列化异常；禁止在 handler 内手写 try/catch（除非需分支化处理 ZodError 之外的特定错误，且有充分理由）
- `wrapIpcHandler` 内部捕获后将错误映射为统一格式返回给渲染进程，禁止 throw 到 Electron 层
- 业务错误返回用户可见消息，系统错误返回通用提示 + 日志记录
- 返回格式见 `backend/32-interface-contracts.md` 输出契约（`{ error: string, code?: string }`）

```typescript
// ✅ 正确：经 wrapIpcHandler 包装（实际写法，handler 内不写 try/catch）
ipcMain.handle('provider:create', wrapIpcHandler(async (_event, data: unknown) => {
  const input = createProviderSchema.parse(data)   // ZodError 由 wrapIpcHandler 统一捕获映射
  return providerService.create(input)
}, 'provider:create'))

// 仅供理解：以下为 wrapIpcHandler 内部的等价逻辑（禁止在业务 handler 手写）
//   try { ... }
//   catch (e) {
//     if (e instanceof ZodError) {
//       const issues = e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
//       return { error: `Invalid input: ${issues}` }
//     }
//     logger.error('...', { error: (e as Error).message })
//     return { error: `...: internal error` }
//   }

// ❌ 错误：无 try/catch（且未经 wrapIpcHandler 包装），依赖 Electron 自动序列化
ipcMain.handle('providers:create', async (_event, data) => {
  const parsed = createProviderSchema.parse(data)  // ZodError 直接抛到 Electron
  return await providerService.create(parsed)       // 业务错误直接抛到 Electron
})
```

## 代理错误映射

代理层错误契约（上游透传 / 502 连接失败 / 504 超时 / `{ error: { type, message } }` 响应格式）统一定义于 `38-proxy.md` 的「错误映射」小节，此处不重复，避免双定义漂移。本节仅约束 IPC 层错误映射（见上文「IPC 错误映射」）。

## 批量操作原子性
- 涉及多次 INSERT/UPDATE/DELETE 的批量操作必须在事务中执行，失败时全部回滚（事务边界详见 `backend/33-data-access.md`）

## 禁止
- 空 catch 块（`catch {}`）
- 只打印不处理（`catch(e) { console.log(e) }`）
- 吞没错误（`.catch(() => null)`）
- 将系统错误的详细堆栈暴露给用户

```typescript
// ❌ 错误
try { await saveLog(entry) } catch {}                              // 空 catch
try { await saveLog(entry) } catch(e) { console.log(e) }          // 只打印
await saveLog(entry).catch(() => null)                             // 吞没
catch(e) { return { error: e.stack } }                             // 暴露堆栈

// ✅ 正确
try { await saveLog(entry) }
catch(e) { logger.debug('log save failed', { error: e.message }) } // 记录但不中断
await saveLog(entry).catch((e) => logger.debug('log save failed', { error: e.message }))
catch(e) { return { error: 'Failed to save log: internal error' } } // 通用消息
```
