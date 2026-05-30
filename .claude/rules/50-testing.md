---
paths:
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/__tests__/**"
---

# 测试框架
- vitest + jsdom（渲染进程组件测试）
- 测试文件与源文件 co-located：`src/**/__tests__/xxx.test.ts`
- 禁止 mock 数据库（集成测试用真实 sql.js 内存库）

# 编写原则
- 每个 service.ts 必须有对应的 service.test.ts
- 每个 router.ts 必须有对应的 router.test.ts（用 Hono test client）
- 组件测试：测试交互行为，不测试实现细节
- TDD 流程：Red（写失败测试）→ Green（最小实现）→ Refactor（优化）

# 禁止
- 测试中使用真实网络请求（用 MSW 或 fetch mock）
- 测试文件导入未测试的 feature 模块
