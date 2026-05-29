# 测试约定

## 框架与工具

- 测试运行器：vitest
- DOM 环境：jsdom
- 断言/查询：@testing-library/react + @testing-library/jest-dom
- 命令：`npm test`（单次）、`npm run test:watch`（监听模式）

## 文件组织

- 测试文件与被测文件同级，放在 `__tests__/` 目录内：
  ```
  components/
    update/
      UpdateDialog.tsx
      __tests__/
        UpdateDialog.test.tsx
  ```
- 文件命名：`ComponentName.test.tsx`、`useHook.test.ts`

## 编写原则

### 测行为不测实现
```tsx
// ✅ 用户视角
expect(screen.getByRole('button', { name: '下载更新' })).toBeInTheDocument()

// ❌ 实现细节
expect(wrapper.state('isLoading')).toBe(true)
```

### 优先使用语义化查询
优先级：`getByRole` > `getByLabelText` > `getByText` > `getByTestId`

### Mock 策略
- IPC 调用：mock `window.electronAPI` 对象
- TanStack Query：使用 `QueryClientProvider` 包裹测试组件
- 定时器：`vi.useFakeTimers()` + `vi.advanceTimersByTime()`
- 避免 mock 内部模块，优先 mock 边界（IPC、外部 API）

### 异步测试
```tsx
// ✅ 等待异步状态
await screen.findByText('加载完成')

// ❌ 不可靠的 setTimeout
setTimeout(() => { ... }, 100)
```

## 覆盖要求

- 新增组件必须有基础渲染测试（不崩溃、关键元素存在）
- 新增 hooks 必须有 happy path 测试
- Bug 修复必须附带回归测试
- 不追求 100% 覆盖率，重点覆盖业务逻辑分支

## 注意事项

- `new-api-main/` 目录是外部项目残留，其空测试套件会报 FAIL，忽略即可
- 测试中的 `window.electronAPI` 需手动 mock，jsdom 环境不自动提供
