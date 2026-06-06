export const meta = {
  name: 'standards-audit',
  description: '审查项目规范，敲定标准，建立软件工程与架构思维',
  phases: [
    { title: '审查', detail: '扫描项目，识别已建立的模式和不一致之处' },
    { title: '敲定', detail: '建立完整的规范文档' },
    { title: '验证', detail: '确保规范覆盖所有场景' },
  ],
}

// Phase 1: 审查项目
phase('审查')

const audit = await parallel([
  agent(
    `审查 E:\\code\\llm-gateway\\src\\renderer 的前端规范。

扫描所有 .tsx 和 .ts 文件，识别已建立的模式：

1. **组件模式**
   - 页面组件结构（pages/*.tsx 的共同模式）
   - 功能模块结构（features/*/ 的共同模式）
   - 共享组件结构（components/ui/ 的共同模式）
   - Hooks 结构（hooks/ 的共同模式）

2. **数据流模式**
   - TanStack Query 使用模式（queryKey 命名、mutation 处理）
   - IPC 调用模式（preload → ipcMain 的链路）
   - 状态管理模式（useState、useEffect 的使用）

3. **样式模式**
   - Tailwind 类名组织方式
   - 主题变量使用（bg-background、text-foreground 等）
   - 响应式设计模式

4. **错误处理模式**
   - try-catch 结构
   - toast 消息格式
   - 错误边界处理

5. **动画模式**
   - framer-motion 使用方式
   - 入场/退出动画

输出 JSON 格式：
{
  "patterns": {
    "componentStructure": { "description": "", "example": "" },
    "dataFlow": { "description": "", "example": "" },
    "styling": { "description": "", "example": "" },
    "errorHandling": { "description": "", "example": "" },
    "animation": { "description": "", "example": "" }
  },
  "inconsistencies": [
    { "file": "", "issue": "", "suggestion": "" }
  ]
}`,
    { label: 'audit:frontend', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway\\src\\main 的后端规范。

扫描所有 .ts 文件，识别已建立的模式：

1. **Domain Pattern**
   - service.ts 结构（createXxxService 模式）
   - schema.ts 结构（Zod 验证模式）
   - types.ts 结构（类型定义模式）

2. **IPC Handler 模式**
   - handler 注册方式
   - 参数验证方式
   - 返回值处理

3. **数据库模式**
   - CRUD 操作模式
   - 事务处理
   - 错误处理

4. **Proxy 模式**
   - 路由解析
   - 请求转发
   - 响应转换
   - SSE 流处理

5. **日志模式**
   - logger 使用方式
   - 日志级别
   - 调试信息记录

输出 JSON 格式：
{
  "patterns": {
    "domainPattern": { "description": "", "example": "" },
    "ipcHandler": { "description": "", "example": "" },
    "database": { "description": "", "example": "" },
    "proxy": { "description": "", "example": "" },
    "logging": { "description": "", "example": "" }
  },
  "inconsistencies": [
    { "file": "", "issue": "", "suggestion": "" }
  ]
}`,
    { label: 'audit:backend', phase: '审查' }
  ),
  agent(
    `审查 E:\\code\\llm-gateway 的规则完整性。

读取所有 .claude/rules/ 目录下的文件，检查：

1. **覆盖度**
   - 是否覆盖了所有开发场景？
   - 是否有遗漏的规范？

2. **一致性**
   - 规则之间是否有矛盾？
   - 命名约定是否统一？

3. **可操作性**
   - 规则是否足够具体？
   - 是否有明确的正反示例？

4. **缺失规范**
   - API 设计规范
   - 性能优化规范
   - 可访问性规范
   - 国际化规范
   - 版本控制规范
   - 文档规范

输出 JSON 格式：
{
  "coverage": {
    "wellCovered": [],
    "partiallyCovered": [],
    "notCovered": []
  },
  "conflicts": [],
  "missingStandards": [],
  "recommendations": []
}`,
    { label: 'audit:rules', phase: '审查' }
  ),
])

// Phase 2: 敲定规范
phase('敲定')

const standards = await agent(
  `基于以下审查结果，建立完整的项目规范文档。

## 审查结果
${JSON.stringify(audit, null, 2)}

## 要求

创建一份完整的《LLM Gateway 项目规范》，包含：

### 1. 架构规范
- 分层架构（main/preload/renderer/shared）
- 依赖方向（单向依赖原则）
- 模块边界（编译隔离、类型共享）

### 2. 前端规范
- 组件规范（页面组件、功能组件、共享组件、Hooks）
- 数据流规范（TanStack Query、IPC 调用）
- 样式规范（Tailwind、主题变量、响应式）
- 状态管理规范
- 错误处理规范
- 动画规范

### 3. 后端规范
- Domain Pattern 规范（service/schema/types）
- IPC Handler 规范
- 数据库操作规范
- Proxy 规范
- 日志规范

### 4. 通用规范
- 命名规范
- 注释规范
- 错误处理规范
- 安全规范
- 测试规范

### 5. 开发流程规范
- SDD + TDD 流程
- Code Review 检查清单
- 提交规范

每个规范必须包含：
- 规则描述
- 正确示例
- 错误示例
- 适用场景

输出为 Markdown 格式，可以直接写入文件。`,
  { label: 'define-standards', phase: '敲定' }
)

// Phase 3: 验证规范
phase('验证')

await agent(
  `验证以下规范文档的完整性和一致性。

## 规范文档
${standards}

## 验证项

1. **完整性检查**
   - 是否覆盖了所有开发场景？
   - 是否有遗漏的规范？

2. **一致性检查**
   - 规则之间是否有矛盾？
   - 命名约定是否统一？

3. **可操作性检查**
   - 规则是否足够具体？
   - 是否有明确的正反示例？

4. **与代码一致性检查**
   - 规范是否与现有代码一致？
   - 是否有规范与代码不符的情况？

输出验证报告和建议的修改。`,
  { label: 'validate-standards', phase: '验证' }
)

log('## 规范审查完成')
log('已建立完整的项目规范文档。')
