# LLM Gateway 设计规格

## 概述

LLM Gateway 是一个跨平台桌面应用，统一管理多个 LLM 供应商的 API 代理服务。用户配置供应商（Anthropic 兼容 / OpenAI 兼容）的地址和密钥后，网关对外提供统一的 Anthropic 兼容和 OpenAI 兼容 API，根据模型 ID 前缀路由到对应供应商。

## 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 | React + TypeScript + Tailwind CSS + shadcn/ui | SPA，嵌入 Electron |
| 桌面壳 | Electron | 主进程、系统托盘、窗口管理 |
| 后端 | Hono (TypeScript) | Electron 主进程内运行 HTTP 服务 |
| 数据库 | better-sqlite3 | 同步操作，管理面板使用 |
| 图表 | recharts / echarts | 仪表盘数据可视化 |
| 打包 | electron-builder | 跨平台安装包 (exe/dmg) |

单一 TypeScript 语言覆盖全栈。

## 架构

```
┌──────────────────────────────────────────────┐
│              Electron App                     │
│                                               │
│  ┌──────────────┐   IPC    ┌──────────────┐   │
│  │ BrowserWindow │◄────────│ Main Process │   │
│  │ (React SPA)   │         │              │   │
│  │               │         │  ├─ Hono     │   │
│  │ 仪表盘        │         │  │  Server   │   │
│  │ 供应商管理    │         │  │  :8080    │   │
│  │ API Keys      │         │  │           │   │
│  │ 日志查询      │         │  ├─ Proxy    │   │
│  │               │         │  │  Handler  │   │
│  └──────────────┘         │  │           │   │
│                            │  ├─ SQLite   │   │
│                            │  │  (better) │   │
│                            └──┴───────────┘   │
└──────────────────────────────────────────────┘
         │                        │
         │ Proxy API (:8080)      │ HTTP 转发
         ▼                        ▼
    External Clients         LLM Providers
    (SDK / apps)             (Anthropic / OpenAI / 等)
```

### 进程模型

- **Electron 主进程**：启动 Hono HTTP 服务器 + SQLite 数据库 + IPC 处理
- **BrowserWindow**：加载 React SPA，通过 IPC 与主进程通信
- **系统托盘**：窗口关闭时最小化到托盘，后台持续运行代理服务

### 请求流

1. 外部客户端发送 `POST /v1/chat/completions` 或 `POST /v1/messages`
2. 验证请求头 `Authorization: Bearer <api_key>`
3. 检查该 API Key 的速率限制（滑动窗口）
4. 解析请求体中的 `model` 字段，提取前缀（`provider-name/model-id`）
5. 查找对应供应商配置（base_url + api_key + provider_type）
6. 验证模型 ID 在供应商的允许列表中
7. 原样转发请求到供应商 API（不做格式转换）
8. 流式 / 非流式透传响应给客户端
9. 异步记录日志（不阻塞响应）

## 数据模型

### providers — 供应商配置

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT UNIQUE | 供应商名称，也是路由前缀 |
| provider_type | TEXT | 'anthropic' \| 'openai' |
| base_url | TEXT | API 地址，如 https://api.anthropic.com |
| api_key_encrypted | TEXT | AES-256-GCM 加密的 API Key |
| models | TEXT | JSON 数组，如 ["claude-sonnet-4-20250514"] |
| is_active | INTEGER | 0/1 |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### api_keys — 调用方 API Key

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| name | TEXT | 标识名称，如 "prod-app" |
| key_prefix | TEXT | 前 8 位，用于列表显示 |
| key_hash | TEXT | SHA-256 哈希，用于验证 |
| is_active | INTEGER | 0/1 |
| rate_limit | INTEGER | 每分钟最大请求数，默认 60 |
| created_at | TEXT | ISO 8601 |

API Key 格式：`sk-{random 48 chars}`，仅在创建时明文显示一次，之后只存哈希。

### request_logs — 请求日志（独立 SQLite 文件）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增主键 |
| api_key_id | INTEGER | 发起方 |
| provider_id | INTEGER | 目标供应商 |
| model | TEXT | 完整 model ID |
| api_format | TEXT | 'anthropic' \| 'openai' |
| status_code | INTEGER | HTTP 状态码 |
| tokens_in | INTEGER | 输入 Token |
| tokens_out | INTEGER | 输出 Token |
| duration_ms | INTEGER | 响应时间 |
| error | TEXT | 错误信息（如有） |
| created_at | TEXT | ISO 8601 |

日志滚动策略：
- 保留 7 天
- 或最多 100 万条（先到者为准）
- 后台定时任务每小时检查清理
- 清理后执行 `PRAGMA optimize`

## API 设计

### 对外代理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /v1/chat/completions | OpenAI 兼容聊天补全 |
| POST | /v1/messages | Anthropic 兼容消息 API |
| GET | /v1/models | 列出所有可用模型 |

认证：`Authorization: Bearer <api_key>`

### 管理 API（Electron IPC）

管理面板全部走 Electron IPC（ipcMain / ipcRenderer），不暴露到网络：

