# 组件复用规则（不可协商）

## 核心原则
**禁止重复造轮子**。`src/renderer/components/ui/` 中已有共享组件，所有页面/功能必须优先使用。

## 禁止行为
- ❌ 使用原生 HTML 表单元素（`<select>`、`<input>`、`<textarea>`、`<button>`）
- ❌ 在页面/功能中自行实现弹窗、下拉、对话框等通用 UI
- ❌ 使用内联 Tailwind 模拟共享组件已有的样式
- ❌ 导入外部 UI 库（如 `react-select`、`@headlessui`）绕过共享组件

## 必须行为
- ✅ 优先使用 `@/components/ui/` 中的共享组件
- ✅ 缺失组件时，在 `components/ui/` 中新建并导出
- ✅ 保持导入路径一致（使用 `@/components/ui/` 别名）
- ✅ 重复出现 3 次以上的 UI 模式必须抽取为共享组件或 hook

## 现有共享组件清单
| 组件 | 文件 | 用途 |
|------|------|------|
| Button | `button.tsx` | 按钮（6 variant + 4 size） |
| Card | `card.tsx` | 卡片容器 |
| Input | `input.tsx` | 输入框 |
| Textarea | `textarea.tsx` | 多行文本框 |
| Select | `select.tsx` | 下拉选择器（Radix） |
| Dialog | `dialog.tsx` | 弹窗对话框 |
| AlertDialog | `alert-dialog.tsx` | 确认对话框 |
| Table | `table.tsx` | 表格 |
| Badge | `badge.tsx` | 标签徽章 |
| StatusBadge | `status-badge.tsx` | 启用/禁用状态徽章 |
| Switch | `switch.tsx` | 开关 |
| Checkbox | `checkbox.tsx` | 复选框 |
| Label | `label.tsx` | 表单标签 |
| PageHeader | `page-header.tsx` | 页面头部（标题+操作按钮） |
| EmptyState | `empty-state.tsx` | 空状态占位 |
| TableSkeleton | `table-skeleton.tsx` | 表格骨架屏 |
| Skeleton | `skeleton.tsx` | 通用骨架屏 |
| Pagination | `pagination.tsx` | 分页 |
| Popover | `popover.tsx` | 弹出层 |
| ScrollArea | `scroll-area.tsx` | 滚动区域 |
| Separator | `separator.tsx` | 分隔线 |
| Progress | `progress.tsx` | 进度条 |
| CodeEditor | `code-editor.tsx` | 代码编辑器（Monaco） |
| Markdown | `markdown.tsx` | Markdown 渲染 |

## 现有共享 Hooks 清单
| Hook | 文件 | 用途 |
|------|------|------|
| useDeleteWithToast | `hooks/useDeleteWithToast.ts` | 删除操作 + toast 反馈 |
| useClipboard | `hooks/useClipboard.ts` | 剪贴板复制 + 状态反馈 |
| useSavingAction | `hooks/useSavingAction.ts` | 保存操作 + loading 状态 |

## 现有共享工具函数清单
| 函数 | 文件 | 用途 |
|------|------|------|
| cn | `lib/utils.ts` | Tailwind 类名合并 |
| formatDate | `lib/utils.ts` | 日期格式化（YYYY-MM-DD HH:mm） |
| formatRelativeDate | `lib/utils.ts` | 相对时间格式化（如"3分钟前"） |
| getErrorMessage | `lib/utils.ts` | 错误消息提取 |

## 现有共享动画常量清单
| 常量 | 文件 | 用途 |
|------|------|------|
| pageVariants | `lib/animations.ts` | 页面入场动画 |
| childVariants | `lib/animations.ts` | 子元素入场动画 |
| rowFadeIn | `lib/animations.ts` | 表格行入场动画 |

## forwardRef 豁免
shadcn/ui 生成的组件使用 `React.forwardRef`，此为第三方库代码，豁免 `10-tech-stack.md` 中禁止 `forwardRef` 的规则。应用自定义组件（`features/`、`components/` 根目录）禁止使用 `forwardRef`。

## 新增组件流程
1. 检查 `components/ui/` 是否已有类似组件
2. 若无，在 `components/ui/` 中创建新组件
3. 使用 Radix UI 原语 + Tailwind 样式
4. 导出并在页面/功能中使用
5. 更新本文件的组件清单

## 检查清单（Code Review 必查）
- [ ] 是否使用了原生 HTML 表单元素？
- [ ] 是否使用了 `@/components/ui/` 中的共享组件？
- [ ] 是否有未导出的重复组件？
- [ ] 导入路径是否统一使用 `@/components/ui/`？
- [ ] 剪贴板操作是否使用 `useClipboard` hook？
- [ ] 页面入场动画是否使用 `pageVariants` + `childVariants`？
- [ ] 编辑/删除按钮组是否使用统一的 `ActionButtons` 组件？
