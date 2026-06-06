import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DownloadProgress } from '../DownloadProgress'

describe('DownloadProgress', () => {
  it('idle 状态应该返回 null', () => {
    const { container } = render(<DownloadProgress status="idle" />)
    expect(container.firstChild).toBeNull()
  })

  it('downloading 状态应该显示进度条和百分比', () => {
    render(<DownloadProgress status="downloading" percent={42} />)

    expect(screen.getByText('正在下载更新...')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('downloading 状态应该正确四舍五入百分比', () => {
    render(<DownloadProgress status="downloading" percent={33.7} />)

    expect(screen.getByText('34%')).toBeInTheDocument()
  })

  it('downloaded 状态应该显示完成提示', () => {
    render(<DownloadProgress status="downloaded" />)

    expect(screen.getByText('下载完成')).toBeInTheDocument()
    expect(screen.getByText(/立即安装/)).toBeInTheDocument()
  })

  it('error 状态应该显示错误信息', () => {
    render(<DownloadProgress status="error" error="网络超时" />)

    expect(screen.getByText('下载失败')).toBeInTheDocument()
    expect(screen.getByText('网络超时')).toBeInTheDocument()
  })

  it('error 状态没有 error prop 时应显示默认提示', () => {
    render(<DownloadProgress status="error" />)

    expect(screen.getByText('下载失败')).toBeInTheDocument()
    expect(screen.getByText('请检查网络连接后重试')).toBeInTheDocument()
  })
})
