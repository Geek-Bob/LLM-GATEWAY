---
paths:
  - "src/main/proxy/**"
---

# Proxy HTTP API 约定（仅 Chat 代理端点使用 Hono）

> 业务 CRUD 全部走 IPC，不使用 Hono。以下仅适用 proxy 代理端点。

## URL 模式
- 代理类：`/v1/chat/completions`（OpenAI 格式）、`/v1/messages`（Anthropic 格式）
- 工具类：`/v1/models`、`/health`

## 响应格式
- 成功：直接返回 JSON 对象或数组（不包裹外层 envelope）
- 错误：`{ error: string }` + 对应 HTTP 状态码
- 流式：SSE（Server-Sent Events）

## 禁止
- proxy/server.ts 中写业务 CRUD 路由
- 使用 Hono 之外的 HTTP 框架
