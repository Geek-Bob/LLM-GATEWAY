<div align="center">

<img src="resources/icon.png" alt="LLM Gateway" width="120" />

# LLM Gateway

**桌面 AI 网关 — 零部署，一键管理多供应商、多模型**

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README.zh_CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/Geek-Bob/LLM-GATEWAY"><img src="https://img.shields.io/github/stars/Geek-Bob/LLM-GATEWAY?style=social" alt="stars"></a>
  <a href="https://github.com/Geek-Bob/LLM-GATEWAY/blob/master/LICENSE"><img src="https://img.shields.io/github/license/Geek-Bob/LLM-GATEWAY?color=brightgreen" alt="license"></a>
  <a href="https://github.com/Geek-Bob/LLM-GATEWAY/releases"><img src="https://img.shields.io/github/v/release/Geek-Bob/LLM-GATEWAY?color=brightgreen" alt="release"></a>
</p>

</div>

---

## 它是什么

LLM Gateway 是一个运行在桌面上的 **AI 代理网关**。它在你的 AI 客户端和上游 LLM 供应商之间架一座桥，自动处理协议转换、认证、限流和日志。

**一个网关，所有供应商，所有协议。**

- 用 OpenAI SDK 调 Anthropic 模型？自动转换。
- 用 Anthropic 格式调 OpenAI 模型？自动转换。
- 多个供应商、多个 API Key？统一管理。

> [!IMPORTANT]
> 本项目面向合法授权的 AI API 网关、组织内部鉴权、多模型管理场景。使用者必须合法取得上游 API Key，并遵守上游服务条款。

---

## 核心能力

| 能力 | 说明 |
|------|------|
| **协议双向转换** | OpenAI ⇄ Anthropic 全字段转换：tools、streaming、thinking、web_search、response_format、图像/媒体 |
| **多供应商管理** | 同时配置多个 AI 供应商，每个供应商独立 API Key、模型列表 |
| **内置 Chat** | 多会话、流式响应、Thinking 内容展示、一键切换模型 |
| **可视化仪表盘** | 24h / 30d 请求量、Token 用量、错误率、供应商维度统计 |
| **请求日志** | 每条请求可追溯，支持 Debug 模式查看完整的协议转换过程 |
| **速率限制** | 按 API Key 的滑动窗口限流，防止滥用 |
| **加密存储** | API Key AES-256-GCM 加密，数据全部本地，不上传任何信息 |

---

## 与 New API 的对比

[New API](https://github.com/QuantumNous/new-api) 是服务端网关，需要 Docker 部署。LLM Gateway 是桌面应用，安装即用。

| 能力 | New API | LLM Gateway |
|------|:--:|:--:|
| OpenAI ⇄ Anthropic 协议转换 | ✅ | ✅ |
| `response_format` 双向转换 | ❌ | ✅ |
| `cache_control` 透传 | ❌ | ✅ |
| 桌面离线运行 | ❌ | ✅ |
| 协议转换可视化日志 | ❌ | ✅ |
| 独立可复用 converter 模块 | ❌ | ✅ |

---

## 快速开始

### 下载安装

从 [Releases](https://github.com/Geek-Bob/LLM-GATEWAY/releases) 页面下载对应平台的安装包：

- **Windows**: `LLM-Gateway-Setup-x64.exe`
- **macOS**: `LLM-Gateway.dmg`
- **Linux**: `LLM-Gateway.AppImage`

### 开发模式

```bash
git clone https://github.com/Geek-Bob/LLM-GATEWAY.git
cd llm-gateway
npm install
npm run dev
```

### 测试

```bash
npm test            # 294 tests
npm run test:watch  # 监听模式
```

---

## 使用指南

### 1. 添加供应商

打开 **Providers** 页面，添加你的 AI 供应商：

- **Name**: 供应商名称（如 `anthropic`、`openai`），这会成为模型路由前缀
- **Type**: 选择 `anthropic` 或 `openai`
- **Base URL**: 上游 API 地址
- **API Key**: 你的供应商 API Key
- **Models**: 该供应商支持的模型列表

### 2. 创建网关 API Key

打开 **API Keys** 页面，创建网关自己的 API Key。客户端用这个 Key 连接网关，网关再用供应商的 Key 转发请求。

### 3. 配置客户端

代理服务器默认运行在 `localhost:8080`。在你的 AI 客户端中：

```
Base URL: http://localhost:8080
API Key:  你创建的网关 API Key
Model:    供应商名/模型名（如 anthropic/claude-sonnet-4-20250514）
```

支持两种认证方式：
- `Authorization: Bearer <key>`
- `X-Api-Key: <key>`

### 4. 使用 Chat

打开 **Chat** 页面，选择供应商、模型和 API Key，直接对话。支持：

- 流式响应
- Thinking 内容展示
- 多会话管理
- 会话历史持久化

### 5. 查看日志和统计

- **Logs** 页面：查看每条请求的详情，开启 Debug 模式可看到完整的协议转换过程
- **Dashboard** 页面：查看请求量、Token 用量、错误率等统计图表

---

## API 端点

代理服务器运行在 `localhost:8080`（端口可配置）。

| 端点 | 协议 | 说明 |
|------|------|------|
| `POST /v1/chat/completions` | OpenAI | Chat Completions |
| `POST /v1/messages` | Anthropic | Messages |
| `GET /v1/models` | — | 列出所有可用模型 |
| `GET /health` | — | 健康检查 |

---

## 技术栈

| 层 | 技术 |
|------|------|
| 框架 | Electron 42 + Vite 6 |
| 前端 | React 19 + react-router-dom v7 + Tailwind CSS 4 + Framer Motion |
| 代理 | Hono 4 |
| 数据库 | sql.js (SQLite WASM) |
| 日志 | NDJSON 分片 |
| 测试 | Vitest + Testing Library |

---

## 技术架构

详细的模块分层、数据流、设计模式请参阅 [技术架构文档](docs/ARCHITECTURE.md)。

---

## 许可证

[MIT](LICENSE)

---

<div align="center">

**如果这个项目对你有帮助，请给我们一个 Star！**

[![Star History Chart](https://api.star-history.com/svg?repos=Geek-Bob/LLM-GATEWAY&type=Date)](https://star-history.com/#Geek-Bob/LLM-GATEWAY&Date)

</div>
