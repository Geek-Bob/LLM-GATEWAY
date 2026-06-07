/**
 * 代码审查工作流 — 对照16个规则文件审查全量代码
 *
 * 架构：12个审查维度并行扫描 → 汇总去重 → 输出报告
 * 预估：12 agents × ~30s = 并行 ~30s 完成
 */

export const meta = {
  name: 'code-review-against-rules',
  description: '对照16个规则文件审查全量代码，发现不合规代码',
  phases: [
    { title: '审查', detail: '12个维度并行扫描 src/' },
    { title: '汇总', detail: '去重 + 分级 + 输出报告' },
  ],
}

const AUDIT_PROMPTS = {
  // ── 后端架构 ──
  layered: `你是代码审查专家。审查 src/main/ 的分层架构合规性。

规则摘要（.claude/rules/backend/30-layered-architecture.md）：
- 5层：入口层(index.ts,update/) → 接口层(ipc/,proxy/) → 业务层(domains/) → 数据层(db/) → 基础设施层(core/)
- 上层可导入下层，下层禁止导入上层
- ipc/ 禁止导入 db/
- proxy/ 禁止导入 db/、domains/
- domains/ 禁止导入 proxy/
- db/ 禁止导入 domains/、proxy/、ipc/
- core/ 禁止导入 domains/、proxy/、ipc/、db/

审查 src/main/ 下所有 .ts 文件的 import 语句，检查是否有违反上述导入约束的情况。
特别关注：
1. ipc/*.ts 是否直接导入了 db/ 下的文件
2. proxy/ 下是否导入了 domains/ 或 db/
3. domains/ 下是否导入了 proxy/
4. db/ 下是否导入了 domains/、proxy/、ipc/
5. core/ 下是否导入了业务层文件

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体导入语句`,

  domainModel: `你是代码审查专家。审查 src/main/domains/ 的领域建模合规性。

规则摘要（.claude/rules/backend/31-domain-modeling.md）：
- 每个 domain 目录必须包含三个文件：{name}.types.ts、{name}.schema.ts、{name}.service.ts
- service 通过工厂函数创建：createXxxService(_db: Database)
- service 必须委托给 db/*.ts 数据层函数，禁止内联 SQL（db.prepare(...)）
- 工厂函数返回纯对象，方法通过闭包访问

审查所有 domains/*/ 下的文件：
1. 是否每个 domain 都有 types.ts + schema.ts + service.ts 三件套
2. service.ts 是否使用工厂函数模式 createXxxService(_db)
3. service.ts 中是否有内联 SQL（db.prepare、db.run、db.exec 等）
4. service.ts 是否正确委托给 db/*.ts 函数
5. 工厂函数是否返回纯对象

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  ipcContracts: `你是代码审查专家。审查 src/main/ipc/ 的接口契约合规性。

规则摘要（.claude/rules/backend/32-interface-contracts.md）：
- IPC 通道命名格式：{domain}:{action}（如 providers:list、agents:create）
- 动作词：list / getById / create / update / delete
- handler 参数必须有显式类型标注（禁止隐式 any）
- create/update handler 入口必须有 Zod .parse() 验证
- handler 只做：校验输入 → 调用 service → 捕获错误 → 返回结果
- handler 内禁止写业务逻辑（Map 聚合、条件判断、数据转换）
- 禁止返回裸字符串或 undefined 作为成功响应

审查 src/main/ipc/ 下所有 .ts 文件：
1. 通道命名是否符合 {domain}:{action} 格式
2. handler 参数是否有显式类型（data: XxxInput）
3. create/update handler 是否有 Zod .parse() 验证
4. handler 内是否有业务逻辑（应该委托给 service）
5. 返回值是否为结构化数据

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  dataAccess: `你是代码审查专家。审查 src/main/db/ 的数据访问合规性。

规则摘要（.claude/rules/backend/33-data-access.md）：
- 数据层提供函数式接口（findProviders()、insertApiKey()），封装所有 SQL
- 字段命名使用 snake_case（数据库层），应用层使用 camelCase
- 映射在 service 层完成（禁止在数据层做 camelCase 转换）
- 事务在数据层开启和提交
- 禁止在循环中逐条插入（使用批量操作）
- 禁止数据库连接对象泄漏

审查 src/main/db/ 下所有 .ts 文件：
1. 是否所有 SQL 都封装在函数中
2. 返回值是否保持 snake_case（不做 camelCase 转换）
3. 是否有事务管理问题
4. 是否有逐条插入（应该批量）
5. 是否有连接泄漏风险

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  errorHandling: `你是代码审查专家。审查 src/main/ 的错误处理合规性。

规则摘要（.claude/rules/backend/34-error-handling.md）：
- 使用原生 Error，通过消息前缀区分类型：
  - 验证错误：Invalid input: {path}: {message}
  - 业务错误：Failed to {action} {entity}: {reason}
  - 系统错误：基础设施消息
- 每次 throw 必须携带操作名 + 关键参数
- 禁止：空 catch 块、只打印不处理、吞没错误、暴露堆栈给用户
- 禁止用一个通用错误消息格式处理所有错误

审查 src/main/ 下所有 .ts 文件：
1. 空 catch 块（catch {} 或 catch(e) {} 无处理）
2. 只打印不处理（catch(e) { console.log(e) } 或 logger.xxx(e) 后继续）
3. 吞没错误（.catch(() => null) 或 .catch(() => {})）
4. 无上下文的 throw（throw new Error('error')）
5. 错误消息格式不符合规范
6. 暴露堆栈给用户（return { error: e.stack }）

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  security: `你是代码审查专家。审查 src/main/ 的安全合规性。

规则摘要（.claude/rules/backend/35-security.md）：
- API Key 日志脱敏：只保留后 4 位，前缀用 *** 替代
- 禁止将 API Key 写入日志、console、调试输出
- 代理服务只监听 localhost（127.0.0.1），禁止 0.0.0.0
- 请求头中的 Authorization 字段禁止写入调试日志

审查 src/main/ 下所有 .ts 文件：
1. 日志中是否有未脱敏的 API Key、Token、密码
2. 是否有 console.log 输出敏感信息
3. serve() 调用是否绑定 127.0.0.1
4. catch 块中是否泄露敏感参数
5. 调试日志是否包含 Authorization 头

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  observability: `你是代码审查专家。审查 src/main/ 的可观测性合规性。

规则摘要（.claude/rules/backend/36-observability.md）：
- 统一使用 core/logger.ts（禁止 console.log/error/warn）
- 日志消息包含：时间戳+级别+模块名+消息
- 结构化数据通过 metadata 对象传递，不拼接到消息字符串
- 调试日志不计入正式日志轮转配额

审查 src/main/ 下所有 .ts 文件：
1. 是否使用 console.log / console.error / console.warn（应该用 logger）
2. logger 调用是否正确使用 metadata 对象（不拼接大对象到消息）
3. 是否有 import { logger } from './core/logger'（应该是 createLogger）
4. 日志级别使用是否合理（ERROR/WARN/INFO/DEBUG）

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  // ── 前端 ──
  frontendDir: `你是代码审查专家。审查 src/renderer/ 的目录结构和导入合规性。

规则摘要（.claude/rules/frontend/35-frontend-directory.md）：
- 统一使用 @/ 别名（映射到 src/renderer/*），禁止相对路径（../、../../）
- 依赖方向：pages/ → features/ + lib/queries/ → components/ui/ + lib/ipc.ts
- components/ui/ 不得导入 features/、pages/、lib/queries/
- features/ 之间不得交叉导入
- 组件内禁止直接数据访问（走 queries/）
- hooks/ 返回纯数据，禁止返回 JSX

审查 src/renderer/ 下所有 .tsx/.ts 文件：
1. 是否使用相对路径导入（../、../../）
2. components/ui/ 是否违规导入 features/、pages/、queries/
3. features/ 之间是否交叉导入
4. 组件内是否直接调用 useQuery/useMutation（应该在 queries/ 中）
5. hooks/ 是否返回 JSX

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体导入语句`,

  componentReuse: `你是代码审查专家。审查 src/renderer/ 的组件复用合规性。

规则摘要（.claude/rules/frontend/32-component-reuse.md）：
- 禁止使用原生 HTML 元素替代 components/ui/ 中已有组件
  - 禁止：<button>、<input>、<select>、<form>、<textarea> 及其 motion.* 包装
- 需要动画交互时，将 motion 包装应用于共享组件，而非替代
- 禁止导入外部 UI 库（react-select、@headlessui）
- 重复出现 3 次以上的 UI 模式必须抽取为共享组件

审查 src/renderer/ 下所有 .tsx 文件：
1. 是否使用原生 <button>、<input>、<select>、<form>、<textarea>（应该用 Button、Input、Select 等）
2. 是否使用 motion.button、motion.input 等替代共享组件
3. 是否导入外部 UI 库绕过共享组件
4. 是否有重复 3+ 次的 UI 模式未抽取

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  dataFlow: `你是代码审查专家。审查 src/renderer/ 的数据流合规性。

规则摘要（.claude/rules/frontend/31-renderer.md）：
- 所有 CRUD 数据请求通过 lib/queries/ 封装
- 页面/组件禁止直接调用 useQuery / useMutation
- lib/api-client.ts 仅封装 Chat 代理 HTTP 请求（SSE 流）
- queryKey 格式：['domain', 'action', ...params] 层级化数组
- 禁止 .catch(() => {}) 静默吞没错误

审查 src/renderer/ 下所有 .tsx/.ts 文件：
1. pages/ 和 features/ 组件中是否直接使用 useQuery/useMutation
2. queryKey 是否符合 ['domain', 'action', ...params] 格式
3. 是否有 .catch(() => {}) 或 .catch(() => null) 静默吞没
4. 业务 CRUD 是否误用 apiFetch（应该走 IPC）

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体代码片段`,

  // ── 通用 ──
  codeQuality: `你是代码审查专家。审查全量 src/ 代码的工程质量。

规则摘要（.claude/rules/common/05-engineering.md + 00-global.md）：
- 函数长度不超过 50 行（函数体内实际代码行数）
- 嵌套深度不超过 3 层（if/for/while/switch/try-catch 各算一层）
- 导出函数/类必须有 JSDoc
- 包含魔法数字的计算逻辑必须注释说明含义
- 文件名：组件 .tsx 用 PascalCase，工具 .ts 用 camelCase
- 测试文件：{name}.test.ts 或 {name}.spec.ts，与源文件同目录

审查 src/ 下所有 .ts/.ts 文件：
1. 超过 50 行的函数（列出函数名和行数）
2. 超过 3 层嵌套的代码块
3. 导出函数缺少 JSDoc 的情况（抽查关键模块）
4. 魔法数字未注释
5. 文件名不符合 PascalCase/camelCase 规范

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体情况`,

  naming: `你是代码审查专家。审查 src/ 的命名规范合规性。

规则摘要（.claude/rules/common/00-global.md）：
- 组件/类：PascalCase
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 布尔值：is/has/can 开头（例外：框架返回值如 isLoading、React 事件回调如 onChange）

审查 src/ 下所有 .ts/.tsx 文件的导出标识符：
1. 非布尔变量/函数是否错误使用 is/has/can 前缀
2. 布尔值是否缺少 is/has/can 前缀
3. 常量是否使用 UPPER_SNAKE_CASE
4. 类/接口是否使用 PascalCase
5. 是否有缩写命名（除非是领域共识如 API、URL）

对每个发现，输出：文件路径:行号 | 违反的规则 | 具体标识符名`,
}

// 12 个审查维度
const DIMENSIONS = [
  { key: 'layered', prompt: AUDIT_PROMPTS.layered, label: '后端分层架构' },
  { key: 'domainModel', prompt: AUDIT_PROMPTS.domainModel, label: '领域建模' },
  { key: 'ipcContracts', prompt: AUDIT_PROMPTS.ipcContracts, label: 'IPC接口契约' },
  { key: 'dataAccess', prompt: AUDIT_PROMPTS.dataAccess, label: '数据访问' },
  { key: 'errorHandling', prompt: AUDIT_PROMPTS.errorHandling, label: '错误处理' },
  { key: 'security', prompt: AUDIT_PROMPTS.security, label: '安全' },
  { key: 'observability', prompt: AUDIT_PROMPTS.observability, label: '可观测性' },
  { key: 'frontendDir', prompt: AUDIT_PROMPTS.frontendDir, label: '前端目录结构' },
  { key: 'componentReuse', prompt: AUDIT_PROMPTS.componentReuse, label: '组件复用' },
  { key: 'dataFlow', prompt: AUDIT_PROMPTS.dataFlow, label: '前端数据流' },
  { key: 'codeQuality', prompt: AUDIT_PROMPTS.codeQuality, label: '代码质量' },
  { key: 'naming', prompt: AUDIT_PROMPTS.naming, label: '命名规范' },
]

// ── 主流程 ──
phase('审查')

const findings = await parallel(
  DIMENSIONS.map(d => () =>
    agent(d.prompt, {
      label: `审查:${d.label}`,
      phase: '审查',
      model: 'sonnet',
    })
  )
)

phase('汇总')

// 汇总所有发现
const summary = findings.map((result, i) => ({
  dimension: DIMENSIONS[i].key,
  label: DIMENSIONS[i].label,
  content: result || '无发现',
}))

// 输出结构化报告
let report = `# 代码审查报告\n\n`
report += `**审查时间**: ${new Date().toISOString()}\n`
report += `**审查维度**: ${DIMENSIONS.length} 个\n`
report += `**规则文件**: 16 个\n\n`
report += `---\n\n`

for (const s of summary) {
  report += `## ${s.label}\n\n`
  report += `${s.content}\n\n`
  report += `---\n\n`
}

return { report, summary }
