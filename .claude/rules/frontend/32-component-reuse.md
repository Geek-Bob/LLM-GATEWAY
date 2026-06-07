---
description: 组件复用规则，始终加载
---

## 核心原则
禁止重复造轮子。`@/components/ui/` 中已有共享组件，所有页面/功能必须优先使用。

## 禁止行为
- 使用原生 HTML 元素替代 `components/ui/` 中已有的组件（如 `<input>` → Input、`<select>` → Select、`<button>` → Button、`<form>` → FormDialog）
  - '原生 HTML 元素'包括 `<button>`、`<input>`、`<select>`、`<form>`、`<textarea>` 及其 `motion.*` 包装形式（如 `<motion.button>`）
  - 需要动画交互时，应将 motion 包装应用于共享组件（如 `<motion.div>` 包裹 Card），而非用 motion 元素替代共享组件
- 在页面/功能中自行实现弹窗、下拉、对话框等通用 UI
- 使用内联 Tailwind 模拟共享组件已有的样式
- 导入外部 UI 库（如 `react-select`、`@headlessui`）绕过共享组件

```typescript
// ❌ 错误
<textarea className="min-h-[80px] rounded-md border ..." />     // 原生 textarea
<motion.button whileTap={{ scale: 0.95 }}>Click</motion.button> // motion 替代 Button
<dialog open={show}>...</dialog>                                 // 自建弹窗
import Select from 'react-select'                                // 外部 UI 库

// ✅ 正确
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'

<Textarea className="min-h-[80px]" />
<Button asChild><motion.button whileTap={{ scale: 0.95 }}>Click</motion.button></Button>
<Dialog open={show} onOpenChange={setShow}>...</Dialog>
<Select value={val} onValueChange={setVal}>...</Select>
```

## 必须行为
- 优先使用 `@/components/ui/` 中的共享组件
- 重复出现 3 次以上的 UI 模式必须抽取为共享组件或 hook
  - 'UI 模式'指结构相似的 JSX 片段（如每个页面的空状态提示、每个列表的加载骨架屏、每个表单的提交按钮区），不包括仅样式相似但结构不同的元素

## forwardRef 豁免
shadcn/ui 生成的组件使用 `React.forwardRef`，此为第三方库代码，豁免禁止 `forwardRef` 的规则。应用自定义组件禁止使用 `forwardRef`。

## 共享资源清单
- 组件：ActionButtons、AlertDialog、Badge、Button、Card、Checkbox、CodeEditor、Dialog、DropdownMenu、EmptyState、FormDialog、Input、Label、Markdown、Mermaid、PageHeader、Pagination、Popover、Progress、ScrollArea、Select、Separator、Skeleton、Sonner、StatusBadge、Switch、Table、TableSkeleton、Textarea、Tooltip
- Hooks：useDeleteWithToast、useClipboard、useSavingAction
- 工具函数：cn、formatDate、formatRelativeDate、getErrorMessage
- 动画常量：见 38-animation.md

## 新增组件流程
1. 检查 `components/ui/` 是否已有类似组件
2. 若无，在 `components/ui/` 中创建新组件
3. 使用 Radix UI 原语 + Tailwind 样式
4. 导出并在页面/功能中使用
5. 更新本文件的组件清单
