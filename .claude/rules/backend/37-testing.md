# 测试策略

## 测试金字塔
- 单元测试（service、schema）：占比最大，快速、隔离、可重复
- 集成测试（IPC handler、代理路由）：验证层间协作
- 端到端测试（完整请求链路）：验证系统行为，数量最少

## Mock 边界
- Mock 外部依赖（上游 API、文件系统），不 mock 内部模块
- 数据库测试使用内存数据库，不 mock 数据库操作
- IPC handler 测试直接调用 service，不 mock service 层
- 代理测试使用 mock 的上游响应，不发起真实 HTTP 请求

## Service 测试
- 每个 service.ts 必须有对应的 service.test.ts
- 覆盖：CRUD 操作、边界条件、错误处理
- 测试数据使用工厂函数创建，不硬编码

## Schema 测试
- 每个 schema.ts 必须有对应的 schema.test.ts
- 覆盖：合法输入接受 + 非法输入拒绝 + 边界值
- 非法输入测试必须验证具体错误字段

## 代理测试
- 请求转换（OpenAI → Anthropic）必须有测试
- 响应转换（Anthropic → OpenAI）必须有测试
- SSE 流解析必须有测试（含非标准格式兼容）

## 测试数据管理
- 每个测试用例自行创建所需数据，不依赖其他测试的副作用
- 测试结束后清理数据（beforeEach / afterEach）
- 使用工厂函数生成测试数据，避免重复代码

## 禁止
- 测试文件导入未测试的 domain 模块的内部实现
- 测试依赖执行顺序（每个测试必须能独立运行）
- 测试中使用真实的 API Key 或外部服务
- 跳过失败的测试（修复或删除，不留 skip）
