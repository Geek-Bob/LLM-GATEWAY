export const meta = {
  name: 'ui-standards-audit',
  description: '审查 UI 规范 8 个板块的实现情况',
  phases: [
    { title: '审查', detail: '逐板块审查当前实现' },
    { title: '方案', detail: '提出改进方案' },
    { title: '敲定', detail: '确定最终规范' },
  ],
}

// Phase 1: 逐板块审查
phase('审查')

const audit = await parallel([
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「视觉风格」实现。

检查：
1. **颜色系统** — 是否有统一的颜色变量？是否使用 Tailwind 主题变量？
2. **字体系统** — 字体大小、行高、字重是否有规范？
3. **间距系统** — padding/margin 是否有统一的间距规范？
4. **圆角系统** — border-radius 是否有统一规范？
5. **阴影系统** — shadow 是否有统一规范？

读取以下文件：
- src/renderer/index.css（全局样式）
- tailwind.config.ts 或类似配置
- 任意 3 个页面组件（检查实际使用的样式变量）

输出 JSON：
{
  "current": {
    "colors": { "implemented": true/false, "description": "", "issues": [] },
    "typography": { "implemented": true/false, "description": "", "issues": [] },
    "spacing": { "implemented": true/false, "description": "", "issues": [] },
    "borderRadius": { "implemented": true/false, "description": "", "issues": [] },
    "shadows": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:visual', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「样式系统」实现。

检查：
1. **Tailwind 配置** — 是否有自定义配置？是否使用 CSS 变量？
2. **主题变量** — 是否使用 bg-background、text-foreground 等语义化变量？
3. **响应式设计** — 是否有统一的断点规范？
4. **暗色模式** — 是否支持？如何切换？
5. **类名组织** — 是否有统一的类名组织方式？

读取以下文件：
- tailwind.config.ts 或类似配置
- src/renderer/index.css
- 任意 3 个组件（检查 Tailwind 使用方式）

输出 JSON：
{
  "current": {
    "tailwindConfig": { "implemented": true/false, "description": "", "issues": [] },
    "themeVariables": { "implemented": true/false, "description": "", "issues": [] },
    "responsive": { "implemented": true/false, "description": "", "issues": [] },
    "darkMode": { "implemented": true/false, "description": "", "issues": [] },
    "classNameOrganization": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:styling', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「组件体系」实现。

检查：
1. **UI 组件库** — components/ui/ 中有哪些组件？是否完整？
2. **页面组件** — pages/*.tsx 是否有统一的结构？
3. **功能组件** — features/*/components/ 是否有统一的规范？
4. **Hooks** — hooks/ 中有哪些通用 Hooks？
5. **组件规范** — 是否有统一的 props 命名、事件处理、样式组织？

读取以下文件：
- 列出 components/ui/ 中所有组件
- 读取 2 个页面组件（检查结构）
- 读取 2 个功能组件（检查结构）
- 列出 hooks/ 中所有 Hooks

输出 JSON：
{
  "current": {
    "uiComponents": { "count": 0, "list": [], "missing": [] },
    "pageComponents": { "structure": "", "issues": [] },
    "featureComponents": { "structure": "", "issues": [] },
    "hooks": { "count": 0, "list": [], "missing": [] },
    "componentStandards": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:components', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「目录结构」实现。

检查：
1. **文件组织** — 是否遵循 features/*/ 模式？
2. **命名约定** — 文件名、组件名、函数名是否统一？
3. **导入路径** — 是否统一使用 @/ 别名？
4. **Barrel Export** — 是否有 index.ts 统一导出？

扫描 src/renderer 目录结构。

输出 JSON：
{
  "current": {
    "fileOrganization": { "implemented": true/false, "description": "", "issues": [] },
    "namingConventions": { "implemented": true/false, "description": "", "issues": [] },
    "importPaths": { "implemented": true/false, "description": "", "issues": [] },
    "barrelExport": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:structure', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「模块边界」实现。

检查：
1. **导入方向** — 是否遵循单向依赖？
2. **编译隔离** — renderer 是否导入了 main？
3. **类型共享** — 是否通过 shared/types.ts 共享？
4. **跨模块引用** — features/ 之间是否互相引用？

扫描所有 .tsx 和 .ts 文件的 import 语句。

输出 JSON：
{
  "current": {
    "importDirection": { "implemented": true/false, "description": "", "issues": [] },
    "compileIsolation": { "implemented": true/false, "description": "", "issues": [] },
    "typeSharing": { "implemented": true/false, "description": "", "issues": [] },
    "crossModuleReference": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:boundaries', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「数据流」实现。

检查：
1. **TanStack Query** — 是否统一使用？queryKey 命名是否规范？
2. **IPC 调用** — 是否通过 preload？是否有类型安全？
3. **状态管理** — useState 使用是否合理？是否有不必要的 prop drilling？
4. **错误处理** — 是否有统一的错误处理模式？

读取以下文件：
- src/renderer/lib/queries/*.ts（所有 query hooks）
- src/renderer/lib/ipc.ts
- 任意 2 个使用状态的组件

输出 JSON：
{
  "current": {
    "tanstackQuery": { "implemented": true/false, "description": "", "issues": [] },
    "ipcCalls": { "implemented": true/false, "description": "", "issues": [] },
    "stateManagement": { "implemented": true/false, "description": "", "issues": [] },
    "errorHandling": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:dataflow', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「复用规则」实现。

检查：
1. **组件复用** — 是否有重复的 UI 模式？
2. **Hook 复用** — 是否有重复的逻辑？
3. **工具函数复用** — 是否有重复的工具函数？
4. **样式复用** — 是否有重复的样式？

扫描所有 .tsx 和 .ts 文件，找出重复模式。

输出 JSON：
{
  "current": {
    "componentReuse": { "implemented": true/false, "description": "", "issues": [] },
    "hookReuse": { "implemented": true/false, "description": "", "issues": [] },
    "utilityReuse": { "implemented": true/false, "description": "", "issues": [] },
    "styleReuse": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:reuse', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的「动效规范」实现。

检查：
1. **动画库** — 是否使用 framer-motion？
2. **入场动画** — 是否有统一的入场动画模式？
3. **退出动画** — 是否有统一的退出动画模式？
4. **过渡动画** — 是否有统一的过渡动画模式？
5. **动画常量** — 是否有共享的动画常量？

读取以下文件：
- src/renderer/lib/animations.ts
- 任意 3 个使用动画的组件

输出 JSON：
{
  "current": {
    "animationLibrary": { "implemented": true/false, "description": "", "issues": [] },
    "enterAnimations": { "implemented": true/false, "description": "", "issues": [] },
    "exitAnimations": { "implemented": true/false, "description": "", "issues": [] },
    "transitionAnimations": { "implemented": true/false, "description": "", "issues": [] },
    "animationConstants": { "implemented": true/false, "description": "", "issues": [] }
  },
  "recommendations": []
}`,
    { label: 'audit:animation', phase: '审查' }
  ),
])

// Phase 2: 提出改进方案
phase('方案')

const plan = await agent(
  `基于以下审查结果，为每个板块提出具体的改进方案。

## 审查结果
${JSON.stringify(audit, null, 2)}

## 要求

为每个板块（视觉风格、样式系统、组件体系、目录结构、模块边界、数据流、复用规则、动效规范）提供：

1. **现状评估** — 当前实现是否合理？有哪些问题？
2. **改进方案** — 具体需要做什么？
3. **实施步骤** — 按优先级排序的步骤
4. **验收标准** — 如何判断改进完成？

输出 Markdown 格式。`,
  { label: 'define-plan', phase: '方案' }
)

// Phase 3: 敲定规范
phase('敲定')

await agent(
  `基于审查结果和改进方案，创建最终的 UI 规范文档。

## 审查结果
${JSON.stringify(audit, null, 2)}

## 改进方案
${plan}

## 要求

创建《LLM Gateway UI 规范文档》，包含 8 个板块：

1. **视觉风格** — 颜色、字体、间距、圆角、阴影
2. **样式系统** — Tailwind 规范、主题变量、响应式
3. **组件体系** — UI 组件库 + 组件规范（页面/功能/共享）
4. **目录结构** — 文件组织、命名约定
5. **模块边界** — 导入方向、编译隔离、类型共享
6. **数据流** — TanStack Query、IPC 调用、状态管理
7. **复用规则** — 组件复用、Hook 复用、工具函数复用
8. **动效规范** — 入场/退出/过渡动画

每个板块必须包含：
- 规范描述
- 代码示例（正确 ✅ 和错误 ❌）
- 检查清单

输出 Markdown 格式，可以直接写入文件。`,
  { label: 'finalize-standards', phase: '敲定' }
)

log('## UI 规范审查完成')
log('已创建完整的 UI 规范文档。')
