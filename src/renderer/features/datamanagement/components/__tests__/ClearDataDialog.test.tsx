import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ClearDataDialog } from '@/features/datamanagement/components/ClearDataDialog'
import type { ClearDataDialogProps } from '@/features/datamanagement/components/ClearDataDialog'

/**
 * ClearDataDialog 测试
 *
 * 覆盖验收标准：
 * - open=true 渲染、标题、模块列表拼接、不可恢复警告
 * - Input 为空 / 非"清空" / ==="清空" 时按钮 disabled/enabled 状态
 * - 点击确认调用 onConfirm
 * - 点击取消调用 onOpenChange(false)
 * - isPending=true 时按钮 disabled + 加载态
 */
describe('ClearDataDialog', () => {
  const defaultProps: ClearDataDialogProps = {
    open: true,
    onOpenChange: vi.fn(),
    selectedModules: { business: true, operational: true },
    onConfirm: vi.fn(),
    isPending: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('open=true 时渲染弹窗，标题为"确认清空数据"', () => {
    render(<ClearDataDialog {...defaultProps} />)

    expect(screen.getByText('确认清空数据')).toBeInTheDocument()
  })

  it('open=false 时不渲染弹窗内容', () => {
    render(<ClearDataDialog {...defaultProps} open={false} />)

    expect(screen.queryByText('确认清空数据')).not.toBeInTheDocument()
  })

  it('当 business 与 operational 均为 true 时展示"即将清空：业务数据、运行数据"', () => {
    render(<ClearDataDialog {...defaultProps} />)

    expect(screen.getByText('即将清空：业务数据、运行数据')).toBeInTheDocument()
  })

  it('仅 business 为 true 时展示"即将清空：业务数据"', () => {
    render(<ClearDataDialog {...defaultProps} selectedModules={{ business: true, operational: false }} />)

    expect(screen.getByText('即将清空：业务数据')).toBeInTheDocument()
    expect(screen.queryByText(/运行数据/)).not.toBeInTheDocument()
  })

  it('仅 operational 为 true 时展示"即将清空：运行数据"', () => {
    render(<ClearDataDialog {...defaultProps} selectedModules={{ business: false, operational: true }} />)

    expect(screen.getByText('即将清空：运行数据')).toBeInTheDocument()
    expect(screen.queryByText(/业务数据/)).not.toBeInTheDocument()
  })

  it('展示"此操作不可恢复！"警告', () => {
    render(<ClearDataDialog {...defaultProps} />)

    expect(screen.getByText('此操作不可恢复！')).toBeInTheDocument()
  })

  it('Input 初始为空时"确认清空"按钮 disabled', () => {
    render(<ClearDataDialog {...defaultProps} />)

    expect(screen.getByRole('button', { name: '确认清空' })).toBeDisabled()
  })

  it('输入非"清空"（如"清"）时按钮仍 disabled', () => {
    render(<ClearDataDialog {...defaultProps} />)

    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: '清' } })

    expect(screen.getByRole('button', { name: '确认清空' })).toBeDisabled()
  })

  it('输入非"清空"（如"clear"）时按钮仍 disabled', () => {
    render(<ClearDataDialog {...defaultProps} />)

    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: 'clear' } })

    expect(screen.getByRole('button', { name: '确认清空' })).toBeDisabled()
  })

  it('输入"清空"时按钮 enabled', () => {
    render(<ClearDataDialog {...defaultProps} />)

    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: '清空' } })

    expect(screen.getByRole('button', { name: '确认清空' })).toBeEnabled()
  })

  it('点击"确认清空"（enabled 状态）调用 onConfirm', () => {
    render(<ClearDataDialog {...defaultProps} />)

    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: '清空' } })

    fireEvent.click(screen.getByRole('button', { name: '确认清空' }))

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('点击"取消"调用 onOpenChange(false)', () => {
    render(<ClearDataDialog {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('isPending=true 时"确认清空"按钮 disabled 且显示加载态文字', () => {
    render(<ClearDataDialog {...defaultProps} isPending={true} />)

    // isPending 时按钮文字变为"清空中..."，仍可通过 role 找到
    const confirmButton = screen.getByRole('button', { name: /清空/ })
    expect(confirmButton).toBeDisabled()
    expect(screen.getByText('清空中...')).toBeInTheDocument()
  })

  it('isPending=true 时不调用 onConfirm（即便输入正确）', () => {
    render(<ClearDataDialog {...defaultProps} isPending={true} />)

    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: '清空' } })

    const confirmButton = screen.getByRole('button', { name: /清空/ })
    fireEvent.click(confirmButton)

    expect(defaultProps.onConfirm).not.toHaveBeenCalled()
  })

  it('不使用原生 confirm / alert（应使用 AlertDialog）', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    const alertSpy = vi.spyOn(window, 'alert')

    render(<ClearDataDialog {...defaultProps} />)

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(alertSpy).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })

  it('使用共享 Input 组件（通过 placeholder 可定位，无原生 confirm）', () => {
    render(<ClearDataDialog {...defaultProps} />)

    // 共享 Input 组件渲染的 input 元素可通过 placeholder 定位（Radix AlertDialog
    // 通过 Portal 渲染到 document.body，因此用 screen 查询而非 container）
    const input = screen.getByPlaceholderText('清空')
    expect(input.tagName).toBe('INPUT')
    // 确认弹窗内只有一个 input 元素
    const allInputs = document.body.querySelectorAll('input')
    expect(allInputs.length).toBe(1)
  })

  it('输入"清空"后清空 Input 时按钮恢复 disabled', () => {
    render(<ClearDataDialog {...defaultProps} />)

    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: '清空' } })
    expect(screen.getByRole('button', { name: '确认清空' })).toBeEnabled()

    fireEvent.input(input, { target: { value: '' } })
    expect(screen.getByRole('button', { name: '确认清空' })).toBeDisabled()
  })

  it('关闭弹窗后重新打开时 Input 已重置（按钮初始 disabled）', () => {
    const { rerender } = render(<ClearDataDialog {...defaultProps} />)

    // 输入"清空"使按钮启用
    const input = screen.getByPlaceholderText('清空')
    fireEvent.input(input, { target: { value: '清空' } })
    expect(screen.getByRole('button', { name: '确认清空' })).toBeEnabled()

    // 关闭再打开，Input 应被重置
    rerender(<ClearDataDialog {...defaultProps} open={false} />)
    rerender(<ClearDataDialog {...defaultProps} open={true} />)

    const reopenedInput = screen.getByPlaceholderText('清空')
    expect(reopenedInput).toHaveValue('')
    expect(screen.getByRole('button', { name: '确认清空' })).toBeDisabled()
  })
})
