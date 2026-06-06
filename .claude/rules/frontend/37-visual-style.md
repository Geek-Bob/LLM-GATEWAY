---
description: 视觉风格规范（颜色、字体、间距、圆角、阴影）
---

# 颜色系统
所有颜色必须使用 `index.css` 中定义的 CSS 变量，禁止硬编码 Tailwind 色值。

## 主题变量
```
bg-background      — 页面底色（深空灰）
bg-card            — 卡片底色
bg-muted           — 次要背景
text-foreground    — 主文字
text-muted-foreground — 次要文字
text-primary       — 主色调（冷蓝）
border-border      — 边框色
text-destructive   — 危险操作红
```

## 代码示例
```tsx
// ❌ 硬编码色值
<div className="bg-slate-900 text-slate-400">
<div className="text-gray-500">

// ✅ 使用主题变量
<div className="bg-background text-muted-foreground">
<div className="text-muted-foreground">
```

# 页面头部
统一使用 `PageHeader` 组件，禁止手写 `flex items-center gap-3` 布局。

```tsx
// ❌ 手写布局
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-bold">标题</h1>
    <p className="text-sm text-muted-foreground">描述</p>
  </div>
  <Button>操作</Button>
</div>

// ✅ 使用 PageHeader 组件
<PageHeader title="标题" description="描述" action={<Button>操作</Button>} />
```

# 圆角规范
- 容器（Card、Dialog 等）：`rounded-xl`（与 Card 组件一致）
- 内部小元素（Badge、Button 等）：`rounded-md` / `rounded-sm`
- 禁止使用任意像素值（如 `rounded-[13px]`）

# 内联样式
禁止使用内联 `style={{ }}` 设置颜色、间距、尺寸。

```tsx
// ❌ 使用内联 style
<textarea style={{ maxHeight: 200, fontFamily: 'inherit' }} />

// ✅ 使用 Tailwind 类
<textarea className="max-h-[200px] font-inherit" />
```

# 检查清单
- [ ] 所有颜色使用 `bg-*` / `text-*` 主题变量，无硬编码 `slate`/`gray`/`zinc` 等
- [ ] 页面头部使用 `PageHeader` 组件
- [ ] 容器圆角使用 `rounded-xl`，内部小元素可用 `rounded-md` / `rounded-sm`
- [ ] 无内联 `style={{ }}` 设置颜色、间距、尺寸
- [ ] 启动画面使用 `bg-background text-muted-foreground`
