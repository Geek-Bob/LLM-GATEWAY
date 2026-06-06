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
- handler 只做：校验输入 → 调用 service → 返回结果
- 错误通过 throw 传播，不在 handler 内 catch 后返回 null

## 代理路由规范
- 代理端点遵循标准 API 路径（如 `/v1/chat/completions`）
- 工具端点：`/v1/models`、`/health`
- 流式响应使用 SSE，非流式返回 JSON

## 禁止
- IPC handler 的 data 参数使用隐式 any
- IPC create/update handler 入口缺少 Zod `.parse()` 验证
- handler 中编写业务逻辑（Map 聚合、条件判断、数据转换）
- 返回值类型与 service 返回类型不一致（handler 做了额外转换）
- 代理路由中直接操作数据库
