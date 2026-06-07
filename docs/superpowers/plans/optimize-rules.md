export const meta = {
  name: 'optimize-rules',
  description: '并行优化所有前后端规则文件，消除歧义、合并重叠、统一格式',
  phases: [
    { title: '修复后端规则', detail: '7 个后端规则文件并行优化' },
    { title: '修复前端规则', detail: '6 个前端规则文件并行优化' },
    { title: '修复通用规则', detail: '2 个通用规则文件并行优化' },
    { title: '一致性校验', detail: '跨文件交叉检查，确保无矛盾' },
  ],
}

const BACKEND_FILES = [
  {
    path: '.claude/rules/backend/30-layered-architecture.md',
    issues: [
      '"业务层：禁止直接操作数据库连接" → 改为导入路径约束',
      '"接口层直接操作数据库（绕过业务层）" → 改为导入路径约束',
      '"业务层直接操作 Request/Response 对象" → 明确为 domains/ 禁止引用 Hono 对象',
      '每层职责边界中"禁止直接操作数据库连接" → 引用工厂注入模式',
    ],
  },
  {
    path: '.claude/rules/backend/31-domain-modeling.md',
    issues: [
      '已有工厂注入模式，确认与其他文件无矛盾',
    ],
  },
  {
    path: '.claude/rules/backend/32-interface-contracts.md',
    issues: [
      '"代理路由中直接操作数据库" → 改为导入路径约束',
      'handler 规范中"错误通过 throw 传播" → 与 34-error-handling 对齐',
    ],
  },
  {
    path: '.claude/rules/backend/33-data-access.md',
    issues: [
      '"业务层直接编写 SQL 语句" → 改为导入路径约束',
      '"日志文件使用 SQLite 表存储" 禁止项措辞像决策 → 改为纯规则',
      '连接管理章节与 30-layered-architecture 重叠 → 精简为数据层视角',
    ],
  },
  {
    path: '.claude/rules/backend/34-error-handling.md',
    issues: [
      '定义了 ValidationError/BusinessError/SystemError 三种类型但代码未实现 → 改为基于消息格式的务实规则',
      '"错误从底层向顶层传播" → 保留，但去掉未实现的类名',
    ],
  },
  {
    path: '.claude/rules/backend/35-security.md',
    issues: [
      '输入校验与 32-interface-contracts 重复 → 保留安全视角，去掉重复的 Zod .parse() 描述',
    ],
  },
  {
    path: '.claude/rules/backend/36-observability.md',
    issues: [
      '无重大问题，确认格式统一',
    ],
  },
  {
    path: '.claude/rules/backend/37-testing.md',
    issues: [
      '无重大问题，已更新测试框架章节',
    ],
  },
]

const FRONTEND_FILES = [
  {
    path: '.claude/rules/frontend/31-renderer.md',
    issues: [
      '与 35-frontend-directory.md 职责重叠 → 31 聚焦数据流，35 聚焦目录结构和导入规则',
    ],
  },
  {
    path: '.claude/rules/frontend/32-component-reuse.md',
    issues: [
      '"禁止使用原生 HTML 表单元素" 未列全（缺少 <form>） → 补全或改为"禁止使用原生 HTML 元素替代 components/ui/ 中已有的组件"',
    ],
  },
  {
    path: '.claude/rules/frontend/35-frontend-directory.md',
    issues: [
      '与 31-renderer.md 重叠 → 精简为目录树 + 导入规则 + 模块边界',
      '缺少 frontmatter description',
    ],
  },
  {
    path: '.claude/rules/frontend/36-frontend-testing.md',
    issues: [
      '无重大问题',
    ],
  },
  {
    path: '.claude/rules/frontend/37-visual-style.md',
    issues: [
      '无重大问题',
    ],
  },
  {
    path: '.claude/rules/frontend/38-animation.md',
    issues: [
      '无重大问题',
    ],
  },
]

