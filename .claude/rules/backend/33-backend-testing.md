---
description: 后端测试约定（仅 main 进程）
paths:
  - "src/main/**/*.test.*"
  - "src/main/**/*.spec.*"
  - "src/main/**/__tests__/**"
---

# Service 测试
- 每个 service.ts 必须有对应的 service.test.ts
- 测试覆盖：CRUD 操作、边界条件、错误处理

# Schema 测试
- 每个 schema.ts 必须有对应的 schema.test.ts
- 测试覆盖：合法输入接受 + 非法输入拒绝

# 禁止
- 测试文件导入未测试的 domain 模块
