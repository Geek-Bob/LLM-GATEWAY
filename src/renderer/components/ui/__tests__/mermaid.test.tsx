import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockRender = vi.hoisted(() => vi.fn().mockResolvedValue({ svg: '<svg>test</svg>' }))
const mockInitialize = vi.hoisted(() => vi.fn())
const mockParse = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('mermaid', () => ({
  default: {
    initialize: mockInitialize,
    render: mockRender,
    parse: mockParse,
  },
}))

const { Mermaid } = await import('../mermaid')

describe('Mermaid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRender.mockResolvedValue({ svg: '<svg>test</svg>' })
    mockParse.mockResolvedValue(undefined)
  })

  it('应该渲染 Mermaid 图表', async () => {
    const content = `graph TD
    A[开始] --> B[结束]`

    render(<Mermaid content={content} />)

    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument()
    })

    expect(mockParse).toHaveBeenCalledWith(content)
    expect(mockRender).toHaveBeenCalled()
  })

  it('应该显示加载状态', () => {
    const content = `graph TD
    A[开始] --> B[结束]`

    render(<Mermaid content={content} />)

    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('应该处理解析错误', async () => {
    mockParse.mockRejectedValueOnce(new Error('Syntax error in text'))

    const content = 'invalid mermaid content'

    render(<Mermaid content={content} />)

    await waitFor(() => {
      expect(screen.getByText('图表渲染失败')).toBeInTheDocument()
      expect(screen.getByText('Syntax error in text')).toBeInTheDocument()
    })
  })

  it('应该处理渲染错误', async () => {
    mockRender.mockRejectedValueOnce(new Error('渲染失败'))

    const content = 'invalid mermaid content'

    render(<Mermaid content={content} />)

    await waitFor(() => {
      expect(screen.getByText('图表渲染失败')).toBeInTheDocument()
    })
  })
})
