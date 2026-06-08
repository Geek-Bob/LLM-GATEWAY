---
description: 组件复用规则，始终加载
---

## 核心原则
禁止重复造轮子。`@/components/ui/` 和 `@/components/shared/` 中已有共享组件，所有页面/功能必须优先使用。

## 组件分类
- **`components/ui/`**：纯 UI 原子组件，无业务语义（button、dialog、input、select、table、badge 等）
- **`components/shared/`**：通用业务组件，包含业务语义或组合多个原子组件（action-buttons、form-dialog、page-header、empty-state、status-badge、table-skeleton 等）
- 判断标准：如果组件包含中文文案、业务状态判断、或组合了 2+ 原子组件形成业务模板 → 放 `shared/`

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
- 优先使用 `@/components/ui/` 和 `@/components/shared/` 中的共享组件
- 重复出现 3 次以上的 UI 模式必须抽取为共享组件或 hook
  - 'UI 模式'指结构相似的 JSX 片段（如每个页面的空状态提示、每个列表的加载骨架屏、每个表单的提交按钮区），不包括仅样式相似但结构不同的元素

## forwardRef 豁免
shadcn/ui 生成的组件使用 `React.forwardRef`，此为第三方库代码，豁免禁止 `forwardRef` 的规则。应用自定义组件禁止使用 `forwardRef`。

## 共享资源清单

### `components/ui/`（纯 UI 原子组件）
AlertDialog、Badge、Button、Card、Checkbox、Dialog、DropdownMenu、Input、Label、Pagination、Popover、Progress、ScrollArea、Select、Separator、Skeleton、Sonner、Switch、Table、Textarea、Tooltip

### `components/shared/`（通用业务组件）
ActionButtons、CodeEditor、EmptyState、FormDialog、Markdown、Mermaid、PageHeader、StatusBadge、TableSkeleton

### Hooks
useDeleteWithToast、useClipboard、useSavingAction

### 工具函数
cn、formatDate、formatRelativeDate、getErrorMessage

### 动画常量
见 38-animation.md

## 新增组件流程
1. 检查 `components/ui/` 和 `components/shared/` 是否已有类似组件
2. 判断组件类型：纯 UI 原子 → `ui/`，含业务语义 → `shared/`
3. 使用 Radix UI 原语 + Tailwind 样式
4. 导出并在页面/功能中使用
5. 更新本文件的组件清单
