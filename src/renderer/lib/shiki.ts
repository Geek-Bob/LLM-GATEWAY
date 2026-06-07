/**
 * Shiki 代码语法高亮工具
 *
 * 职责：为 Markdown 渲染提供代码块语法高亮，使用 Shiki 引擎生成带颜色的 HTML。
 *
 * 设计要点：
 * - 惰性单例：createHighlighter 开销大（需要加载语言 grammar 和 theme），
 *   首次调用时才创建，后续复用。高亮器一旦创建不会销毁。
 * - 语言限制：仅支持 ts/js/python/json/bash 五种语言（与 .claude/rules/10-tech-stack.md 一致）
 * - 优雅降级：调用 codeToHtml 失败（如传入了不支持的语言名）时退回纯文本，不抛异常
 *
 * 使用场景：被 markdown.tsx 中的 CodeBlock 组件调用，仅在非流式模式下使用。
 */
import { createHighlighter, type Highlighter } from 'shiki'

/** 模块级惰性单例：初始化成本高，只创建一次 */
let highlighter: Highlighter | null = null

/** 获取 Shiki 代码高亮器惰性单例（首次调用时创建，后续复用）。 @returns Shiki 高亮器实例。 */
export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['dark-plus'],
      langs: ['typescript', 'javascript', 'python', 'json', 'bash']
    })
  }
  return highlighter
}

/**
 * 代码高亮渲染
 * @param code 源代码文本
 * @param lang 语言标识符，如 'typescript'、'python'
 * @returns 语法高亮后的 HTML 字符串，渲染失败时返回纯文本转义的 fallback
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  try {
    const h = await getHighlighter()
    return h.codeToHtml(code, {
      lang,
      theme: 'dark-plus'
    })
  } catch {
    // 降级：不支持的 language 名称或不合法输入时，输出纯文本
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

/** HTML 实体转义，防止 codeToHtml fallback 时 XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
