export const meta = {
  name: 'code-audit-refactor',
  description: '全面排查项目代码，找出组件重复、模式不一致、重构机会',
  phases: [
    { title: '扫描', detail: '并行扫描所有维度' },
    { title: '分析', detail: '汇总发现并生成修复方案' },
    { title: '修复', detail: '执行重构' },
  ],
}

const SCAN_DIMENSIONS = [
  {
    key: 'raw-html',
    label: '原生 HTML 表单元素',
    prompt: `扫描 E:\\code\\llm-gateway\\src\\renderer 下所有 .tsx 文件，找出所有原生 HTML 表单元素的使用：
- <select> / <option>
- <input> (排除 type="hidden" 和 type="file")
- <textarea>
- <button>

排除文件：
- src/renderer/components/ui/ 目录（这些是共享组件本身）
- __tests__ 目录

对每个发现，记录：
- 文件路径和行号
- 使用的原生元素类型
- 周围是否已有对应的共享组件可用
- 是否有合理的技术原因需要使用原生元素（如需要 ref 直接操作 DOM）

输出 JSON 格式：
{
  "findings": [
    {
      "file": "相对路径",
      "line": 行号,
      "element": "select|input|textarea|button",
      "sharedAlternative": "对应共享组件名",
      "hasValidReason": boolean,
      "reason": "如果有合理原因则说明"
    }
  ]
}`,
  },
  {
    key: 'duplicate-styles',
    label: '重复样式模式',
    prompt: `扫描 E:\\code\\llm-gateway\\src\\renderer 下所有 .tsx 文件，找出重复出现的 Tailwind 样式模式：

重点关注：
1. 相同的 className 组合出现 3 次以上（如 "flex items-center gap-2"）
2. 相同的容器布局模式（如卡片、对话框内容区）
3. 相同的状态指示器样式（如 loading spinner、error badge）
4. 相同的表格/列表样式

排除：
- 共享组件内部的样式
- 简单的 flex/padding/margin 组合（太通用不算重复）

输出 JSON 格式：
{
  "patterns": [
    {
      "pattern": "className 模式",
      "occurrences": 数量,
      "files": ["文件列表"],
      "suggestion": "建议抽取为什么组件"
    }
  ]
}`,
  },
  {
    key: 'inconsistent-imports',
    label: '导入路径不一致',
    prompt: `扫描 E:\\code\\llm-gateway\\src\\renderer 下所有 .tsx 文件，找出导入路径不一致的情况：

检查：
1. 同一组件使用不同导入路径（如 '@/components/ui/button' vs '../components/ui/button'）
2. 使用相对路径导入共享组件（应该用 @ 别名）
3. 导入了但未使用的组件
4. 缺失的导入（使用了但未导入）

输出 JSON 格式：
{
  "inconsistentImports": [
    {
      "file": "文件路径",
      "currentPath": "当前导入路径",
      "correctPath": "应该使用的路径",
      "component": "组件名"
    }
  ],
  "unusedImports": [
    {
      "file": "文件路径",
      "import": "未使用的导入"
    }
  ]
}`,
  },
  {
    key: 'code-duplication',
    label: '重复代码块',
    prompt: `扫描 E:\\code\\llm-gateway\\src\\renderer 下所有 .tsx 文件，找出重复的代码块：

重点关注：
1. 相同的事件处理逻辑（如 handleDelete、handleCreate 模式）
2. 相同的数据转换逻辑（如 formatDate、formatNumber）
3. 相同的表单验证逻辑
4. 相同的错误处理模式
5. 相同的 loading/error 状态处理

排除：
- 共享 hooks 中的代码（这些本身就是复用的）
- 简单的状态设置（setXxx(true/false)）

输出 JSON 格式：
{
  "duplications": [
    {
      "pattern": "代码模式描述",
      "files": ["文件列表"],
      "lines": "大致行数",
      "suggestion": "建议抽取为什么 hook/utils"
    }
  ]
}`,
  },
  {
    key: 'unused-code',
    label: '未使用的代码',
    prompt: `扫描 E:\\code\\llm-gateway\\src 下所有 .ts 和 .tsx 文件，找出未使用的代码：

检查：
1. 导出但从未被导入的函数/组件/类型
2. 定义但从未使用的变量/常量
3. 注释掉的代码块
4. TODO/FIXME/HACK 注释

使用 grep 搜索每个导出符号的使用情况。

输出 JSON 格式：
{
  "unusedExports": [
    {
      "name": "导出名",
      "file": "定义位置",
      "type": "function|component|type|constant"
    }
  ],
  "commentedCode": [
    {
      "file": "文件路径",
      "lines": "行范围",
      "content": "注释内容摘要"
    }
  ],
  "todos": [
    {
      "file": "文件路径",
      "line": 行号,
      "content": "TODO 内容"
    }
  ]
}`,
  },
]

// Phase 1: 并行扫描所有维度
phase('扫描')

const scanResults = await parallel(
  SCAN_DIMENSIONS.map(d => () =>
    agent(d.prompt, { label: `scan:${d.key}`, phase: '扫描' })
  )
)

// 整理扫描结果
const allFindings = {
  rawHtml: scanResults[0],
  duplicateStyles: scanResults[1],
  inconsistentImports: scanResults[2],
  codeDuplication: scanResults[3],
  unusedCode: scanResults[4],
}

// Phase 2: 分析汇总
phase('分析')

const analysis = await agent(
  `分析以下代码审计结果，生成修复方案：

## 扫描结果
${JSON.stringify(allFindings, null, 2)}

## 要求
1. 按优先级排序（P0=必须修复, P1=应该修复, P2=建议修复）
2. 每个修复项包含：
   - 问题描述
   - 影响范围
   - 修复方案
   - 预计工作量（小/中/大）
3. 识别可以批量处理的修复项
4. 识别可能有风险的修改（如需要修改共享组件）

输出 JSON 格式：
{
  "summary": {
    "totalIssues": 数量,
    "p0": 数量,
    "p1": 数量,
    "p2": 数量
  },
  "fixes": [
    {
      "priority": "P0|P1|P2",
      "category": "组件复用|样式统一|代码去重|清理",
      "title": "修复标题",
      "description": "问题描述",
      "files": ["涉及文件"],
      "solution": "修复方案",
      "effort": "小|中|大",
      "risk": "低|中|高"
    }
  ],
  "batchOperations": [
    {
      "name": "批量操作名称",
      "files": ["涉及文件"],
      "steps": ["操作步骤"]
    }
  ]
}`,
  { label: 'analyze', phase: '分析' }
)

// 输出分析结果
log('## 代码审计报告')
log(analysis)

return { allFindings, analysis }
