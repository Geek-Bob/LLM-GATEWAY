---
description: 后端安全要求（仅 main 进程）
---

# 代理安全
- 上游 Provider API Key 通过 Authorization/X-Api-Key 头透传
- 代理只监听 localhost（127.0.0.1），不对外暴露端口
- 不做 HTTPS 证书校验（本地回环可信）

# 输入校验
- 所有 IPC handler 的 create/update 入口必须有 Zod `.parse()` 验证

# 禁止
- 代理监听 0.0.0.0（除非用户明确配置局域网共享）
