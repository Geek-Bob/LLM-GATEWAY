---
description: 数据访问规范（查询抽象、连接管理、Schema），始终加载
---

# 数据访问

## 查询抽象
- 数据层统一采用 Repository 工厂模式：`createXxxRepository(db: Database)` 返回方法对象
- Repository 封装所有 SQL 操作，对外暴露领域语义方法（如 `findById`、`findActive`、`remove`）
- 禁止 Repository 内部调用 `getDb()` 获取连接（破坏注入契约）
- 禁止绕过 Repository 直接编写 SQL（详见 `backend/31-domain-modeling.md` 禁止的错误模式）

## 连接管理
- Database 实例由入口层（`index.ts`）通过 `getDb()` 获取，注入到 IPC handler → service → Repository
- 禁止 service 或 Repository 内部调用 `getDb()`（破坏依赖注入链）
- 禁止在业务逻辑中创建新的数据库连接（生命周期由入口层管理）

## Repository 模式
- 所有 SQLite 数据访问文件统一使用 `createXxxRepository(db)` 工厂函数
- 工厂返回纯对象，方法通过闭包访问注入的 `db`
- 类型导出：`export type XxxRepository = ReturnType<typeof createXxxRepository>`
- 文件内私有辅助函数（如参数转换、SQL 构建）不导出
- NDJSON 文件操作（logs-reader/logs-writer）不适用 Repository 模式，保持裸函数

## Schema 管理
- 表结构定义集中在 `db/schema.ts`，新增表或字段必须在此声明，禁止运行时 ALTER
- 字段命名使用 snake_case（数据库层），应用层使用 camelCase，映射在 service 层完成
  ```typescript
  // db/providers.ts 返回 snake_case
  // { id: 1, provider_type: 'openai', api_key: 'sk-...' }
  // provider.service.ts 转换为 camelCase
  // { id: 1, providerType: 'openai', apiKey: 'sk-...' }
  ```

## 跨进程类型契约（命名映射）

### 双层契约
- **存储契约（snake_case）**：DB Row（sql.js）+ NDJSON 日志行。磁盘/序列化格式，禁止对外暴露。
- **对外契约（camelCase）**：service 返回值、IPC 返回值、preload 桥接、renderer 类型。所有跨进程边界类型必须 camelCase。
- **映射位置在 service 层**：Repository / NDJSON reader 返回 snake_case 原始行，service 转 camelCase 后返回。Repository 禁止返回 camelCase（避免双重映射），service 禁止返回 snake_case（避免存储风格泄漏到对外契约）。

### 新代码约束
- 新增跨进程实体/字段：DB Row 用 snake_case，对外类型用 camelCase，service 层补映射，二者缺一不可。
- 新增 NDJSON 日志字段：存储用 snake_case，对外 LogEntry 类型用 camelCase，reader/`logRowToResponse` 补映射。
- 跨进程类型定义位置：`shared/types.ts` 定义基础实体，`renderer/lib/types.ts` 与 `preload/types.ts` 通过 type alias 派生，禁止重新定义同名 interface。

### 禁止
- 同一 domain service 内部对外契约混用 snake/camel。
- 跨进程类型（`shared/types.ts`、`renderer/lib/types.ts`、`preload/types.ts`）按存储 snake_case 风格定义。
- Repository / NDJSON reader 直接返回 camelCase（绕过 service 映射），或 service 直接返回 snake_case Row（绕过映射）。

## 事务边界
- 涉及 2 个以上 INSERT/UPDATE/DELETE 的操作必须在事务中完成，事务在数据层开启和提交
- 事务失败必须回滚，禁止部分提交

## NDJSON 日志存储
日志存储规范见 `backend/36-observability.md` 日志轮转部分。

## 禁止
- 数据层函数包含业务规则判断（如权限校例、条件过滤逻辑）
- 在循环中逐条插入（使用批量操作）
- 数据库连接对象泄漏（未在退出时关闭）

```typescript
// ❌ 错误：循环逐条插入
for (const item of items) {
  db.prepare('INSERT INTO messages (content) VALUES (?)').run(item.content)
}

// ✅ 正确：批量插入（事务内）
// 项目使用 sql.js/WASM，无 db.transaction() 声明性 API；事务用 BEGIN/COMMIT/ROLLBACK 显式控制
// 注：db 即经 createXxxRepository(db) 注入的 Database 实例（db/database.ts 封装），
// exec/prepare/run 均为该封装的同步 API（sql.js 本身同步），事务语义同标准 SQLite
db.exec('BEGIN')
try {
  const stmt = db.prepare('INSERT INTO messages (content) VALUES (?)')
  for (const item of items) stmt.run(item.content)
  db.exec('COMMIT')
} catch (e) {
  db.exec('ROLLBACK')
  throw e
}

// ❌ 错误：Repository 内部调用 getDb()
export function createMessageRepository() {
  const db = getDb()  // 破坏注入契约
  return { create: (data) => db.prepare('INSERT INTO messages ...').run(data) }
}

// ✅ 正确：通过参数注入
export function createMessageRepository(db: Database) {
  return { create: (data) => db.prepare('INSERT INTO messages ...').run(data) }
}
```
