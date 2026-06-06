---
description: 前端技术栈约束（仅 renderer）
---

| 技术 | 锁定版本 | 禁止使用 |
|------|---------|---------|
| React | 19.2 | `defaultProps`, `forwardRef`, class 组件 |
| Tailwind | 4.3 | `tailwind.config.ts`, `@layer components` |
| React Router | 7.x | `BrowserRouter`（Electron 用 HashRouter） |
| TanStack Query | 5.x | 字符串 queryKey（用数组 `['key', id]`） |
| Shiki | 最新 | 高亮超过 5 种语言（ts/js/python/json/bash） |
