import { render, screen, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

// Mock Mermaid 组件以避免 lazy 加载问题
vi.mock('../mermaid', () => ({
  Mermaid: ({ content }: { content: string }) => (
    <div role="img" aria-label="Mermaid 图表">
      {content}
    </div>
  ),
}))

// 延迟导入以确保 mock 生效
const { Markdown } = await import('../markdown')

describe('Markdown', () => {
  it('应该渲染基础 Markdown 语法', () => {
    const content = '# 标题\n\n这是一段**加粗**文本'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('标题')
    expect(screen.getByText('加粗')).toBeInTheDocument()
  })

  it('应该渲染列表', () => {
    const content = '- 项目 1\n- 项目 2\n- 项目 3'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('应该渲染代码块', () => {
    const content = '```javascript\nconsole.log("hello")\n```'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByText('console.log("hello")')).toBeInTheDocument()
  })

  it('应该渲染表格', () => {
    const content = `| 列 1 | 列 2 |
|------|------|
| A    | B    |`

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('列 1')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('应该渲染 HTML 内容', () => {
    const content = '<ul><li>项目 1</li><li>项目 2</li></ul>'

    render(<Markdown>{content}</Markdown>)

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('应该支持自定义 className', () => {
    const content = '测试内容'

    render(<Markdown className="custom-class">{content}</Markdown>)

    expect(screen.getByText('测试内容').closest('.custom-class')).toBeInTheDocument()
  })

  it('应该支持 Mermaid 图表（启用时）', async () => {
    const content = '```mermaid\ngraph TD\n    A[开始] --> B[结束]\n```'

    render(<Markdown enableMermaid>{content}</Markdown>)

    // 等待 React.lazy 加载 Mermaid 组件
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Mermaid 图表' })).toBeInTheDocument()
    })
  })

  it('应该在禁用 Mermaid 时渲染为代码块', () => {
    const content = '```mermaid\ngraph TD\n    A[开始] --> B[结束]\n```'

    render(<Markdown enableMermaid={false}>{content}</Markdown>)

    expect(screen.getByText(/graph TD/)).toBeInTheDocument()
  })

  it('应过滤 img 上的 onerror 属性以防 XSS', () => {
    const content = '<img src="x" alt="bad" onerror="alert(1)">'

    const { container } = render(<Markdown>{content}</Markdown>)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.hasAttribute('onerror')).toBe(false)
    expect(img?.getAttribute('onerror')).toBeNull()
  })

  it('应剥离 javascript: 协议的链接 href', () => {
    const content = '<a href="javascript:alert(1)">点我</a>'

    const { container } = render(<Markdown>{content}</Markdown>)

    const link = container.querySelector('a')
    // rehype-sanitize 默认会移除 javascript: 协议（href 被删除或留下文本节点）
    if (link) {
      const href = link.getAttribute('href')
      // href 应为 null（属性被剥离）或不以 javascript: 开头
      if (href !== null) {
        expect(href).not.toMatch(/^javascript:/i)
      }
    }
  })

  it('应过滤 script 标签防止脚本注入', () => {
    const content = '<p>正常内容</p><script>window.__pwned=1</script>'

    const { container } = render(<Markdown>{content}</Markdown>)

    expect(container.querySelector('script')).toBeNull()
  })
})
