---
description: 代理层规范（路由、SSE 兼容性、认证头差异），仅编辑代理层代码时加载
paths:
  - "src/main/proxy/**"
---

# 代理层规范

## 路由规范
- 代理端点遵循标准 API 路径（如 `/v1/chat/completions`）
- 工具端点：`/v1/models`、`/health`
- 流式响应使用 SSE，非流式返回 JSON

## SSE 解析兼容性
- 上游 Provider 可能返回非标准 SSE 格式（`data:json` 无空格）
- 所有 SSE 解析点必须兼容 `data: ` 和 `data:` 两种格式
- 涉及文件：`proxy/logger.ts`（extractContentFromSSE / extractUsageFromSSE）、`proxy/stream.ts`（convertSSEStream，由 createStreamService 创建）、`proxy/converter/sse.ts`（事件级转换）、`renderer/features/chat/hooks/useChatStream.ts`（前端流消费）

## 认证头差异
- Anthropic API 使用 `x-api-key` 头
- OpenAI 使用 `Authorization: Bearer` 头
- `forwarder.ts` 中按 providerType 分别处理

## 错误映射
- 上游返回的 HTTP 错误透传给客户端
- 网络连接失败返回 502，附带错误描述
- 超时返回 504，附带超时时长
- 错误响应格式：`{ error: { type: string, message: string } }`

```typescript
// ✅ 代理错误响应示例
return c.json({ error: { type: 'upstream_error', message: `Failed to connect: ${providerName} unreachable` } }, 502)
return c.json({ error: { type: 'timeout', message: `Request timeout after ${timeoutMs}ms` } }, 504)
```
