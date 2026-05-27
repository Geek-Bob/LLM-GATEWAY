<div align="center">

<img src="resources/icon.png" alt="LLM Gateway" width="120" />

# LLM Gateway

**🖥️ 下一代桌面 AI 网关与协议转换利器 | Next-Gen Desktop AI Gateway & Protocol Converter**

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

## 📝 项目介绍

LLM Gateway 是一个**轻量级桌面 AI 网关**，运行在 Electron 上，无需服务端部署。它不仅是一个 AI 代理服务器，更是一个**协议转换引擎**——在 OpenAI 和 Anthropic 协议之间无缝双向转换，让任何 AI 客户端都能使用任何供应商的模型。

与 [New API](https://github.com/QuantumNous/new-api)（服务端网关）不同，LLM Gateway 运行在您的**桌面本地**，零部署、零依赖、零配置即可使用。

> [!IMPORTANT]
> 本项目面向合法授权的 AI API 网关、组织内部鉴权、多模型管理场景。使用者必须合法取得上游 API Key，并遵守上游服务条款。

---

## ✨ 为什么选择 LLM Gateway？

### 🆚 与 New API 的对比

| 能力 | New API | LLM Gateway |
|------|:--:|:--:|
| OpenAI ⇄ Anthropic 协议转换 | ✅ | ✅ **更完整** |
| `response_format` 双向转换 | ❌ | ✅ **独家支持** |
| `cache_control` 透传 | ❌ | ✅ **独家支持** |
| 桌面离线运行 | ❌ 需要 Docker/服务器 | ✅ **Electron 本地** |
| TypeScript 类型安全 | ❌ Go | ✅ **编译期检查** |
| 协议转换可视化日志 | ❌ | ✅ **Dashboard 可见** |
| 独立可复用 converter 模块 | ❌ | ✅ **可被任何 TS 项目 import** |
| 跨平台 (Win/Mac/Linux) | ✅ Docker | ✅ **原生安装包** |

### 🎯 核心优势

- **🔄 协议无缝转换** — OpenAI ⇄ Anthropic 全字段双向转换，覆盖 tools、streaming、thinking、web_search、response_format、image/media 等所有字段
- **🖥️ 桌面原生** — 基于 Electron 42，安装即用，无需 Docker/服务器/数据库
- **📊 可视化仪表盘** — 实时请求统计、Token 用量、成本核算、转换日志
- **🔐 安全本地** — API Key 加密存储在本机，不上传任何数据
- **🚀 极致轻量** — sql.js 持久化（无需原生编译），NDJSON 日志分片
- **💬 内置 Chat** — 支持会话历史、流式响应、多模型切换
- **🧩 独立模块** — `converter.ts` 可单独发布为 npm 包，供其他项目使用

---

## 🚀 快速开始

### 下载安装

从 [Releases](https://github.com/Geek-Bob/LLM-GATEWAY/releases) 页面下载对应平台的安装包：

- **Windows**: `LLM-Gateway-Setup-x64.exe`
- **macOS**: `LLM-Gateway.dmg`
- **Linux**: `LLM-Gateway.AppImage`

### 开发模式

```bash
# 克隆仓库
git clone https://github.com/Geek-Bob/LLM-GATEWAY.git
cd llm-gateway

# 安装依赖
npm install

# 启动开发模式
npm run dev

# 运行测试
npm test            # 294 tests

# 构建
npm run build
```

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────┐
│                    Electron 42                    │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  React 19 UI  │  │   Hono Proxy Server       │  │
│  │  (Renderer)   │  │   (Main Process)          │  │
│  │               │  │                           │  │
│  │  • Chat       │  │  • Auth (Bearer/X-Api-Key)│  │
│  │  • Dashboard  │  │  • Rate Limiter           │  │
│  │  • Providers  │  │  • Router + Forwarder     │  │
│  │  • API Keys   │  │  ┌─────────────────────┐  │  │
│  │  • 请求日志    │  │  │    converter.ts     │  │  │
│  │               │  │  │  O ⟷ A 全字段双向    │  │  │
│  │               │  │  │  请求/响应/流式全链路  │  │  │
│  └──────────────┘  │  └─────────────────────┘  │  │
│                    │  • Debug 模式 (默认开启)    │  │
│                    └──────────────────────────┘  │
│           ↕ IPC (contextBridge)                    │
│  ┌────────────────────────────────────────────┐  │
│  │       sql.js (config.db)                   │  │
│  │  providers | api_keys | conversations      │  │
│  │  request_stats | request_stats_provider    │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │  NDJSON 日志分片 (logs/)                     │  │
│  │  logs-0001.ndjson ~ logs-0010.ndjson       │  │
│  │  每文件 10000 行，最多 10 文件               │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 🔄 协议转换能力

LLM Gateway 的核心转换模块支持 OpenAI ↔ Anthropic **全字段双向转换**：

<table>
<tr><th>类别</th><th>OpenAI → Anthropic</th><th>Anthropic → OpenAI</th></tr>
<tr><td>基础字段</td><td colspan="2" align="center">model, temperature, max_tokens, top_p, top_k, stream, service_tier</td></tr>
<tr><td>消息体</td><td>system → request.system</td><td>request.system → system message</td></tr>
<tr><td>消息合并</td><td colspan="2" align="center">相邻同角色合并、空消息→"..."、首条非 user 插入占位</td></tr>
<tr><td>Tools 定义</td><td>Function.parameters → Tool.inputSchema</td><td>inputSchema → parameters</td></tr>
<tr><td>Tool Choice</td><td>auto/required/none → auto/any/none</td><td>auto/any/none → auto/required/none</td></tr>
<tr><td>Tool 消息</td><td>tool → tool_result</td><td>tool_use + tool_result → tool_calls + tool</td></tr>
<tr><td>Web Search</td><td>web_search_options → web_search_20250305</td><td>web_search_20250305 → web_search_options</td></tr>
<tr><td>Thinking</td><td>reasoning_effort → thinking budget_tokens</td><td>thinking → reasoning_effort<br>thinking 块 → reasoning_content (回传保留)</td></tr>
<tr><td>Response Format</td><td>json_object → system prompt<br>json_schema → tool + tool_choice</td><td>system prompt 检测 → json_object<br>tool_choice 检测 → json_schema</td></tr>
<tr><td>图像/媒体</td><td>image_url → image source base64</td><td>image source → image_url base64</td></tr>
<tr><td>Stop 序列</td><td>stop → stop_sequences</td><td>stop_sequences → stop</td></tr>
<tr><td>流式 SSE</td><td>—</td><td>—</td></tr>
<tr><td>   C→O</td><td colspan="2">message_start, content_block_start/delta, message_delta, message_stop → OpenAI chunks</td></tr>
<tr><td>   O→C</td><td colspan="2">OpenAI chunks → message_start, content_block_start/delta/stop, message_delta/stop (含状态机)</td></tr>
<tr><td>错误响应</td><td colspan="2" align="center">双向错误格式互转</td></tr>
<tr><td>Finish/Stop</td><td colspan="2" align="center">stop, length, tool_calls, content_filter ↔ end_turn, max_tokens, tool_use, refusal</td></tr>
<tr><td>不兼容字段</td><td>移除: n, frequency_penalty, presence_penalty, seed, logprobs, logit_bias, stream_options</td><td>—</td></tr>
<tr><td>Header</td><td colspan="2" align="center">anthropic-version, anthropic-beta 透传/剥离</td></tr>
</table>

> **独家能力**: `response_format` 双向转换、`cache_control` 透传是 New API 所不具备的。

---

## 📡 API 端点

代理服务器运行在 `localhost:8080`（端口可配置）。

| 端点 | 协议 | 说明 |
|------|------|------|
| `POST /v1/chat/completions` | OpenAI | Chat Completions |
| `POST /v1/messages` | Anthropic | Messages |
| `GET /v1/models` | OpenAI | 模型列表 |
| `GET /health` | — | 健康检查 |

**认证**: 支持 `Authorization: Bearer <key>` 和 `X-Api-Key: <key>` 两种方式。

---

## 🎨 功能特性

| 特性 | 说明 |
|------|------|
| 🔄 协议自动转换 | OpenAI ⇄ Anthropic 全字段双向转换，零配置自动检测 |
| 💬 内置 Chat | 多会话、流式响应、Thinking 显示、模型/供应商切换 |
| 📊 Dashboard | 24h/30d 请求统计、Token 用量、错误率、供应商维度 |
| 🔑 多供应商管理 | 同时管理多个 AI 供应商和 API Key |
| 🔐 加密存储 | API Key AES 加密存储，本地 sql.js 数据库 |
| 📝 请求日志 | NDJSON 分片日志，可查询、可检索 |
| 🚦 速率限制 | 基于 API Key 的请求速率限制 |
| 🌍 跨平台 | Windows (.exe) / macOS (.dmg) / Linux (.AppImage) |

---

## 🧪 测试

```bash
# 运行全部测试
npm test           # 294 tests

# 运行 converter 测试
npx vitest run src/main/proxy/__tests__/converter.test.ts  # 70 tests

# 监听模式
npm run test:watch
```

---

## 🛠️ 技术栈

| 层 | 技术 |
|------|------|
| 框架 | Electron 42 + Vite 6 |
| 前端 | React 19 + react-router-dom v7 + Tailwind CSS 4 + Framer Motion |
| 代理 | Hono 4 (轻量级 HTTP 服务器) |
| 数据库 | sql.js (SQLite WASM，无需原生编译) |
| 日志 | NDJSON 分片文件 (最多 10 文件 × 10000 行) |
| 图表 | Recharts 3 |
| 测试 | Vitest 4 + Testing Library + jsdom |
| 语言 | TypeScript 6 |

---

## 📄 许可证

[MIT](LICENSE)

---

<div align="center">

### ⭐ 如果这个项目对你有帮助，请给我们一个 Star！

**一起打造最强桌面 AI 网关！**

</div>
