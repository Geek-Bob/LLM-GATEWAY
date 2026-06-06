---
description: 动效规范（入场/退出/过渡动画）
---

# 动画系统分工
项目使用两套动画系统，职责边界明确：

| 系统 | 用途 | 范围 |
|------|------|------|
| **framer-motion** | 页面入场、列表交错、布局动画 | `pages/`、`features/` 组件 |
| **tailwindcss-animate** | Radix 原语的显隐动画 | `Dialog`、`Select`、`Popover`、`AlertDialog` |

```tsx
// ❌ 页面使用 tailwindcss-animate 的 animate-in 类
<div className="animate-in fade-in slide-in-from-bottom-4 duration-300">

// ❌ Dialog 使用 framer-motion
<motion.div animate={{ opacity: 1 }}><DialogContent>...</DialogContent></motion.div>

// ✅ 页面用 framer-motion
<motion.div variants={pageVariants} initial="hidden" animate="show">

// ✅ Dialog 用 tailwindcss-animate（已内置于 Radix 原语的 data-[state] 属性）
<DialogContent> {/* DialogContent 已内置 animate-in/animate-out */} </DialogContent>
```

# 时长标准

| 场景 | duration | easing |
|------|----------|--------|
| 页面入场 | 0.3s | `[0.16, 1, 0.3, 1]`（ease-out-expo） |
| 子元素入场 | 0.2s | `'easeOut'` |
| 交互反馈（hover/press） | 0.15s | `'easeOut'` |
| 列表行交错 | 0.2s + `delay: idx * 0.03` | `'easeOut'` |

# 页面入场动画
统一使用 `pageVariants` + `childVariants`，禁止内联定义。

```tsx
// ❌ 内联动画定义（3 种风格不统一）
// 风格 1: Dashboard/Settings — pageVariants+childVariants
<motion.div variants={pageVariants} initial="hidden" animate="show">

// 风格 2: Providers/Logs — 内联 initial/animate
<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>

// 风格 3: Chat — 简单 opacity
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>

// ✅ 全部统一为 pageVariants + childVariants
import { pageVariants, childVariants } from '@/lib/animations'

<motion.div variants={pageVariants} initial="hidden" animate="show" className="space-y-6">
  <motion.div variants={childVariants}>
    <PageHeader title="..." />
  </motion.div>
  <motion.div variants={childVariants}>
    {/* 页面内容 */}
  </motion.div>
</motion.div>
```

# 列表行入场
使用 `rowFadeIn` 工具函数，禁止手写。

```tsx
// ❌ 手写行动画
<motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}>

// ✅ 使用 rowFadeIn 工具函数
import { rowFadeIn } from '@/lib/animations'
<motion.tr {...rowFadeIn(idx)}>
```

# 自定义 keyframes 管理
- `index.css` 中仅保留全局高频使用的 keyframes（如 `animate-pulse-cyan`）
- 低频使用的动画内联到使用处或移入 `lib/animations.ts`

# 检查清单
- [ ] 页面入场使用 `pageVariants` + `childVariants`，不内联 initial/animate/transition
- [ ] 列表行入场使用 `rowFadeIn(idx)` 工具函数
- [ ] Radix 原语（Dialog/Select/Popover）的动画由 `tailwindcss-animate` 控制
- [ ] 页面/列表动画由 `framer-motion` 控制
- [ ] duration 遵循标准：页面 0.3s、子元素 0.2s、交互 0.15s
- [ ] easing 遵循标准：页面 `[0.16, 1, 0.3, 1]`、子元素 `'easeOut'`
