/**
 * ThinkingSettings 组件测试（chip+Popover 形态）
 *
 * 覆盖 Task 1 验收标准：
 * - 渲染两个 chip（左 chip 显示 thinkingType，右 chip 显示「强度 · effort」）
 * - 点击 chip 触发 Popover，Popover 内含完整选项列表
 * - Popover 内当前选中项有视觉区分（active 态 className）
 * - 点击 Popover 内选项触发对应 onChange 回调
 * - 点击 Popover 内选项后 Popover 自动关闭
 * - thinkingType=disabled 时右 chip 不可交互（pointer-events-none）但仍展示当前值
 * - thinkingType=enabled/adaptive 时右 chip 可交互
 *
 * 策略：纯受控组件无需 QueryClient；用 userEvent 模拟真实点击。
 * Radix Popover 在 jsdom 中依赖 pointer capture API（jsdom 未实现），需 mock。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThinkingSettings } from '@/features/chat/components/ThinkingSettings'
import type { ThinkingType, ReasoningEffort } from '../../../../../shared/types'

// Radix Popover 在 jsdom 中依赖 pointer capture API，jsdom 未实现，需 mock
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

  it('渲染左 chip 显示当前 thinkingType', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="enabled" />)

    expect(screen.getByRole('button', { name: /enabled/ })).toBeInTheDocument()
  })

  it('渲染右 chip 显示「强度 · {reasoningEffort}」', () => {
    render(<ThinkingSettings {...defaultProps} reasoningEffort="high" />)

    expect(screen.getByRole('button', { name: /强度.*high/ })).toBeInTheDocument()
  })

  it('点击左 chip 触发 Popover，Popover 内含 3 个执行方式选项', async () => {
    const user = userEvent.setup()
    render(<ThinkingSettings {...defaultProps} />)

    // 点击左 chip（thinkingType 按钮）—— name 包含 thinkingType 值
    await user.click(screen.getByRole('button', { name: /enabled/ }))

    // Popover 内容由 Radix 异步渲染到 portal，findByRole 等待出现
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(3)
    expect(screen.getByRole('option', { name: 'disabled' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'enabled' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'adaptive' })).toBeInTheDocument()
  })

  it('点击右 chip 触发 Popover，Popover 内含 6 个强度选项', async () => {
    const user = userEvent.setup()
    render(<ThinkingSettings {...defaultProps} />)

    // 点击右 chip —— name 包含「强度」与当前 effort
    await user.click(screen.getByRole('button', { name: /强度.*medium/ }))

    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(6)
    expect(screen.getByRole('option', { name: 'minimal' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'low' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'medium' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'high' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'xhigh' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'max' })).toBeInTheDocument()
  })

  it('当前选中项在 Popover 内有 active 视觉态（border-l-2 border-accent）', async () => {
    const user = userEvent.setup()
    render(<ThinkingSettings {...defaultProps} thinkingType="enabled" reasoningEffort="high" />)

    await user.click(screen.getByRole('button', { name: /enabled/ }))

    const enabledOption = await screen.findByRole('option', { name: 'enabled' })
    expect(enabledOption.className).toMatch(/border-l-2/)
    expect(enabledOption.className).toMatch(/border-accent/)
  })

  it('点击 Popover 内执行方式选项触发 onThinkingTypeChange 并传入对应枚举', async () => {
    const user = userEvent.setup()
    const onThinkingTypeChange = vi.fn()
    render(<ThinkingSettings {...defaultProps} onThinkingTypeChange={onThinkingTypeChange} />)

    await user.click(screen.getByRole('button', { name: /enabled/ }))
    await user.click(await screen.findByRole('option', { name: 'adaptive' }))

    expect(onThinkingTypeChange).toHaveBeenCalledWith('adaptive')
  })

  it('点击 Popover 选项后 Popover 自动关闭', async () => {
    const user = userEvent.setup()
    render(<ThinkingSettings {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /enabled/ }))
    // 打开 Popover
    expect(await screen.findByRole('option', { name: 'adaptive' })).toBeInTheDocument()

    // 点击 Popover 内选项
    await user.click(screen.getByRole('option', { name: 'adaptive' }))

    // Popover 关闭后 option 不再存在
    expect(screen.queryByRole('option', { name: 'adaptive' })).not.toBeInTheDocument()
  })

  it('点击 Popover 内强度选项触发 onReasoningEffortChange 并传入对应枚举', async () => {
    const user = userEvent.setup()
    const onReasoningEffortChange = vi.fn()
    render(
      <ThinkingSettings {...defaultProps} onReasoningEffortChange={onReasoningEffortChange} />,
    )

    await user.click(screen.getByRole('button', { name: /强度.*medium/ }))
    await user.click(await screen.findByRole('option', { name: 'high' }))

    expect(onReasoningEffortChange).toHaveBeenCalledWith('high')
  })

  it('thinkingType=disabled 时右 chip 不可交互（pointer-events-none）', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="disabled" />)

    const effortChip = screen.getByRole('button', { name: /强度/ })
    // Button 基类带 disabled:pointer-events-none 通用样式，验证组件主动加的 marker class 存在
    expect(effortChip.className).toMatch(/(^|\s)pointer-events-none(\s|$)/)
    expect(effortChip.className).toMatch(/(^|\s)opacity-50(\s|$)/)
  })

  it('thinkingType=disabled 时右 chip 仍展示当前 effort 值（不丢失，便于切回恢复）', () => {
    render(
      <ThinkingSettings
        {...defaultProps}
        thinkingType="disabled"
        reasoningEffort="high"
      />,
    )

    expect(screen.getByRole('button', { name: /强度.*high/ })).toBeInTheDocument()
  })

  it('thinkingType=enabled 时右 chip 可交互（无 pointer-events-none 主动 marker）', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="enabled" />)

    const effortChip = screen.getByRole('button', { name: /强度/ })
    expect(effortChip.className).not.toMatch(/(^|\s)pointer-events-none(\s|$)/)
  })

  it('thinkingType=adaptive 时右 chip 可交互（无 pointer-events-none 主动 marker）', () => {
    render(<ThinkingSettings {...defaultProps} thinkingType="adaptive" />)

    const effortChip = screen.getByRole('button', { name: /强度/ })
    expect(effortChip.className).not.toMatch(/(^|\s)pointer-events-none(\s|$)/)
  })
})
