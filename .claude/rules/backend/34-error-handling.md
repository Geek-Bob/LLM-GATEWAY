---
description: 错误处理规范（分类、传播、映射），始终加载
---

# 错误处理

## 错误分类（基于消息格式，非自定义类）

使用原生 `Error`，通过消息前缀区分错误类型：

| 类别 | 消息格式 | 触发层 |
|------|---------|--------|
| 验证错误 | `Invalid input: {path}: {message}` | 接口层（Zod `.parse()` 后映射） |
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

## IPC 错误映射
- IPC handler 捕获错误后，将错误信息序列化为可读字符串返回给渲染进程
- 业务错误返回用户可见消息
- 系统错误返回通用提示，详细信息记录到日志
- 返回格式见 32-interface-contracts.md 输出契约（`{ error: string, code?: string }`）

## 代理错误映射
- 上游返回的 HTTP 错误透传给客户端
- 网络连接失败返回 502，附带错误描述
- 超时返回 504，附带超时时长

## 禁止
- 空 catch 块（`catch {}`）
- 只打印不处理（`catch(e) { console.log(e) }`）
- 吞没错误（`.catch(() => null)`）
- 将系统错误的详细堆栈暴露给用户
- 批量操作必须有原子性保证（事务或全部回滚，详见 33-data-access.md 事务边界）

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