const COMMON_FILES = [
  {
    path: '.claude/rules/common/00-global.md',
    issues: [
      '无重大问题',
    ],
  },
  {
    path: '.claude/rules/common/05-engineering.md',
    issues: [
      '"异步操作必须有 try-catch" 过于绝对 → 改为"异步操作必须有明确的错误处理策略"',
    ],
  },
]

phase('修复后端规则')
const backendResults = await pipeline(
  BACKEND_FILES,
  f => agent(
    `优化后端规则文件。

文件路径: ${f.path}

需要修复的问题:
${f.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

优化原则:
- 所有"直接操作/编写"改为导入路径约束（编译器可检查）
- 去掉未实现的抽象概念（如 ValidationError 类），改为务实的可执行规则
- 消除与其他规则文件的重复，保留本文件视角独有的规则
- 确保每条规则都是可执行的（能通过代码审查或编译器检查验证）
- 保持 markdown 格式一致

读取文件，修改后写回。如果文件无重大问题，只做格式微调。`,
    { label: `backend:${f.path.split('/').pop()}`, phase: '修复后端规则', model: 'haiku' }
  )
)

phase('修复前端规则')
const frontendResults = await pipeline(
  FRONTEND_FILES,
  f => agent(
    `优化前端规则文件。

文件路径: ${f.path}

需要修复的问题:
${f.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

优化原则:
- 消除与 35-frontend-directory.md 或 31-renderer.md 的重叠
- 每个文件聚焦一个维度：31=数据流，35=目录和导入，32=组件复用
- 确保每条规则都是可执行的
- 保持 markdown 格式一致
- 所有规则文件必须有 frontmatter（description + 加载方式）

读取文件，修改后写回。如果文件无重大问题，只做格式微调。`,
    { label: `frontend:${f.path.split('/').pop()}`, phase: '修复前端规则', model: 'haiku' }
  )
)

phase('修复通用规则')
const commonResults = await pipeline(
  COMMON_FILES,
  f => agent(
    `优化通用规则文件。

文件路径: ${f.path}

需要修复的问题:
${f.issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

优化原则:
- 确保每条规则都是可执行的
- 保持 markdown 格式一致

读取文件，修改后写回。如果文件无重大问题，只做格式微调。`,
    { label: `common:${f.path.split('/').pop()}`, phase: '修复通用规则', model: 'haiku' }
  )
)

phase('一致性校验')
const verification = await agent(
  `一致性校验：检查所有规则文件之间的矛盾和遗漏。

读取以下所有文件:
- .claude/rules/common/00-global.md
- .claude/rules/common/05-engineering.md
- .claude/rules/backend/30-layered-architecture.md
- .claude/rules/backend/31-domain-modeling.md
- .claude/rules/backend/32-interface-contracts.md
- .claude/rules/backend/33-data-access.md
- .claude/rules/backend/34-error-handling.md
- .claude/rules/backend/35-security.md
- .claude/rules/backend/36-observability.md
- .claude/rules/backend/37-testing.md
- .claude/rules/frontend/31-renderer.md
- .claude/rules/frontend/32-component-reuse.md
- .claude/rules/frontend/35-frontend-directory.md
- .claude/rules/frontend/36-frontend-testing.md
- .claude/rules/frontend/37-visual-style.md
- .claude/rules/frontend/38-animation.md

检查:
1. 是否有矛盾的规则（A 文件允许，B 文件禁止）
2. 是否有遗漏的约束（应该禁止但没写的）
3. 导入路径约束是否前后一致
4. 术语是否统一（如"业务层"vs"domain service"）
5. 格式是否统一（frontmatter、标题层级、禁止条目格式）

输出一份校验报告，列出发现的问题。如果没有问题，输出"校验通过，无矛盾"。`,
  { label: '一致性校验', phase: '一致性校验', model: 'sonnet' }
)

return { backendResults, frontendResults, commonResults, verification }
