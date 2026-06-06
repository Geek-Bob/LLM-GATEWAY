---
description: 通用安全要求（前后端共用）
---

# 输入校验
- 所有外部输入必须校验（Zod schema、类型守卫）
- 文件路径必须校验是否在允许的目录内（防止路径遍历）

# 日志安全
- ❌ 禁止：将 API Key / Token / 密码写入日志、NDJSON、console
- ❌ 禁止：将完整的请求头（含 Authorization）写入调试日志
- ✅ 正确：日志中只记录脱敏后的信息（如 `apiKey: "***abc"`）

# 全局禁止项
- 重新引入任何加密/解密函数
- 将 API Key 写入日志、NDJSON、console 或任何持久化输出
