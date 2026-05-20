# Chat + 状态栏设计规格

## 概述

在 LLM Gateway 中新增两个功能：1）仪表盘顶部代理服务状态栏；2）Chat 页面用于端到端验证模型可用性。

## 功能 1：代理服务状态栏

### 位置
仪表盘（Dashboard）页面顶部，统计卡片上方。

### 结构
```
┌──────────────────────────────────────────────────────┐
│  ● 代理服务运行中                                    │
│  http://localhost:8080                     [复制]     │
└──────────────────────────────────────────────────────┘
```

### 行为
- 状态指示：绿色圆点 + "代理服务运行中" / 红色圆点 + "代理服务未运行"
- URL 显示：当前代理服务器地址和端口
- 复制按钮：点击复制 URL 到剪贴板，短暂显示"已复制"反馈
- 数据来源：主进程返回 port 和运行状态（IPC channel: `proxy:status`）

### IPC 新增
| Channel | 方向 | 返回 |
|---------|------|------|
| proxy:status | renderer → main | `{ running: boolean, port: number, url: string }` |

## 功能 2：Chat 页面

### 位置
侧边栏新增导航项「Chat」，图标 `💬`。

### 布局
顶部工具栏（模型选择 + API Key 选择）→ 消息列表（流式渲染）→ 输入框 + 发送按钮

### 模型选择
- 从所有 isActive=1 的 providers 加载 models 列表
- 下拉分组展示：`供应商名称 / 模型ID`
- 选择后自动识别 providerType（anthropic / openai）
- 根据 providerType 自动切换请求格式

### API Key 选择
- 下拉列出所有 is_active=1 的 API Key（显示 name + key_prefix）
- 选中后 Chat 请求自动附加 `Authorization: Bearer <key>`

### 请求格式自动切换
**OpenAI 供应商：**
```
POST /v1/chat/completions
Authorization: Bearer <selected_api_key>
Content-Type: application/json

{
  "model": "provider-name/model-id",
  "messages": [{"role": "user", "content": "..."}],
  "stream": true
}
```

**Anthropic 供应商：**
```
POST /v1/messages
Authorization: Bearer <selected_api_key>
Content-Type: application/json
anthropic-version: 2023-06-01

{
  "model": "provider-name/model-id",
  "messages": [{"role": "user", "content": "..."}],
  "stream": true,
  "max_tokens": 4096
}
```

### 流式渲染
- 使用 `fetch` + `ReadableStream` 读取 SSE
- OpenAI 格式：解析 `data: {...}` 行，提取 `choices[0].delta.content`
- Anthropic 格式：解析 `event: content_block_delta`，提取 `delta.text`
- 当前正在生成的消息显示闪烁光标 `▌`
- 支持停止生成（AbortController）

### 消息列表
- 用户消息右对齐（蓝色气泡）
- AI 回复左对齐（灰色气泡）
- 消息显示 Model 标签（小字标注使用的模型）
- 错误消息显示红色提示
- 滚动到底部自动跟随

### 新增/修改的文件

| 文件 | 变更 |
|------|------|
| 创建 `src/renderer/pages/Chat.tsx` | Chat 页面主组件 |
| 创建 `src/renderer/components/ChatMessage.tsx` | 消息气泡组件 |
| 创建 `src/renderer/components/ChatInput.tsx` | 输入框组件 |
| 创建 `src/renderer/components/StatusBar.tsx` | 状态栏组件 |
| 修改 `src/renderer/pages/Dashboard.tsx` | 顶部嵌入 StatusBar |
| 修改 `src/renderer/components/Layout.tsx` | 导航添加 Chat 入口 |
| 修改 `src/renderer/App.tsx` | 注册 Chat 页面 |
| 修改 `src/renderer/lib/types.ts` | 新增 ProxyStatus 类型 |
| 修改 `src/renderer/lib/ipc.ts` | 新增 proxy.status API |
| 修改 `src/main/ipc/index.ts` | 新增 proxy:status handler |
| 修改 `src/preload/index.ts` | 暴露 proxy.status 到 contextBridge |

### 不要做的
- 不保存聊天历史（纯验证工具）
- 不做多轮对话管理（单轮验证即可，但支持连续对话体验）
- 不处理图片/多模态输入
- 不支持停止按钮之外的复杂控制

## 测试策略
- Chat 页面组件测试：模型选择、API Key 选择、消息发送/接收渲染
- StatusBar 组件测试：状态显示、复制功能
- 手动测试：选择一个真实 provider + API Key，发送消息验证流式输出
