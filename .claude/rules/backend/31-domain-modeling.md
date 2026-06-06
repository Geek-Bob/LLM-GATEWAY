# 领域建模

## 服务边界
- 每个独立业务概念（Provider、ApiKey、Agent 等）为一个 domain
- 每个 domain 有且仅一个 `service.ts` 作为业务入口
- 按聚合根划分 domain，不按数据库表划分

## 服务内部结构
每个 domain 目录包含三个文件：
- `{name}.types.ts` — 类型定义（输入、输出、实体）
- `{name}.schema.ts` — Zod 校验 schema（create/update 必须）
- `{name}.service.ts` — 业务逻辑入口

## 服务函数规范
- 服务函数是纯数据操作，不感知 HTTP/IPC 上下文
- 服务函数的参数和返回值必须有明确类型
- 服务函数内部流程：校验输入 → 执行业务规则 → 调用数据操作 → 返回结果

## 服务间通信
- 同步调用：通过函数调用引用其他 service（注入或模块导入）
- 禁止循环依赖：A service 不得引用 B service，同时 B service 也引用 A service
- 跨 domain 数据聚合在接口层完成，不在业务层互相调用

## 禁止
- 在 service 中直接操作数据库连接对象
- 在 service 中引入 HTTP 框架代码（Hono、Express 等）
- 一个 domain 包含多个 service 文件（拆分为多个 domain）
- service 函数超过 50 行（拆分为子函数）
- 缺少 schema.ts 的 domain（所有 create/update 入口必须有 Zod 校验）
