---
description: 视觉风格与样式系统规范，始终加载
---

# Dark-only 策略
当前仅支持 Dark 模式（硬编码于 `main.tsx`），这是 Electron 桌面应用的设计决策，不做 Light 模式切换。

# 颜色系统
- 所有颜色必须使用 `index.css` 中定义的 CSS 变量（`bg-background`、`text-foreground` 等）
- 禁止硬编码 Tailwind 色值（`bg-slate-900`、`text-gray-500` 等）

# 圆角规范
- 容器（Card、Dialog 等）：`rounded-xl`
- 内部小元素（Badge、Button 等）：`rounded-md` / `rounded-sm`
- 禁止使用任意像素值（如 `rounded-[13px]`）

# 阴影层级（3 级，禁止混用）
- 1 级 `shadow`：Card、Table
- 2 级 `shadow-md`：Popover、Select、Tooltip
- 3 级 `shadow-xl` / `shadow-2xl`：Dialog、AlertDialog

# 字体
- 统一使用系统字体栈，在 `index.css` 的 `body` 中声明
- 组件内不覆盖 `font-family`

# 页面头部
- 统一使用 `PageHeader` 组件，禁止手写 `flex items-center gap-3` 布局

# 内联样式
- 禁止使用内联 `style={{ }}` 设置颜色、间距、尺寸
- 使用 Tailwind 类替代（如 `max-h-[200px]` 替代 `style={{ maxHeight: 200 }}`）

# 检查清单
- Dark-only 策略不被破坏
- 所有颜色使用主题变量，无硬编码色值
- 页面头部使用 `PageHeader` 组件
- 圆角使用 `rounded-xl`（容器）或 `rounded-md`（小元素）
- 阴影遵循 3 级规范
- 无内联 `style={{ }}`
