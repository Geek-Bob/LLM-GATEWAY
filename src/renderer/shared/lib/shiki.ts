import { createHighlighter, type Highlighter } from 'shiki'

let highlighter: Highlighter | null = null

export async function getHighlighter(): Promise<Highlighter> {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['dark-plus'],
      langs: ['typescript', 'javascript', 'python', 'json', 'bash']
    })
  }
  return highlighter
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  try {
    const h = await getHighlighter()
    return h.codeToHtml(code, {
      lang,
      theme: 'dark-plus'
    })
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