| Channel | 方向 | 说明 |
|---------|------|------|
| provider:list | renderer → main | 列表查询 |
| provider:create | renderer → main | 新增供应商 |
| provider:update | renderer → main | 编辑供应商 |
| provider:delete | renderer → main | 删除供应商 |
| apikey:list | renderer → main | API Key 列表 |
| apikey:create | renderer → main | 创建（返回明文一次） |
| apikey:delete | renderer → main | 删除 |
| logs:query | renderer → main | 日志分页查询 |
| logs:stats | renderer → main | 统计聚合 |
| health:check | renderer → main | 供应商健康状态 |

## 前端 UI

### 设计语言

- **暗色主题**：深色科技感底色（slate-900 系）
- **渐变点缀**：靛蓝 → 紫色渐变作为强调色
- **毛玻璃卡片**：backdrop-blur 半透明卡片
- **微交互动画**：framer-motion 驱动

### 页面结构

1. **仪表盘** — 统计卡片（今日请求/Tokens/延迟/活跃供应商）+ 请求趋势图 + 用量分布
2. **供应商管理** — 列表 + 详情/编辑弹窗
3. **API Key 管理** — 列表 + 创建弹窗（创建时显示一次明文）
4. **请求日志** — 表格 + 筛选器 + 分页
5. **系统设置** — 端口配置、日志保留策略、开机自启等

### 桌面窗口

- 无边框窗口（frameless）
- 自定义标题栏（拖拽区 + 最小化/最大化/关闭 + 系统托盘收起）
- 最小宽度 900px，最小高度 600px
- 关闭按钮默认最小化到托盘

## 桌面集成

### 系统托盘

- 托盘图标：网关状态指示（运行中 / 异常）
- 右键菜单：打开窗口、查看状态、退出
- 左键点击：切换窗口显示/隐藏

### 安装包

| 平台 | 格式 | 工具 |
|------|------|------|
| Windows | .exe (NSIS) | electron-builder |
| macOS | .dmg | electron-builder |
| Linux | .AppImage | electron-builder |

### 数据目录

- Windows: `%APPDATA%/llm-gateway/`
- macOS: `~/Library/Application Support/llm-gateway/`
- Linux: `~/.config/llm-gateway/`

包含：`gateway.db`（配置）、`gateway-logs.db`（日志）、`config.json`

## 安全设计

- 供应商 API Key：AES-256-GCM 加密存储，加密密钥派生自机器唯一标识
- 调用方 API Key：SHA-256 哈希存储，仅创建时明文显示一次
- 请求体大小限制：10MB
- Rate Limiting：滑动窗口，每个 API Key 独立计数
- 健康检查：每 60s 探测一次，连续失败标记不可用

## 错误处理

| 场景 | HTTP 状态码 | 响应体 |
|------|------------|--------|
| API Key 无效 | 401 | `{"error": "unauthorized"}` |
| 速率超限 | 429 | `{"error": "rate_limit_exceeded"}` + Retry-After header |
| 模型前缀未匹配 | 404 | `{"error": "unknown_model"}` |
| 供应商不可用 | 502 | `{"error": "provider_unreachable"}` |
| 请求体超限 | 413 | `{"error": "payload_too_large"}` |

流式场景下，错误以 `data: [DONE]` 前最后一个 SSE 事件携带。

## 测试策略

- **单元测试**：vitest（前端 + 后端逻辑）
- **集成测试**：supertest + 内存 SQLite，测试代理路由逻辑
- **E2E 测试**：Playwright + Electron
- **手动测试**：真实调用 OpenAI / Anthropic 验证透传正确性

## 项目目录结构

```
llm-gateway/
├── electron/                  # Electron 主进程
│   ├── main.ts               # 入口：窗口、托盘、进程管理
│   ├── ipc/                  # IPC handlers
│   │   ├── providers.ts
│   │   ├── api-keys.ts
│   │   └── logs.ts
│   ├── proxy/                # 代理核心
│   │   ├── router.ts         # 模型前缀路由
│   │   ├── forwarder.ts      # HTTP 转发逻辑
│   │   └── rate-limiter.ts   # 滑动窗口限流
│   ├── db/                   # 数据库
│   │   ├── schema.ts         # 建表
│   │   ├── providers.ts
│   │   ├── api-keys.ts
│   │   └── logs.ts
│   └── utils/
│       ├── crypto.ts         # AES 加解密
│       └── health.ts         # 健康检查
├── src/                      # React 前端
│   ├── App.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Providers.tsx
│   │   ├── ApiKeys.tsx
│   │   ├── Logs.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── TitleBar.tsx
│   │   ├── StatsCard.tsx
│   │   └── ...
│   └── lib/
│       ├── ipc.ts            # Electron IPC 封装
│       └── utils.ts
├── resources/                 # 图标、安装资源
├── electron-builder.yml       # 打包配置
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 未完成事项（下一迭代）

以下功能已在讨论中确认但不纳入当前版本：

- Anthropic ↔ OpenAI 协议自动转换
- 多用户 / 团队协作
- 管理后台 JWT 认证（本地运行不需要）
- Docker 部署

## 附录：技术决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 后端框架 | Hono | 轻量、FastAPI 风格、TypeScript 原生 |
| SQLite 驱动 | better-sqlite3 | 同步操作简化管理代码 |
| 打包方案 | electron-builder | 成熟、跨平台安装包支持 |
| 协议处理 | 透传不转换 | YAGNI，减少复杂度 |
| 管理通信 | Electron IPC | 比 HTTP 更安全、更快 |
| 日志存储 | 独立 SQLite 文件 | 隔离日志 IO，不影响主库 |
