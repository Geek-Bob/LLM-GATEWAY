import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UpdateButton } from '@/features/update/components/UpdateButton'
import * as updateQueries from '@/lib/queries/update'

vi.mock('@/lib/queries/update', () => ({
  useCheckUpdate: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('UpdateButton', () => {
  const mockMutateAsync = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateQueries.useCheckUpdate).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof updateQueries.useCheckUpdate>)
  })

  it('应该渲染按钮', () => {
    renderWithQuery(<UpdateButton />)

    expect(screen.getByText('检查更新')).toBeInTheDocument()
  })

  it('加载状态应该显示检查中', () => {
    vi.mocked(updateQueries.useCheckUpdate).mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof updateQueries.useCheckUpdate>)

    renderWithQuery(<UpdateButton />)

    expect(screen.getByText('检查中...')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('检查成功且有更新时应该调用 onUpdateAvailable', async () => {
    mockMutateAsync.mockResolvedValue({ isAvailable: true, version: '2.0.0' })
    const onUpdateAvailable = vi.fn()

    renderWithQuery(<UpdateButton onUpdateAvailable={onUpdateAvailable} />)

    fireEvent.click(screen.getByText('检查更新'))

    await waitFor(() => {
      expect(onUpdateAvailable).toHaveBeenCalledWith('2.0.0')
    })
  })

  it('检查成功但无更新时应该显示 toast', async () => {
    const { toast } = await import('sonner')
    mockMutateAsync.mockResolvedValue({ isAvailable: false })

    renderWithQuery(<UpdateButton />)

    fireEvent.click(screen.getByText('检查更新'))

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('当前已是最新版本')
    })
  })

  it('检查失败时应该显示错误 toast', async () => {
    const { toast } = await import('sonner')
    mockMutateAsync.mockRejectedValue(new Error('网络错误'))

    renderWithQuery(<UpdateButton />)

    fireEvent.click(screen.getByText('检查更新'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('检查更新失败，请稍后重试')
    })
  })
})
