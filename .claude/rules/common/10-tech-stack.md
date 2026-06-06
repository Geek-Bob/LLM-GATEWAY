---
description: 精确技术和版本约束，全局适用
---

| 技术 | 锁定版本 | 禁止使用 |
|------|---------|---------|
| TypeScript | 6.0 | `enum`, `namespace`, 装饰器 |
| React | 19.2 | `defaultProps`, `forwardRef`, class 组件 |
| Tailwind | 4.3 | `tailwind.config.ts`, `@layer components` |
| Vite | 6.4 | 额外的 vite.config.ts |
| ESLint | 10.x | `.eslintrc` 格式 |
| Hono | 4.x | 在 `server.ts` 中写路由逻辑 |
| React Router | 7.x | `BrowserRouter`（Electron 用 HashRouter） |
| TanStack Query | 5.x | 字符串 queryKey（用数组 `['key', id]`） |
| Shiki | 最新 | 高亮超过 5 种语言（ts/js/python/json/bash） |
