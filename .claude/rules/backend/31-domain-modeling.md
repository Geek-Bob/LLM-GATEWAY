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

## 工厂注入模式（模式 B — 完全注入）

### 签名规范
- 每个 service 通过工厂函数创建：`createXxxService(db: Database)`
- Database 实例由调用方（IPC 层）通过 `getDb()` 获取后注入
- 工厂函数返回纯对象，方法通过闭包访问注入的 `db`
- 类型导出：`export type XxxService = ReturnType<typeof createXxxService>`

### 数据层注入
`db/*.ts` 函数统一接受 `db: Database` 作为第一个参数，service 将注入的 `db` 透传：
```typescript
// db/providers.ts
export function listProviders(db: Database) {
  return db.prepare('SELECT * FROM providers').all()
}

// domains/provider/provider.service.ts
import { listProviders } from '../../db/providers'
export function createProviderService(db: Database) {
  return {
    list: async () => listProviders(db),
    create: async (input) => createProvider(db, input),
  }
}
```

### 禁止的错误模式
```typescript
// ❌ 错误 1：service 内联 SQL，绕过数据层
export function createApiKeyService(db: Database) {
  return {
    list: async () => db.prepare('SELECT * FROM api_keys').all(),
  }
}

// ❌ 错误 2：db 函数内部调用 getDb()（破坏注入契约）
export function listProviders() {
  const db = getDb()  // 禁止！应通过参数接收
  return db.prepare('SELECT * FROM providers').all()
}

// ❌ 错误 3：service 参数使用 _db 占位符但不使用（已废弃的模式 A 残留）
export function createProviderService(_db: Database) {
  return { list: async () => listProviders() }  // _db 未传递给 db 函数
}
```

## 服务间通信
- 单向调用：A service 可以引用 B service（通过模块导入），但不允许反向引用
- 禁止循环依赖：A 引用 B 且 B 同时引用 A
- 跨 domain 的数据聚合优先在接口层完成，避免 service 之间深度耦合

## 禁止
- 一个 domain 包含多个 service 文件（应拆分为多个 domain）
- 缺少 `{name}.schema.ts` 的 domain（校验在接口层执行，但 schema 定义归属 domain）
