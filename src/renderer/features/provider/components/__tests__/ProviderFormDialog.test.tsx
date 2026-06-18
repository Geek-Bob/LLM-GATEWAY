/**
 * ProviderFormDialog 组件测试
 *
 * 覆盖 Task 10 验收标准：
 * - 每个已添加模型显示 3 个单价输入（缓存命中/未命中/输出）
 * - 编辑模式通过 usePricingByProvider 回填已有单价
 * - 保存成功后对每个模型 upsert pricing（编辑模式用 editingId，新建模式用返回 id）
 * - 新增/移除模型同步增删单价行
 * - 复用 Input 组件，无原生 confirm/alert
 *
 * 策略：mock @/lib/queries/providers、@/lib/queries/pricing、sonner。
 * 用 QueryClientProvider 包装使 useMutation/useQuery 可用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PricingEntity } from '@/lib/types'
import { ProviderFormDialog } from '../ProviderFormDialog'

// ======================
// Mocks
// ======================
const createProviderMock = vi.hoisted(() => vi.fn())
const updateProviderMock = vi.hoisted(() => vi.fn())
const upsertPricingMock = vi.hoisted(() => vi.fn())
const getByProviderMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/queries/providers', () => ({
  useCreateProvider: () => ({
    mutateAsync: createProviderMock,
    isPending: false,
  }),
  useUpdateProvider: () => ({
    mutateAsync: updateProviderMock,
    isPending: false,
  }),
}))

vi.mock('@/lib/queries/pricing', () => ({
  usePricingByProvider: (_providerId: number) => ({
    data: getByProviderMock() as PricingEntity[] | undefined,
    isLoading: false,
  }),
  useUpsertPricing: () => ({
    mutateAsync: upsertPricingMock,
    isPending: false,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// ======================
// Helpers
// ======================

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderDialog(props: React.ComponentProps<typeof ProviderFormDialog>) {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ProviderFormDialog {...props} />
    </QueryClientProvider>,
  )
}

/**
 * 填写供应商基本字段并添加模型，使保存按钮可用。
 * 返回 userEvent 实例便于继续交互。
 */
async function fillBasicsAndAddModel(user: ReturnType<typeof userEvent.setup>, model: string) {
  await user.type(screen.getByPlaceholderText('例如: OpenAI 主账号'), 'MyProvider')
  await user.type(screen.getByPlaceholderText('输入模型名称后按 Enter 添加'), model)
  await user.keyboard('{Enter}')
}

beforeEach(() => {
  vi.clearAllMocks()
  createProviderMock.mockResolvedValue(42)
  updateProviderMock.mockResolvedValue(undefined)
  upsertPricingMock.mockResolvedValue(undefined)
  getByProviderMock.mockReturnValue([])
})

// ======================
// Tests
// ======================

