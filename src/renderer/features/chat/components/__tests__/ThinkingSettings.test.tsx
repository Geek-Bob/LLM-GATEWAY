/**
 * ThinkingSettings 组件测试
 *
 * 覆盖 Task 8 验收标准：
 * - 渲染三个执行方式选项（disabled/enabled/adaptive）
 * - 渲染强度下拉，含六个枚举选项（minimal/low/medium/high/xhigh/max）
 * - 切换执行方式触发 onThinkingTypeChange
 * - 切换强度触发 onReasoningEffortChange
 * - thinkingType=disabled 时强度下拉灰显（disabled 属性）
 * - thinkingType=enabled/adaptive 时强度下拉可用
 *
 * 策略：纯受控组件无需 QueryClient；用 userEvent 模拟真实交互。
 * Radix Select 在 jsdom 中依赖 pointer capture API（jsdom 未实现），需 mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThinkingSettings } from '@/features/chat/components/ThinkingSettings'
import type { ThinkingType, ReasoningEffort } from '../../../../../shared/types'

// Radix Select 在 jsdom 中依赖 pointer capture API，jsdom 未实现，需 mock
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(true)
  window.HTMLElement.prototype.releasePointerCapture = vi.fn()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe('ThinkingSettings', () => {
  const defaultProps = {
    thinkingType: 'enabled' as ThinkingType,
    reasoningEffort: 'medium' as ReasoningEffort,
    onThinkingTypeChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染三个执行方式选项（disabled/enabled/adaptive）', () => {
    render(<ThinkingSettings {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'disabled' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'enabled' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'adaptive' })).toBeInTheDocument()
  })

  it('当前执行方式按钮标记为选中态（aria-pressed=true），其余为 false', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="enabled" />)

    expect(screen.getByRole('button', { name: 'enabled' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'disabled' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'adaptive' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('渲染强度下拉，含六个枚举选项（minimal/low/medium/high/xhigh/max）', async () => {
    const user = userEvent.setup()
    render(<ThinkingSettings {...defaultProps} />)

    await user.click(screen.getByRole('combobox'))

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(6)
    expect(screen.getByRole('option', { name: 'minimal' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'low' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'medium' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'high' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'xhigh' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'max' })).toBeInTheDocument()
  })

  it('点击执行方式按钮触发 onThinkingTypeChange 并传入对应枚举', async () => {
    const user = userEvent.setup()
    const onThinkingTypeChange = vi.fn()
    render(<ThinkingSettings {...defaultProps} onThinkingTypeChange={onThinkingTypeChange} />)

    await user.click(screen.getByRole('button', { name: 'adaptive' }))

    expect(onThinkingTypeChange).toHaveBeenCalledWith('adaptive')
  })

  it('点击当前已选中的执行方式按钮仍触发回调（幂等切换允许）', async () => {
    const user = userEvent.setup()
    const onThinkingTypeChange = vi.fn()
    render(
      <ThinkingSettings
        {...defaultProps}
        thinkingType="enabled"
        onThinkingTypeChange={onThinkingTypeChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'enabled' }))

    expect(onThinkingTypeChange).toHaveBeenCalledWith('enabled')
  })

  it('切换强度下拉触发 onReasoningEffortChange 并传入对应枚举', async () => {
    const user = userEvent.setup()
    const onReasoningEffortChange = vi.fn()
    render(
      <ThinkingSettings {...defaultProps} onReasoningEffortChange={onReasoningEffortChange} />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'high' }))

    await waitFor(() => {
      expect(onReasoningEffortChange).toHaveBeenCalledWith('high')
    })
  })

  it('thinkingType=disabled 时强度下拉灰显（disabled 属性）', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="disabled" />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('thinkingType=disabled 时强度下拉仍展示当前值（不丢失，便于切回恢复）', () => {
    render(
      <ThinkingSettings
        {...defaultProps}
        thinkingType="disabled"
        reasoningEffort="high"
      />,
    )

    // Radix Select 在 trigger 内展示当前选中值，灰显时仍可见
    expect(screen.getByRole('combobox')).toHaveTextContent('high')
  })

  it('thinkingType=enabled 时强度下拉可用', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="enabled" />)

    expect(screen.getByRole('combobox')).toBeEnabled()
  })

  it('thinkingType=adaptive 时强度下拉可用', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="adaptive" />)

    expect(screen.getByRole('combobox')).toBeEnabled()
  })
})
