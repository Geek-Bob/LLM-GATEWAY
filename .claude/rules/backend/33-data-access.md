---
description: 数据访问规范（查询抽象、连接管理、Schema），始终加载
---

# 数据访问

## 查询抽象
- 数据层提供函数式接口（如 `findProviders()`、`insertApiKey()`），封装所有 SQL 操作
- 业务层与数据层的依赖方向见 30-layered-architecture.md 导入路径约束（当前模式 A：直接导入 db/*.ts 函数；目标模式 B：通过注入 db 参数调用）
- 禁止绕过数据层直接编写 SQL（详见 31-domain-modeling.md 禁止的错误模式）

## 连接管理
- 业务层通过 service 工厂函数参数获取 db 实例，禁止导入 `db/connection.ts` 的 `getDb()`
- 禁止在业务逻辑中创建新的数据库连接（生命周期由入口层管理）

## Schema 管理
- 表结构定义集中在 `db/schema.ts`，新增表或字段必须在此声明，禁止运行时 ALTER
- 字段命名使用 snake_case（数据库层），应用层使用 camelCase，映射在 service 层完成
  ```typescript
  // db/providers.ts 返回 snake_case
  // { id: 1, provider_type: 'openai', api_key: 'sk-...' }
  // provider.service.ts 转换为 camelCase
  // { id: 1, providerType: 'openai', apiKey: 'sk-...' }
  ```

## 事务边界
- 需要原子操作的多步写入必须在事务中完成，事务在数据层开启和提交
- 事务失败必须回滚，禁止部分提交

## NDJSON 日志存储
日志存储规范见 36-observability.md 日志轮转部分。

## 禁止
- 数据层函数包含业务规则判断（如权限校验、条件过滤逻辑）
- 在循环中逐条插入（使用批量操作）
- 数据库连接对象泄漏（未在退出时关闭）
