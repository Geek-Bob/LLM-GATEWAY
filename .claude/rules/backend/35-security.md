---
description: 安全规范（信任边界、API Key 保护、网络安全），始终加载
---

# 安全

## 信任边界
- 所有来自渲染进程的 IPC 调用视为不可信输入
- 所有来自外部 HTTP 请求的代理调用视为不可信输入
- 仅 localhost 回环地址视为可信网络

## 输入校验（安全视角）
- 文件路径参数必须校验是否在允许的目录内（防止路径遍历）
  ```typescript
  // 使用 path.resolve() 解析绝对路径，path.relative() 检查是否在允许目录内
  const resolved = path.resolve(baseDir, userInput)
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error(`Invalid input: path: ${userInput} is outside allowed directory`)
  }
  ```
- 代理路由的请求体必须校验格式合法性（防止注入攻击）
- 校验规则的完整描述见 `32-interface-contracts.md`，此处仅补充安全特有的校验点

## API Key 与敏感数据保护
- API Key 通过 Authorization / X-Api-Key 头透传给上游，不存储在本地日志
- 日志中 API Key 必须脱敏：只保留后 4 位，前缀用 `***` 替代
  ```typescript
  // ✅ 正确：保留后 4 位
  const masked = '***' + apiKey.slice(-4)
  // 示例：sk-abc123456789 → ***6789

  // ❌ 错误：slice(0, 12) 泄漏前 12 位
  const wrong = apiKey.slice(0, 12) + '***'
  ```
- 禁止将 API Key 写入 NDJSON、console、调试日志或任何持久化输出
- 请求头中的 Authorization 字段禁止写入调试日志
- 响应体中的 token / key 字段在日志中必须脱敏
- 在 catch 块中禁止将敏感参数原样写入错误消息
- 禁止重新引入任何加密/解密函数（如 crypto-js、node:crypto 的 encrypt/decrypt），保持简单

## 网络安全
- 代理服务只监听 localhost（127.0.0.1），不对外暴露端口
- 禁止监听 0.0.0.0（除非用户明确配置局域网共享）
- 不做 HTTPS 证书校验（本地回环可信）

## 禁止
- 日志中出现未脱敏的 API Key、Token、密码
- 代理监听 0.0.0.0（除非用户明确配置）

```typescript
// ❌ 错误
log.info('request', { headers: { authorization: headerValue } })  // 原样输出
log.info('auth fail', { token: token.slice(0, 10) + '...' })     // 泄漏前10位
serve({ fetch: app.fetch, port: 8080 })                          // 默认 0.0.0.0

// ✅ 正确
log.info('request', { headers: { authorization: '***' + headerValue.slice(-4) } })
log.info('auth fail', { token: '***' + token.slice(-4) })
serve({ fetch: app.fetch, port: 8080, hostname: '127.0.0.1' })   // 显式绑定 localhost
```
