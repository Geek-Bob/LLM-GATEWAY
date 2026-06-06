/**
 * 代码编辑器组件
 *
 * 基于 Monaco Editor，支持语法高亮、代码折叠、格式化等功能。
 * 用于编辑 JSON/TOML/ENV 等配置文件。
 */

import { useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'toml' | 'plaintext'
  height?: string
  readOnly?: boolean
}

/**
 * 代码编辑器组件
 *
 * @param value - 编辑器内容
 * @param onChange - 内容变更回调
 * @param language - 语言类型（json/toml/plaintext）
 * @param height - 编辑器高度
 * @param readOnly - 是否只读
 */
export function CodeEditor({
  value,
  onChange,
  language = 'json',
  height = '400px',
  readOnly = false,
}: CodeEditorProps) {
  const editorRef = useRef<any>(null)

  /** 编辑器挂载回调 */
  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor

    // 添加格式化快捷键 (Shift+Alt+F)
    editor.addAction({
      id: 'format-document',
      label: 'Format Document',
      keybindings: [
        // Shift+Alt+F
        2048 | 512 | 33,
      ],
      run: () => {
        editor.getAction('editor.action.formatDocument')?.run()
      },
    })
  }

  /** 格式化代码 */
  const handleFormat = () => {
    if (editorRef.current) {
      editorRef.current.getAction('editor.action.formatDocument')?.run()
    }
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="bg-muted/50 px-3 py-1.5 flex items-center justify-between border-b">
        <span className="text-xs text-muted-foreground">
          {language === 'json' ? 'JSON' : language === 'toml' ? 'TOML' : 'Text'}
        </span>
        <button
          type="button"
          onClick={handleFormat}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="格式化 (Shift+Alt+F)"
        >
          格式化
        </button>
      </div>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 20,
          padding: { top: 12, bottom: 12 },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          folding: true,
          foldingHighlight: true,
          showFoldingControls: 'always',
          formatOnPaste: true,
          formatOnType: true,
          tabSize: 2,
          renderLineHighlight: 'line',
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
        }}
        theme="vs-dark"
      />
    </div>
  )
}