describe('ProviderFormDialog — 费用配置区', () => {
  it('模型列表为空时不渲染费用配置区单价行', () => {
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    // 费用配置区标题区始终展示（标注单位说明），但无单价输入行
    expect(screen.getByText('费用配置（元/百万tokens）')).toBeInTheDocument()
    // 无任何单价输入框
    expect(screen.queryByPlaceholderText('缓存命中')).not.toBeInTheDocument()
  })

  it('添加模型后展示该模型的 3 个单价输入', async () => {
    const user = userEvent.setup()
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')

    expect(screen.getAllByPlaceholderText('缓存命中')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('缓存未命中')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('输出')).toHaveLength(1)
  })

  it('添加多个模型时每模型各 3 个单价输入', async () => {
    const user = userEvent.setup()
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')
    await fillBasicsAndAddModel(user, 'claude-3-opus')

    expect(screen.getAllByPlaceholderText('缓存命中')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('缓存未命中')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('输出')).toHaveLength(2)
  })

  it('编辑模式通过 usePricingByProvider 回填已有单价', async () => {
    const user = userEvent.setup()
    getByProviderMock.mockReturnValue([
      {
        providerId: 7,
        model: 'gpt-4o',
        priceInCached: 1.25,
        priceInUncached: 2.5,
        priceOut: 10,
      },
    ])

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: 7,
      initialForm: {
        name: 'OpenAI',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-xxx',
        models: ['gpt-4o'],
      },
      onSaved: vi.fn(),
    })

    // 等待 usePricingByProvider 回填生效
    await waitFor(() => {
      expect(screen.getByPlaceholderText('缓存命中')).toHaveValue('1.25')
    })
    expect(screen.getByPlaceholderText('缓存未命中')).toHaveValue('2.5')
    expect(screen.getByPlaceholderText('输出')).toHaveValue('10')
  })

  it('编辑模式回填后修改单价并保存，对每个模型调用 upsert（用 editingId）', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSaved = vi.fn()
    getByProviderMock.mockReturnValue([
      {
        providerId: 7,
        model: 'gpt-4o',
        priceInCached: 1,
        priceInUncached: 2,
        priceOut: 3,
      },
    ])

    renderDialog({
      open: true,
      onOpenChange,
      editingId: 7,
      initialForm: {
        name: 'OpenAI',
        providerType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-xxx',
        models: ['gpt-4o'],
      },
      onSaved,
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('缓存命中')).toHaveValue('1')
    })

    // 修改缓存命中单价
    const cachedInput = screen.getByPlaceholderText('缓存命中')
    await user.clear(cachedInput)
    await user.type(cachedInput, '1.5')

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updateProviderMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(upsertPricingMock).toHaveBeenCalledTimes(1))
    expect(upsertPricingMock).toHaveBeenCalledWith({
      providerId: 7,
      model: 'gpt-4o',
      priceInCached: 1.5,
      priceInUncached: 2,
      priceOut: 3,
    })
    expect(onSaved).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('新建模式保存成功后用返回的 provider id 对每个模型 upsert', async () => {
    const user = userEvent.setup()
    createProviderMock.mockResolvedValue(99)
    const onSaved = vi.fn()

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved,
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')
    await fillBasicsAndAddModel(user, 'claude-3-opus')

    // 填写单价
    const cachedInputs = screen.getAllByPlaceholderText('缓存命中')
    await user.type(cachedInputs[0], '1.25')
    await user.type(cachedInputs[1], '3.15')

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(createProviderMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(upsertPricingMock).toHaveBeenCalledTimes(2))
    expect(upsertPricingMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 99, model: 'gpt-4o', priceInCached: 1.25 }),
    )
    expect(upsertPricingMock).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 99, model: 'claude-3-opus', priceInCached: 3.15 }),
    )
  })

  it('新建模式若 create 失败则不调用 upsert', async () => {
    const user = userEvent.setup()
    createProviderMock.mockRejectedValue(new Error('boom'))

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(createProviderMock).toHaveBeenCalledTimes(1))
    // 给微任务一个排空窗口，确认 upsert 始终未被调用
    await new Promise((r) => setTimeout(r, 0))
    expect(upsertPricingMock).not.toHaveBeenCalled()
  })

  it('移除模型时同步移除其单价行', async () => {
    const user = userEvent.setup()
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')
    await fillBasicsAndAddModel(user, 'claude-3-opus')
    expect(screen.getAllByPlaceholderText('缓存命中')).toHaveLength(2)

    // 移除第一个模型（gpt-4o）—— 通过 aria-label 定位删除按钮（图标按钮应具备可访问名）
    const removeButtons = screen.getAllByRole('button', { name: '移除模型' })
    await user.click(removeButtons[0])

    expect(screen.getAllByPlaceholderText('缓存命中')).toHaveLength(1)
  })

  it('使用共享 Input 组件（无原生 input 拼装 + 无 confirm/alert）', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const alertSpy = vi.spyOn(window, 'alert')
    const user = userEvent.setup()

    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')

    // 所有单价输入均为 INPUT 元素（来自共享 Input 组件）
    const cachedInputs = screen.getAllByPlaceholderText('缓存命中')
    for (const i of cachedInputs) expect(i.tagName).toBe('INPUT')
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })

  it('未填写单价时保存仍可成功，按 0 upsert', async () => {
    const user = userEvent.setup()
    renderDialog({
      open: true,
      onOpenChange: vi.fn(),
      editingId: null,
      onSaved: vi.fn(),
    })

    await fillBasicsAndAddModel(user, 'gpt-4o')
    // 不填单价
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(upsertPricingMock).toHaveBeenCalledTimes(1))
    expect(upsertPricingMock).toHaveBeenCalledWith({
      providerId: 42,
      model: 'gpt-4o',
      priceInCached: 0,
      priceInUncached: 0,
      priceOut: 0,
    })
  })
})
