---
description: 样式系统规范（Tailwind、主题变量、响应式）
---

# Dark-only 策略
当前仅支持 Dark 模式（`document.documentElement.classList.add('dark')` 硬编码于 `main.tsx`），这是 Electron 桌面应用的设计决策，不做 Light 模式切换。

# 阴影层级
阴影分 3 级，禁止混用：

| 层级 | 类名 | 适用场景 |
|------|------|---------|
| 1级 | `shadow`（sm） | Card、Table |
| 2级 | `shadow-md` | Popover、Select、Tooltip |
| 3级 | `shadow-xl` / `shadow-2xl` | Dialog、AlertDialog |

```tsx
// ❌ 阴影使用不统一
<Card className="shadow-2xl">...</Card>       // Card 过重
<DialogContent className="shadow-md">...</DialogContent>  // Dialog 过轻

// ✅ 三级阴影规范
<Card className="shadow">...</Card>
<SelectContent className="shadow-md">...</SelectContent>
<DialogContent className="shadow-2xl">...</DialogContent>
```

# 字体声明
统一使用系统字体栈，在 `index.css` 的 `body` 中声明：

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

组件内不覆盖 `font-family`。

# CSS 变量参考
```
主题色板（Dark 模式）:
  --background:   220 14% 9%    深空灰底色
  --foreground:   210 20% 92%   主文字
  --card:         220 12% 13%   卡片底色
  --primary:      217 91% 60%   主色调（冷蓝）
  --muted:        220 10% 17%   次要背景
  --muted-foreground: 220 8% 52%  次要文字
  --destructive:  0 72% 55%     危险操作红
  --border:       220 10% 20%   边框色
  --radius:       0.75rem       基础圆角
```

# 检查清单
- [ ] Dark-only 策略不被破坏（不添加 Light 模式切换 UI）
- [ ] 阴影使用遵循 3 级规范：Card/shadow、Popover/shadow-md、Dialog/shadow-xl
- [ ] 所有圆角从 `--radius` 派生，不使用任意像素值
- [ ] 字体通过 `body` 声明统一系统字体栈，组件内不覆盖 `font-family`
