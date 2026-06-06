---
description: 安全要求，全局适用（无 paths 限制）
---

# 安全边界
- 本应用为本地桌面客户端，Renderer ↔ Main 通过 IPC 通信（Electron contextBridge），不经网络
- 唯一天然网络端口：8080（proxy，仅监听 localhost），用于 Chat 代理验证
- API Key 明文存储（本地文件系统，无网络暴露风险）
- 无加密/解密逻辑（已删除 crypto.ts，不回退）

# 代理安全（main 进程）
- 上游 Provider API Key 通过 Authorization/X-Api-Key 头透传
- 代理只监听 localhost（127.0.0.1），不对外暴露端口
- 不做 HTTPS 证书校验（本地回环可信）

# 输入校验
- 所有 IPC handler 的 create/update 入口必须有 Zod `.parse()` 验证
- 文件路径必须校验是否在允许的目录内（防止路径遍历）
- 用户输入在渲染前必须转义（React JSX 默认转义，禁止 dangerouslySetInnerHTML）

# 日志安全
- ❌ 禁止：将 API Key / Token / 密码写入日志、NDJSON、console
- ❌ 禁止：将完整的请求头（含 Authorization）写入调试日志
- ✅ 正确：日志中只记录脱敏后的信息（如 `apiKey: "***abc"`）

# 全局禁止项
- 重新引入任何加密/解密函数
- 将 API Key 写入日志、NDJSON、console 或任何持久化输出
- 代理监听 0.0.0.0（除非用户明确配置局域网共享）
