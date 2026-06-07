---
description: 领域建模与服务结构（工厂注入模式），始终加载
---

# 领域建模

## 服务边界
- 按聚合根划分 domain，不按数据库表划分
- 每个 domain 有且仅一个 `service.ts` 作为业务入口

## 服务内部结构
每个 domain 目录包含三个文件：
- `{name}.types.ts` — 类型定义（输入、输出、实体）
- `{name}.schema.ts` — Zod 校验 schema（create/update 必须）
- `{name}.service.ts` — 业务逻辑入口

## 工厂注入模式

### 签名规范
- 每个 service 通过工厂函数创建：`createXxxService(_db: Database)`
- Database 实例由调用方（IPC 层）通过 `getDb()` 获取后注入
- 工厂函数返回纯对象，方法通过闭包访问注入的 `db`
- 类型导出：`export type XxxService = ReturnType<typeof createXxxService>`

### 当前模式（模式 A）— 过渡期（当前代码库所有 domain 使用此模式）
数据层函数（`db/*.ts`）内部管理数据库连接（`getDb()`），service 直接导入并调用。
`_db` 参数为占位符，预留未来注入。service 内部不使用 `_db`，而是直接调用 `db/*.ts` 函数。
```typescript
// domains/provider/provider.service.ts
import { listProviders, createProvider } from '../../db/providers'

export function createProviderService(_db: Database) {  // _db 为占位符，service 内部直接调用 db/*.ts
  return {
    list: async () => listProviders(),       // db/*.ts 内部自行调用 getDb()
    create: async (input) => createProvider(input),
  }
}
```

### 禁止的错误模式
service 内部禁止直接编写 SQL（`db.prepare(...)`），必须委托给 `db/*.ts` 数据层函数：
```typescript
// ❌ 错误：service 内联 SQL，绕过数据层
export function createApiKeyService(db: Database) {
  return {
    list: async () => db.prepare('SELECT * FROM api_keys').all(),  // 禁止！
  }
}

// ✅ 正确：委托给数据层函数
import { listApiKeys } from '../../db/api-keys'
export function createApiKeyService(_db: Database) {
  return {
    list: async () => listApiKeys(),  // 正确
  }
}
```

### 目标模式（模式 B）— 完全注入（需要 mock 数据库的单元测试时使用）
当需要更好的可测试性时，将 `db/*.ts` 函数改为接受 `db` 参数，service 通过注入的 `db` 调用。

**迁移步骤：**
1. 修改 `db/*.ts` 函数签名，添加 `db: Database` 作为第一个参数
2. 去掉 service 工厂参数的 `_` 前缀（`_db` → `db`）
3. 更新 service 调用处，将 `db` 传递给数据层函数

```typescript
// db/providers.ts（模式 B）
export function listProviders(db: Database) { return db.prepare('SELECT * FROM providers').all() }

// domains/provider/provider.service.ts（模式 B）
import { listProviders } from '../../db/providers'
export function createProviderService(db: Database) {  // 去掉 _ 前缀
  return {
    list: async () => listProviders(db),  // 将注入的 db 传递给数据层
  }
}
```

**如何选择模式：** 当前统一使用模式 A。仅在需要编写 mock 数据库的 service 单元测试时，才迁移相关 domain 到模式 B。

## 服务间通信
- 单向调用：A service 可以引用 B service（通过模块导入），但不允许反向引用
- 禁止循环依赖：A 引用 B 且 B 同时引用 A
- 跨 domain 的数据聚合优先在接口层完成，避免 service 之间深度耦合

## 禁止
- 一个 domain 包含多个 service 文件（应拆分为多个 domain）
- 缺少 `{name}.schema.ts` 的 domain（校验在接口层执行，但 schema 定义归属 domain）
