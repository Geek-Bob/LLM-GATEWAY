---
description: 动效规范（入场/退出/过渡动画），仅编辑前端组件代码时加载
paths:
  - "src/renderer/**/*.tsx"
---

# 动画系统分工
- **framer-motion**：页面入场、列表交错、布局动画（`pages/`、`features/` 组件）
- **Tailwind v4 内置动画**：Radix 原语的显隐动画使用 v4 的 data-state 选择器 + animate-in/animate-out fade-in-0 zoom-in-95 slide-in-from-* utility（无需 tailwindcss-animate 插件）
- Radix 原语用 Tailwind data-state utility，页面/列表用 framer-motion，禁止用 framer-motion 包装 Radix 内部 Trigger/Content

# 时长标准
- 页面入场：0.3s，easing `[0.16, 1, 0.3, 1]`（ease-out-expo）
- 子元素入场：0.2s，easing `'easeOut'`
- 交互反馈（hover/press）：0.15s，easing `'easeOut'`
- 列表行交错：0.2s + `delay: idx * 0.03`

# 页面入场动画
- 统一使用 `pageVariants` + `childVariants`（来自 `lib/animations.ts`）
- 禁止内联定义 `initial` / `animate` / `transition`

```tsx
import { motion } from 'framer-motion'
import { pageVariants, childVariants } from '@/lib/animations'

export default function MyPage() {
  return (
    <motion.div variants={pageVariants} initial="hidden" animate="show">
      <motion.div variants={childVariants}>区块 1</motion.div>
      <motion.div variants={childVariants}>区块 2</motion.div>
    </motion.div>
  )
}
```

# 列表行入场
- 使用 `rowFadeIn(idx)` 工具函数（来自 `lib/animations.ts`）
- 禁止手写行动画

```tsx
import { motion } from 'framer-motion'
import { rowFadeIn } from '@/lib/animations'

{items.map((item, idx) => (
  <motion.tr key={item.id} {...rowFadeIn(idx)}>
    <td>{item.name}</td>
  </motion.tr>
))}
```

# 自定义 keyframes
- `index.css` 中仅保留全局高频使用的 keyframes（如 `animate-pulse-cyan`）
- 低频使用的动画内联到使用处或移入 `lib/animations.ts`

# 检查清单
- 页面入场使用 `pageVariants` + `childVariants`
- 列表行入场使用 `rowFadeIn(idx)`
- Radix 原语动画由 `tailwindcss-animate` 控制
- 页面/列表动画由 `framer-motion` 控制
- duration 遵循标准：页面 0.3s、子元素 0.2s、交互 0.15s
