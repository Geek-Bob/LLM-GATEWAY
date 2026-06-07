---
description: 后端测试策略（vitest + node 环境），按需加载
paths:
  - "src/main/**/*.test.*"
  - "src/main/**/__tests__/**"
---

# 测试策略

## 测试框架
- 框架：vitest 4.x（前后端共用，配置分离）
- 前端配置：`vitest.config.ts`（environment: jsdom，覆盖 `src/renderer/`）
- 后端配置：`vitest.backend.config.ts`（environment: node，覆盖 `src/main/`）
- 命令：`npm test`（全量）、`npm run test:frontend`、`npm run test:backend`

## 测试金字塔
- 单元测试（service、schema）：每个 service/schema 必须有单元测试，快速、隔离、可重复
- 集成测试（IPC handler、代理路由）：每个 IPC handler 必须有集成测试，验证层间协作
- 端到端测试（完整请求链路）：仅覆盖核心热路径（如代理请求链路），数量最少

## Mock 边界
- Mock 外部依赖（上游 API、文件系统），不 mock 内部模块
- 数据库测试使用内存数据库，不 mock 数据库操作
- IPC handler 测试直接调用 service，不 mock service 层
- 代理测试使用 mock 的上游响应，不发起真实 HTTP 请求

## Service 测试
- 每个 `domains/{name}/{name}.service.ts` 必须有对应的 `{name}.service.test.ts`（同目录）
- 覆盖：CRUD 操作、边界条件、错误处理
- 测试数据使用工厂函数创建，不硬编码

## Schema 测试
- 每个 `domains/{name}/{name}.schema.ts` 必须有对应的 `{name}.schema.test.ts`（同目录）
- 覆盖：合法输入接受 + 非法输入拒绝 + 边界值
- 非法输入测试必须验证具体错误字段

## 代理测试
- 请求转换（OpenAI → Anthropic）必须有测试
- 响应转换（Anthropic → OpenAI）必须有测试
- SSE 流解析必须有测试（含非标准格式兼容）

## 测试数据管理
- 每个测试用例自行创建所需数据，不依赖其他测试的副作用
- 测试结束后清理数据（beforeEach / afterEach）

## 禁止
- 测试文件导入非本 domain 的 service 实现（如 `providers.service.test.ts` 不导入 `api-keys.service.ts`）
- 测试依赖执行顺序（每个测试必须能独立运行）
- 测试中使用真实的 API Key 或外部服务
- 跳过失败的测试（修复或删除，不留 skip）
