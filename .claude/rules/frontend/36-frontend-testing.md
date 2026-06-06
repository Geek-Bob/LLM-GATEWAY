---
description: 前端测试约定（仅 renderer），按需加载
paths:
  - "src/renderer/**/*.test.*"
  - "src/renderer/**/*.spec.*"
  - "src/renderer/**/__tests__/**"
---

# 组件测试
- 测试交互行为，不测试实现细节
- 使用 `screen.findByRole` / `screen.findByText` 查询元素
- 使用 `userEvent` 模拟用户操作

# 禁止
- 测试文件导入未测试的 feature 模块
- 测试组件内部状态（只测试渲染结果和用户交互）
