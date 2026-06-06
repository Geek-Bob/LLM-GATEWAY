export const meta = {
  name: 'ui-standards-audit-v2',
  description: '审查 UI 规范 8 个板块的实现情况（精简版）',
  phases: [
    { title: '审查', detail: '逐板块审查当前实现' },
    { title: '敲定', detail: '确定最终规范' },
  ],
}

// Phase 1: 逐板块审查
phase('审查')

const audit = await agent(
  `审查 E:\\code\\llm-gateway\\src\\renderer 的 UI 规范实现。

读取以下文件，分析 8 个板块的现状：

1. **视觉风格** — 读取 src/renderer/index.css，检查颜色/字体/间距/圆角/阴影是否有统一规范
2. **样式系统** — 检查 Tailwind 配置、主题变量使用
3. **组件体系** — 列出 components/ui/ 中所有组件，检查是否有遗漏
4. **目录结构** — 检查文件组织是否统一
5. **模块边界** — 检查导入方向是否正确
6. **数据流** — 检查 TanStack Query 和 IPC 调用模式
7. **复用规则** — 检查是否有重复代码
8. **动效规范** — 检查动画使用是否统一

输出 JSON：
{
  "visualStyle": { "score": 0-100, "issues": [], "recommendations": [] },
  "styleSystem": { "score": 0-100, "issues": [], "recommendations": [] },
  "componentSystem": { "score": 0-100, "issues": [], "recommendations": [] },
  "directoryStructure": { "score": 0-100, "issues": [], "recommendations": [] },
  "moduleBoundaries": { "score": 0-100, "issues": [], "recommendations": [] },
  "dataFlow": { "score": 0-100, "issues": [], "recommendations": [] },
  "reuseRules": { "score": 0-100, "issues": [], "recommendations": [] },
  "animationStandards": { "score": 0-100, "issues": [], "recommendations": [] }
}`,
  { label: 'audit-all', phase: '审查' }
)

// Phase 2: 敲定规范
phase('敲定')

await agent(
  `基于审查结果，创建《LLM Gateway UI 规范文档》。

## 审查结果
${JSON.stringify(audit, null, 2)}

## 要求

为每个板块（视觉风格、样式系统、组件体系、目录结构、模块边界、数据流、复用规则、动效规范）创建规范，包含：

1. **规范描述** — 这个板块要求什么
2. **代码示例** — 正确 ✅ 和错误 ❌ 的示例
3. **检查清单** — 开发时需要检查的项目

输出 Markdown 格式，可以直接写入 docs/standards/ui-standards.md 文件。`,
  { label: 'define-standards', phase: '敲定' }
)

log('## UI 规范审查完成')
