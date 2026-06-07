---
description: 组件复用规则，始终加载
---

## 核心原则
禁止重复造轮子。`@/components/ui/` 中已有共享组件，所有页面/功能必须优先使用。

## 禁止行为
- 使用原生 HTML 元素替代 `components/ui/` 中已有的组件（如 `<input>` → Input、`<select>` → Select、`<button>` → Button、`<form>` → FormDialog）
- 在页面/功能中自行实现弹窗、下拉、对话框等通用 UI
- 使用内联 Tailwind 模拟共享组件已有的样式
- 导入外部 UI 库（如 `react-select`、`@headlessui`）绕过共享组件

## 必须行为
- 优先使用 `@/components/ui/` 中的共享组件
- 重复出现 3 次以上的 UI 模式必须抽取为共享组件或 hook

## forwardRef 豁免
shadcn/ui 生成的组件使用 `React.forwardRef`，此为第三方库代码，豁免禁止 `forwardRef` 的规则。应用自定义组件禁止使用 `forwardRef`。

## 共享资源清单
- 组件：ActionButtons、AlertDialog、Badge、Button、Card、Checkbox、CodeEditor、Dialog、DropdownMenu、EmptyState、FormDialog、Input、Label、Markdown、Mermaid、PageHeader、Pagination、Popover、Progress、ScrollArea、Select、Separator、Skeleton、Sonner、StatusBadge、Switch、Table、TableSkeleton、Textarea、Tooltip
- Hooks：useDeleteWithToast、useClipboard、useSavingAction
- 工具函数：cn、formatDate、formatRelativeDate、getErrorMessage
- 动画常量：pageVariants、childVariants、rowFadeIn

## 新增组件流程
1. 检查 `components/ui/` 是否已有类似组件
2. 若无，在 `components/ui/` 中创建新组件
3. 使用 Radix UI 原语 + Tailwind 样式
4. 导出并在页面/功能中使用
5. 更新本文件的组件清单
