import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateDialog } from '../UpdateDialog'

describe('UpdateDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    currentVersion: '1.0.0',
    newVersion: '1.1.0',
    releaseNotes: '- 修复了一些 bug\n- 新增了功能',
    onUpdate: vi.fn(),
    onSkip: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该渲染更新对话框', () => {
    render(<UpdateDialog {...defaultProps} />)

    expect(screen.getByText('发现新版本 v1.1.0')).toBeInTheDocument()
    expect(screen.getByText('当前版本：v1.0.0')).toBeInTheDocument()
    expect(screen.getByText(/修复了一些 bug/)).toBeInTheDocument()
    expect(screen.getByText(/新增了功能/)).toBeInTheDocument()
  })

  it('应该显示更新和取消按钮', () => {
    render(<UpdateDialog {...defaultProps} />)

    expect(screen.getByText('立即更新')).toBeInTheDocument()
    expect(screen.getByText('稍后再说')).toBeInTheDocument()
  })

  it('应该调用 onUpdate 当点击更新按钮', () => {
    render(<UpdateDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('立即更新'))
    expect(defaultProps.onUpdate).toHaveBeenCalled()
  })

  it('应该调用 onOpenChange 当点击取消按钮', () => {
    render(<UpdateDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('稍后再说'))
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('应该显示跳过版本复选框', () => {
    render(<UpdateDialog {...defaultProps} />)

    expect(screen.getByText('跳过此版本')).toBeInTheDocument()
  })

  it('应该调用 onSkip 当勾选跳过版本并取消', () => {
    render(<UpdateDialog {...defaultProps} />)

    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByText('稍后再说'))

    expect(defaultProps.onSkip).toHaveBeenCalledWith('1.1.0')
  })

  it('应该在 open=false 时不渲染内容', () => {
    render(<UpdateDialog {...defaultProps} open={false} />)

    expect(screen.queryByText('发现新版本 v1.1.0')).not.toBeInTheDocument()
  })

  it('应该在没有 releaseNotes 时不显示更新内容区域', () => {
    render(<UpdateDialog {...defaultProps} releaseNotes={null} />)

    expect(screen.queryByText('更新内容')).not.toBeInTheDocument()
  })

  it('应该在不勾选跳过版本时取消不调用 onSkip', () => {
    render(<UpdateDialog {...defaultProps} />)

    fireEvent.click(screen.getByText('稍后再说'))
    expect(defaultProps.onSkip).not.toHaveBeenCalled()
  })

  it('应该渲染更新内容（Markdown 格式）', () => {
    const releaseNotes = `## 更新内容

- 支持自动检查更新
- 支持下载和安装更新
- 支持跳过版本
- 设置页面配置`

    render(<UpdateDialog {...defaultProps} releaseNotes={releaseNotes} />)

    expect(screen.getAllByText('更新内容').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('支持自动检查更新')).toBeInTheDocument()
    expect(screen.getByText('支持下载和安装更新')).toBeInTheDocument()
  })

  it('应该渲染更新内容（HTML 格式）', () => {
    const releaseNotes = `<ul>
<li>支持自动检查更新</li>
<li>支持下载和安装更新</li>
<li>支持跳过版本</li>
<li>设置页面配置</li>
</ul>`

    render(<UpdateDialog {...defaultProps} releaseNotes={releaseNotes} />)

    expect(screen.getByText('更新内容')).toBeInTheDocument()
    expect(screen.getByText('支持自动检查更新')).toBeInTheDocument()
  })

  it('应该在没有更新内容时隐藏内容区域', () => {
    render(<UpdateDialog {...defaultProps} releaseNotes={null} />)

    expect(screen.queryByText('更新内容')).not.toBeInTheDocument()
  })
})
