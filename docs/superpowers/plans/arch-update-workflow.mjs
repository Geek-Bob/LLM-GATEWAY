export const meta = {
  name: 'arch-doc-update',
  description: '双向交叉验证更新 ARCHITECTURE.md：文档→代码验证 + 代码→文档验证',
  phases: [
    { title: 'Phase 1: Doc→Code', detail: '读文档，验证代码是否匹配' },
    { title: 'Phase 2: Code→Doc', detail: '读代码，找文档遗漏' },
    { title: 'Phase 3: Cross-Validate', detail: '交叉验证并生成最终文档' },
  ],
}

const HAIKU = 'haiku'
const DOC_PATH = 'docs/ARCHITECTURE.md'

const DOC_SECTIONS = [
  { name: '目录结构', prompt: '验证文档中的目录结构树是否与实际 src/ 目录一致。列出所有不匹配的文件/目录（文档有但代码没有，或代码有但文档没有）。' },
  { name: '主进程分层', prompt: '验证文档中描述的 5 层架构（入口/接口/业务/数据/基础设施）是否与 src/main/ 实际结构一致。检查每个层的文件是否归类正确。' },
  { name: '代理层', prompt: '验证文档中 proxy/ 的文件列表和职责描述是否与 src/main/proxy/ 实际代码一致。检查每个文件的行数和主要导出。' },
  { name: 'IPC 层', prompt: '验证文档中 IPC 通道表是否与 src/main/ipc/ 实际 handler 注册一致。检查通道命名是否匹配。' },
  { name: 'Domain 层', prompt: '验证文档中 domains/ 的描述是否与 src/main/domains/ 实际结构一致。检查 service 工厂签名、types/schema 文件是否齐全。' },
  { name: '数据层', prompt: '验证文档中 db/ 的描述是否与 src/main/db/ 实际代码一致。检查函数签名（是否接受 db 参数）、返回类型（snake_case）。' },
  { name: '渲染进程', prompt: '验证文档中 renderer/ 的目录结构、features 列表、queries 表是否与 src/renderer/ 实际代码一致。' },
  { name: '共享层', prompt: '验证文档中 shared/ 的描述是否与 src/shared/ 实际文件一致。检查 types.ts 和 sse-utils.ts 的存在和内容。' },
  { name: '设计模式', prompt: '验证文档中描述的设计模式（工厂注入、queryKey 格式、错误处理、IPC 命名）是否与实际代码实现一致。' },
  { name: '配置与平台', prompt: '验证文档中的配置表（数据目录、端口、构建工具版本）是否与 package.json 和实际配置一致。' },
]

const CODE_DISCOVERY = [
  { name: 'main 结构', prompt: '扫描 src/main/ 目录结构，列出所有文件和目录。重点关注最近新增或变更的文件（如 ipc/ipc-utils.ts, shared/sse-utils.ts）。' },
  { name: 'renderer 结构', prompt: '扫描 src/renderer/ 目录结构，列出所有文件和目录。重点关注 features/ 和 components/shared/ 的内容。' },
  { name: 'shared 结构', prompt: '扫描 src/shared/ 目录，列出所有文件和导出。' },
  { name: '关键接口', prompt: '读取 src/main/proxy/server.ts 的 ProxyServices 接口、src/preload/types.ts 的 API 接口、src/main/ipc/ipc-utils.ts 的 wrapIpcHandler。' },
]

phase('Phase 1: Doc→Code')

const docResults = await pipeline(
  DOC_SECTIONS,
  section => agent(
    `你是代码审计员。读取 ${DOC_PATH} 中关于"${section.name}"的描述，然后检查实际代码是否匹配。\n\n任务：${section.prompt}\n\n输出格式：\n- 匹配项：列出文档描述正确的部分（简要）\n- 不匹配项：列出文档与代码不一致的地方（详细，包含文件路径和实际内容）\n- 遗漏项：代码中存在但文档未提及的内容`,
    { label: `doc→code:${section.name}`, phase: 'Phase 1: Doc→Code', model: HAIKU }
  )
)

phase('Phase 2: Code→Doc')

const codeResults = await pipeline(
  CODE_DISCOVERY,
  item => agent(
    `你是代码考古学家。扫描实际代码，找出文档中可能遗漏或过时的内容。\n\n任务：${item.prompt}\n\n输出格式：\n- 新发现：文档中未提及但代码中存在的文件/接口/模式\n- 变更点：代码中与文档描述不一致的地方\n- 建议：文档需要更新的具体内容`,
    { label: `code→doc:${item.name}`, phase: 'Phase 2: Code→Doc', model: HAIKU }
  )
)

phase('Phase 3: Cross-Validate')

const crossValidation = await agent(
  `你是文档架构师。根据以下两组审计结果，生成 ARCHITECTURE.md 的完整更新计划。\n\n## Phase 1 结果（文档→代码验证）：\n${docResults.map((r, i) => `### ${DOC_SECTIONS[i].name}\n${r}`).join('\n\n')}\n\n## Phase 2 结果（代码→文档发现）：\n${codeResults.map((r, i) => `### ${CODE_DISCOVERY[i].name}\n${r}`).join('\n\n')}\n\n请输出：\n1. 需要更新的章节列表（按优先级排序）\n2. 每个章节的具体修改内容（新内容 vs 旧内容）\n3. 需要新增的章节\n4. 需要删除的过时内容\n\n注意：只输出变更计划，不要输出完整文档。`,
  { label: 'cross-validate', phase: 'Phase 3: Cross-Validate', model: HAIKU }
)

return { docResults, codeResults, crossValidation }
