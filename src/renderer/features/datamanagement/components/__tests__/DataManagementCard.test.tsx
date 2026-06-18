/**
 * DataManagementCard 组件测试
 *
 * 覆盖验收标准：
 * - 渲染"数据管理"Card，含两个 Checkbox 和"清空选中数据"按钮
 * - 两个 Checkbox 都未勾选时按钮 disabled
 * - 勾选任一 Checkbox 后按钮 enabled
 * - 点击按钮打开 ClearDataDialog，传入当前勾选状态
 * - 确认成功后：mutateAsync 参数匹配勾选，toast.success，关闭弹窗，Checkbox 重置
 * - 确认失败后：toast.error(getErrorMessage(e))，弹窗保持打开（允许重试）
 * - 清空中（isPending=true）拒绝关闭弹窗（避免失去进度感知与重试入口）
 * - 使用共享组件（Card/Checkbox/Button/AlertDialog），无原生 confirm/alert
 *
 * 测试用 userEvent 模拟真实用户交互（frontend/36-frontend-testing.md）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DataManagementCard } from '@/features/datamanagement/components/DataManagementCard'
import * as dataManagementQueries from '@/lib/queries/datamanagement'

// mock useClearData，仅暴露 mutateAsync / isPending（与 UpdateButton 测试同模式）
vi.mock('@/lib/queries/datamanagement', () => ({
  useClearData: vi.fn(),
}))

// mock sonner，仅暴露 toast.success / toast.error（本组件负责成功 toast，query 层不 toast）
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

/** 包裹 QueryClientProvider，让 useClearData 内部的 useMutation/useQueryClient 可用 */
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('DataManagementCard', () => {
  const mockMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dataManagementQueries.useClearData).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof dataManagementQueries.useClearData>)
  })

  it('渲染"数据管理"Card，含两个 Checkbox 和"清空选中数据"按钮', () => {
    renderWithQuery(<DataManagementCard />)

    expect(screen.getByText('数据管理')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '业务数据' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '运行数据' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeInTheDocument()
  })

  it('展示业务数据与运行数据的说明文案', () => {
    renderWithQuery(<DataManagementCard />)

    expect(
      screen.getByText('供应商配置 · 模型映射 · API 密钥 · 对话历史 (Agent 配置将保留)'),
    ).toBeInTheDocument()
    expect(screen.getByText('请求日志 · 统计数据')).toBeInTheDocument()
  })

  it('两个 Checkbox 都未勾选时"清空选中数据"按钮 disabled', () => {
    renderWithQuery(<DataManagementCard />)

    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeDisabled()
  })

  it('勾选业务数据 Checkbox 后按钮 enabled', async () => {
    const user = userEvent.setup()
    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))

    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeEnabled()
  })

  it('勾选运行数据 Checkbox 后按钮 enabled', async () => {
    const user = userEvent.setup()
    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '运行数据' }))

    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeEnabled()
  })

  it('再次点击已勾选 Checkbox 可取消勾选，按钮恢复 disabled', async () => {
    const user = userEvent.setup()
    renderWithQuery(<DataManagementCard />)

    const businessCheckbox = screen.getByRole('checkbox', { name: '业务数据' })
    await user.click(businessCheckbox)
    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeEnabled()

    await user.click(businessCheckbox)
    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeDisabled()
  })

  it('点击按钮打开 ClearDataDialog，传入当前勾选状态（业务+运行）', async () => {
    const user = userEvent.setup()
    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    await user.click(screen.getByRole('checkbox', { name: '运行数据' }))
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))

    // ClearDataDialog 拼接 selectedModules 展示"即将清空：xxx、xxx"，借此验证传入的勾选状态
    expect(screen.getByText('即将清空：业务数据、运行数据')).toBeInTheDocument()
  })

  it('点击按钮打开 ClearDataDialog，传入仅业务数据勾选状态', async () => {
    const user = userEvent.setup()
    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))

    // 弹窗拼接 selectedModules 展示"即将清空：业务数据"（不含运行数据），
    // 据此验证传入 { business: true, operational: false }。
    // 注意：Card 本体常驻"运行数据"Label，不能用 queryByText(/运行数据/) 判定弹窗内容。
    expect(screen.getByText('即将清空：业务数据')).toBeInTheDocument()
  })

  it('确认成功后调用 mutateAsync 参数匹配勾选，显示 toast.success，关闭弹窗，Checkbox 重置', async () => {
    const user = userEvent.setup()
    mockMutateAsync.mockResolvedValue({
      business: { cleared: true },
      operational: { cleared: false },
    })
    const { toast } = await import('sonner')

    renderWithQuery(<DataManagementCard />)

    // 勾选业务数据（operational 保持 false）
    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    // 打开弹窗
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))
    // 在弹窗输入"清空"并点击确认
    const confirmInput = screen.getByPlaceholderText('清空')
    await user.clear(confirmInput)
    await user.type(confirmInput, '清空')
    await user.click(screen.getByRole('button', { name: '确认清空' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ business: true, operational: false })
    })
    expect(toast.success).toHaveBeenCalledWith('已清空选中数据')
    expect(toast.error).not.toHaveBeenCalled()

    // 弹窗关闭
    await waitFor(() => {
      expect(screen.queryByText('确认清空数据')).not.toBeInTheDocument()
    })

    // Checkbox 重置为未勾选，按钮重新 disabled
    expect(screen.getByRole('checkbox', { name: '业务数据' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '清空选中数据' })).toBeDisabled()
  })

  it('确认成功后传入业务+运行勾选状态调用 mutateAsync', async () => {
    const user = userEvent.setup()
    mockMutateAsync.mockResolvedValue({
      business: { cleared: true },
      operational: { cleared: true },
    })

    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    await user.click(screen.getByRole('checkbox', { name: '运行数据' }))
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))
    const confirmInput = screen.getByPlaceholderText('清空')
    await user.clear(confirmInput)
    await user.type(confirmInput, '清空')
    await user.click(screen.getByRole('button', { name: '确认清空' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ business: true, operational: true })
    })
  })

  it('确认失败（mutate reject）时显示 toast.error(getErrorMessage(e))，弹窗保持打开', async () => {
    const user = userEvent.setup()
    mockMutateAsync.mockRejectedValue(new Error('清空业务数据失败'))
    const { toast } = await import('sonner')

    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))
    const confirmInput = screen.getByPlaceholderText('清空')
    await user.clear(confirmInput)
    await user.type(confirmInput, '清空')
    await user.click(screen.getByRole('button', { name: '确认清空' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ business: true, operational: false })
    })
    // getErrorMessage 对 Error 实例返回 e.message
    expect(toast.error).toHaveBeenCalledWith('清空业务数据失败')
    expect(toast.success).not.toHaveBeenCalled()

    // 弹窗保持打开（允许重试）
    expect(screen.getByText('确认清空数据')).toBeInTheDocument()
    // 清空未成功 → 勾选态未重置：弹窗仍展示"即将清空：业务数据"
    // （AlertDialog 打开时 Card 内容被 aria-hidden，改用弹窗内文本来验证 business 仍为 true）
    expect(screen.getByText('即将清空：业务数据')).toBeInTheDocument()
  })

  it('清空中（isPending=true）拒绝关闭弹窗：点取消按钮不触发 onOpenChange(false)', async () => {
    const user = userEvent.setup()
    // mutateAsync 永不 resolve，模拟清空进行中
    mockMutateAsync.mockReturnValue(new Promise<unknown>(() => {}))

    // 用 wrapper option 让 rerender 时自动重新包裹 QueryClientProvider，
    // 且传入新的 <DataManagementCard /> 元素以触发 React 重渲染（同引用会 bail-out）。
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { rerender } = render(<DataManagementCard />, { wrapper })

    // 勾选业务数据 + 打开弹窗 + 输入"清空" + 点确认
    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))
    const confirmInput = screen.getByPlaceholderText('清空')
    await user.clear(confirmInput)
    await user.type(confirmInput, '清空')
    await user.click(screen.getByRole('button', { name: '确认清空' }))

    // 切换 mock 为 isPending=true 并 rerender（模拟 useMutation 把 isPending 置 true 后触发重渲染）。
    // 仅改变 mock 不会自动驱动 React 重渲染，必须 rerender 才能让组件捕获新的 isPending。
    vi.mocked(dataManagementQueries.useClearData).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof dataManagementQueries.useClearData>)
    rerender(<DataManagementCard />)

    // 验证 isPending=true 已生效：按钮文案变为"清空中..."且 disabled
    expect(screen.getByRole('button', { name: '清空中...' })).toBeDisabled()

    // 清空中点击"取消"应被 onOpenChange 拦截，弹窗保持打开
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByText('确认清空数据')).toBeInTheDocument()
  })

  it('不使用原生 confirm / alert（应使用 AlertDialog 强确认）', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm')
    const alertSpy = vi.spyOn(window, 'alert')

    renderWithQuery(<DataManagementCard />)

    await user.click(screen.getByRole('checkbox', { name: '业务数据' }))
    await user.click(screen.getByRole('button', { name: '清空选中数据' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })
})
