---
description: 动效规范（入场/退出/过渡动画），始终加载
---

# 动画系统分工
- **framer-motion**：页面入场、列表交错、布局动画（`pages/`、`features/` 组件）
- **tailwindcss-animate**：Radix 原语的显隐动画（Dialog、Select、Popover、AlertDialog）
- 禁止混用两套动画系统

# 时长标准
- 页面入场：0.3s，easing `[0.16, 1, 0.3, 1]`（ease-out-expo）
- 子元素入场：0.2s，easing `'easeOut'`
- 交互反馈（hover/press）：0.15s，easing `'easeOut'`
- 列表行交错：0.2s + `delay: idx * 0.03`

# 页面入场动画
- 统一使用 `pageVariants` + `childVariants`（来自 `lib/animations.ts`）
- 禁止内联定义 `initial` / `animate` / `transition`

# 列表行入场
- 使用 `rowFadeIn(idx)` 工具函数（来自 `lib/animations.ts`）
- 禁止手写行动画

# 自定义 keyframes
- `index.css` 中仅保留全局高频使用的 keyframes（如 `animate-pulse-cyan`）
- 低频使用的动画内联到使用处或移入 `lib/animations.ts`

# 检查清单
- 页面入场使用 `pageVariants` + `childVariants`
- 列表行入场使用 `rowFadeIn(idx)`
- Radix 原语动画由 `tailwindcss-animate` 控制
- 页面/列表动画由 `framer-motion` 控制
- duration 遵循标准：页面 0.3s、子元素 0.2s、交互 0.15s
