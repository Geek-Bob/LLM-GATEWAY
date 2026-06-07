---
description: 前端测试约定（仅 renderer），按需加载
paths:
  - "src/renderer/**/*.test.*"
  - "src/renderer/**/*.spec.*"
  - "src/renderer/**/__tests__/**"
---

# 测试原则
- 测试交互行为，不测试实现细节
  - '交互行为'：点击按钮后显示的内容、输入后提交的结果、加载态→就绪态的转换
  - '实现细节'：组件内部 state 值、useEffect 调用次数、DOM 结构深度
- 使用 `screen.findByRole` / `screen.findByText` 查询元素
- 使用 `userEvent` 模拟用户操作
- 测试文件与源文件同目录或 `__tests__/` 子目录

# 测试工具配置
- 使用 `QueryClientProvider` 包装需要 TanStack Query 的组件
- IPC mock：mock `window.electronAPI` 对象
- 常见场景覆盖：加载状态（Skeleton）、错误状态（toast.error）、空数据（EmptyState）

```tsx
// 完整的组件测试示例
import { render, screen, userEvent } from '@/test-utils'
import { MyComponent } from './MyComponent'

test('点击按钮后显示确认信息', async () => {
  render(<MyComponent />)
  await userEvent.click(screen.getByRole('button', { name: '提交' }))
  expect(await screen.findByText('提交成功')).toBeInTheDocument()
})
```

# 禁止
- 测试文件导入未测试的 feature 模块内部实现
- 测试组件内部状态（只测试渲染结果和用户交互）
- 使用 `getByTestId` 优先于语义查询（findByRole/findByText）
