---
description: 可观测性规范（日志分层、格式、轮转），始终加载
---

# 可观测性

## 日志分层
- ERROR：系统错误，需要立即关注（数据库连接断开、文件写入失败）
- WARN：业务异常，不影响系统运行但需关注（输入校验失败、限流触发）
- INFO：关键业务事件（服务启动、配置变更、代理请求完成）
- DEBUG：调试信息（请求详情、SQL 语句、SSE 事件），仅开发环境启用

## 日志格式
- 统一使用 `core/logger.ts`（禁止项见末尾）
- 日志消息包含：时间戳 + 级别 + 模块名 + 消息
- 结构化数据通过 metadata 对象传递，不拼接到消息字符串

## 请求链路
- 每个代理请求必须记录：请求路径、供应商、模型、状态码、耗时
- 错误请求必须记录：错误类型、错误消息、请求上下文
- 流式响应结束时记录：总 token 数、首 token 延迟

## 调试日志
- 调试日志使用独立文件（如 `llm-gateway-proxy-debug.log`）
- 每次应用启动时自动清空调试日志文件
- 调试日志不计入正式日志轮转配额

## 日志轮转
- 正式日志：500 行/文件，最多 20 文件（10000 条上限）
- 元数据（entryCounter、currentFileNumber、currentFileLines）记录在 logs-meta.json
- 轮转策略变更时必须运行迁移脚本 `scripts/migrate-logs.mjs`

## 禁止
- 使用 `console.log` / `console.error` / `console.warn` 输出日志
- 日志消息中拼接大对象（使用 metadata 传递，由 logger 决定序列化方式）
- 在循环中逐行写日志（批量操作合并为一条日志）
- DEBUG 级别日志在生产环境中输出
- 日志中出现未脱敏的 API Key、Token、密码（脱敏规则见 35-security.md）
