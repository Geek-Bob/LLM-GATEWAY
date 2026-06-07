export const meta = {
  name: 'code-audit',
  description: '全量代码审查：检查前端、后端、通用代码是否符合优化后的规则',
  phases: [
    { title: '前端审查' },
    { title: '后端审查' },
    { title: '通用审查' },
    { title: '汇总验证' },
  ],
}

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string', description: '违反的规则文件名' },
          file: { type: 'string', description: '问题文件路径' },
          line: { type: 'string', description: '问题行号或行范围' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'], description: 'P0=阻断 P1=重要 P2=建议' },
          description: { type: 'string', description: '问题描述' },
          fix: { type: 'string', description: '修复建议' },
        },
        required: ['rule', 'file', 'severity', 'description', 'fix'],
      },
    },
  },
  required: ['findings'],
}

// ===== 前端审查 =====
phase('前端审查')

const feDirectoryAudit = agent(
  `审查 src/renderer/ 代码是否符合 35-frontend-directory.md 规则：
  1. 统一使用 @/ 别名，禁止相对路径（../）
  2. components/ui/ 不得导入 features/、pages/、lib/queries/
  3. features/ 之间不得交叉导入
  4. 组件内禁止直接 IPC 调用（必须封装在 hooks/ 或 queries/ 中）
  5. 文件放置是否正确（功能域组件在 features/{name}/components/，全局 hooks 在 hooks/）

  重点检查：import 语句的路径是否合规。
  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'fe:directory', phase: '前端审查', schema: FINDING_SCHEMA }
)

const feComponentReuseAudit = agent(
  `审查 src/renderer/ 代码是否符合 32-component-reuse.md 规则：
  1. 禁止使用原生 HTML 元素替代 components/ui/ 中已有的组件（<input>→Input, <select>→Select, <button>→Button）
  2. 禁止在页面/功能中自行实现弹窗、下拉、对话框
  3. 禁止使用内联 Tailwind 模拟共享组件样式
  4. 禁止导入外部 UI 库绕过共享组件
  5. 重复出现 3 次以上的 UI 模式是否已抽取为共享组件

  重点检查：pages/ 和 features/ 中是否有原生 HTML 表单元素、自建弹窗等。
  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'fe:component-reuse', phase: '前端审查', schema: FINDING_SCHEMA }
)

const feVisualAudit = agent(
  `审查 src/renderer/ 代码是否符合 37-visual-style.md + 38-animation.md 规则：
  1. 禁止硬编码 Tailwind 色值（bg-slate-900、text-gray-500 等）
  2. 禁止使用内联 style={{ }} 设置颜色、间距、尺寸
  3. 禁止 Tailwind 任意值（h-[13px]、w-[27px] 等）
  4. 圆角规范：容器 rounded-xl，小元素 rounded-md
  5. 阴影 3 级规范（shadow / shadow-md / shadow-xl）
  6. 页面入场使用 pageVariants + childVariants，列表行入场使用 rowFadeIn(idx)

  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'fe:visual', phase: '前端审查', schema: FINDING_SCHEMA }
)

const feDataFlowAudit = agent(
  `审查 src/renderer/ 代码是否符合 31-renderer.md 规则：
  1. 所有 CRUD 数据请求通过 lib/queries/ 封装，页面禁止直接调用 useQuery / useMutation
  2. lib/api-client.ts 仅封装 Chat 代理 HTTP 请求，不用于业务 CRUD
  3. hooks/ 返回纯数据，禁止返回 JSX
  4. queryKey 格式为 ['domain', 'action', ...params] 数组
  5. renderer 层用 Omit<ProviderEntity, 'apiKey'> 保护敏感字段
  6. 禁止 .catch(() => {}) 静默吞没错误

  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'fe:data-flow', phase: '前端审查', schema: FINDING_SCHEMA }
)

// ===== 后端审查 =====
phase('后端审查')

const beArchitectureAudit = agent(
  `审查 src/main/ 代码是否符合 30-layered-architecture.md + 31-domain-modeling.md 规则：
  1. 导入路径约束：
     - ipc/ 禁止导入 db/
     - proxy/ 禁止导入 db/ 和 domains/
     - domains/ 禁止导入 db/ 和 proxy/
     - db/ 禁止导入 domains/、proxy/、ipc/
     - core/ 禁止导入 domains/、proxy/、ipc/、db/
  2. 工厂注入模式：每个 service 通过 createXxxService(db: Database) 创建
  3. domains/ 中每个聚合根有且仅一个 service.ts
  4. 每个 domain 目录包含 {name}.types.ts、{name}.schema.ts、{name}.service.ts

  重点检查：所有 import 语句是否符合层级约束，service 是否使用工厂注入。
  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'be:architecture', phase: '后端审查', schema: FINDING_SCHEMA }
)

const beInterfaceAudit = agent(
  `审查 src/main/ 代码是否符合 32-interface-contracts.md + 34-error-handling.md 规则：
  1. 所有 IPC handler 的输入必须有 Zod .parse() 校验
  2. IPC 通道命名格式：{domain}:{action}
  3. handler 只做：校验输入 → 调用 service → 返回结果，禁止写业务逻辑
  4. handler 参数必须有显式类型标注（禁止隐式 any）
  5. 错误消息格式：
     - 验证错误：Invalid {field}: {reason}
     - 业务错误：Failed to {action} {entity}: {reason}
     - 系统错误：基础设施消息
  6. 禁止空 catch 块、只打印不处理、吞没错误

  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'be:interface', phase: '后端审查', schema: FINDING_SCHEMA }
)

