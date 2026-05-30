---
paths:
  - "src/main/domains/**"
  - "src/main/server/**"
---

# API 约定

## URL 模式
- 管理类：`/v1/admin/{resource}` + `/:id`
- 功能类：`/v1/{action}`（如 `/v1/chat/completions`）
- 代理类：`/v1/proxy/{provider}/{model}/*`

## 响应格式
- 成功：直接返回 JSON 对象或数组（不包裹外层 envelope）
- 列表：返回数组 `[{...}, {...}]`
- 错误：`{ error: string, code?: string }` + 对应 HTTP 状态码
- 创建：返回创建后的对象 + 201 状态码

## 中间件
- `auth.ts`：提取 Authorization Bearer token → 校验 gateway API key
- `rate-limit.ts`：每个 API key 每分钟最多 60 次请求
- 中间件失败返回 `{ error: "..." }` + 401/429 状态码

## 禁止
- 路由文件超过 50 行
- 在路由中直接操作数据库
- 使用 Hono 之外的 HTTP 框架
