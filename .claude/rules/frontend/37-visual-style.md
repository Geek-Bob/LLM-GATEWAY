---
description: 视觉风格与样式系统规范，始终加载
---

# Dark-only 策略
当前仅支持 Dark 模式（硬编码于 `main.tsx`），这是 Electron 桌面应用的设计决策，不做 Light 模式切换。

# 颜色系统
- 所有颜色必须使用 `index.css` 中定义的 CSS 变量
- 禁止硬编码 Tailwind 色值（`bg-slate-900`、`text-gray-500` 等）

常用 CSS 变量：
- 背景：`bg-background`、`bg-card`、`bg-muted`、`bg-popover`
- 文字：`text-foreground`、`text-muted-foreground`
- 边框：`border`、`border-muted`
- 语义颜色（成功/错误/警告）：暂允许使用 Tailwind 色值（`bg-green-500`、`text-red-500`、`text-yellow-500`），后续如需统一可定义 CSS 变量

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

# 内联样式
- 禁止使用内联 `style={{ }}` 设置静态颜色、间距、尺寸
- 允许使用内联 style 设置 Tailwind 无法表达的动态值（如基于状态的 `transform`、`translateX` 百分比计算）
- 使用 Tailwind 类替代（如 `max-h-sm` 替代 `style={{ maxHeight: 200 }}`）
- Tailwind 任意值（`h-[13px]`、`w-[27px]` 等）当标准 Tailwind 尺寸类无法满足精确需求时允许使用，但需在注释中说明选择该尺寸的原因（如精确字号 `text-[10px]`、1px 边框 `h-[1px]`）

# 检查清单
- Dark-only 策略不被破坏
- 所有颜色使用主题变量，无硬编码色值（语义颜色暂允许 Tailwind 色值）
- 圆角使用 `rounded-xl`（容器）或 `rounded-md`（小元素）
- 阴影遵循 3 级规范
- 无静态内联 `style={{ }}`（动态 transform 等除外）
- Tailwind 任意值有注释说明原因