const beDataAudit = agent(
  `审查 src/main/ 代码是否符合 33-data-access.md + 35-security.md 规则：
  1. 数据层提供函数式接口，业务层禁止绕过数据层直接编写 SQL
  2. 业务层通过工厂参数注入的 db 对象调用数据层函数，禁止导入 db/connection.ts
  3. 事务在数据层开启和提交
  4. API Key 日志脱敏：只保留后 4 位，前缀用 *** 替代
  5. 禁止将 API Key 写入 NDJSON、console、调试日志
  6. 代理服务只监听 localhost（127.0.0.1）

  重点检查：是否有 SQL 直接写在 service 层、API Key 是否在日志中泄露。
  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'be:data-security', phase: '后端审查', schema: FINDING_SCHEMA }
)

const beObservabilityAudit = agent(
  `审查 src/main/ 代码是否符合 36-observability.md + 35-security.md 规则：
  1. 统一使用 core/logger.ts，禁止 console.log / console.error / console.warn
  2. 日志消息包含：时间戳 + 级别 + 模块名 + 消息
  3. 结构化数据通过 metadata 对象传递，不拼接到消息字符串
  4. 请求链路记录：请求路径、供应商、模型、状态码、耗时
  5. 调试日志使用独立文件，每次启动时自动清空
  6. 禁止在 catch 块中将敏感参数原样写入错误消息

  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'be:observability', phase: '后端审查', schema: FINDING_SCHEMA }
)

// ===== 通用审查 =====
phase('通用审查')

const commonAudit = agent(
  `审查 src/ 全部代码是否符合 00-global.md + 05-engineering.md 规则：
  1. 命名约定：组件/类 PascalCase，函数/变量 camelCase，常量 UPPER_SNAKE_CASE，布尔值 is/has/can 开头
  2. 文件名：组件 .tsx 用 PascalCase，工具 .ts 用 camelCase
  3. 导出函数/类必须有 JSDoc
  4. 单函数不超过 50 行
  5. 嵌套深度不超过 3 层
  6. 单文件超过 500 行时必须按职责拆分
  7. 禁止使用 enum、namespace、装饰器（TypeScript）

  重点检查：文件行数、函数行数、命名规范、JSDoc 缺失。
  输出 JSON 格式，每个问题包含 rule/file/line/severity/description/fix。`,
  { label: 'common:global', phase: '通用审查', schema: FINDING_SCHEMA }
)

// ===== 汇总验证 =====
phase('汇总验证')

const allFindings = [
  ...feDirectoryAudit.findings,
  ...feComponentReuseAudit.findings,
  ...feVisualAudit.findings,
  ...feDataFlowAudit.findings,
  ...beArchitectureAudit.findings,
  ...beInterfaceAudit.findings,
  ...beDataAudit.findings,
  ...beObservabilityAudit.findings,
  ...commonAudit.findings,
].filter(Boolean)

// 去重（同一 file+line+rule 只保留一个）
const seen = new Set()
const deduped = allFindings.filter(f => {
  const key = `${f.rule}:${f.file}:${f.line}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

// 按严重性排序
const sorted = deduped.sort((a, b) => {
  const order = { P0: 0, P1: 1, P2: 2 }
  return (order[a.severity] ?? 3) - (order[b.severity] ?? 3)
})

// 验证关键发现
const p0Findings = sorted.filter(f => f.severity === 'P0')
const verified = await parallel(
  p0Findings.map(f => () =>
    agent(
      `验证这个 P0 问题是否真实存在，读取文件确认：
      规则: ${f.rule}
      文件: ${f.file}
      行: ${f.line}
      描述: ${f.description}

      如果确认存在，返回 { "confirmed": true }；如果误报，返回 { "confirmed": false, "reason": "..." }`,
      { label: `verify:${f.file}`, phase: '汇总验证', schema: { type: 'object', properties: { confirmed: { type: 'boolean' }, reason: { type: 'string' } }, required: ['confirmed'] } }
    )
  )
)

const confirmedP0 = p0Findings.filter((f, i) => verified[i]?.confirmed)

return {
  summary: {
    total: sorted.length,
    P0: sorted.filter(f => f.severity === 'P0').length,
    P1: sorted.filter(f => f.severity === 'P1').length,
    P2: sorted.filter(f => f.severity === 'P2').length,
    confirmedP0: confirmedP0.length,
  },
  findings: sorted,
  confirmedP0,
}
