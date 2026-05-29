# Markdown 统一渲染系统设计文档

**创建日期**：2026-05-29
**状态**：已批准
**作者**：Claude + 用户协作

## 1. 问题背景

### 当前状态
- **UpdateDialog.tsx**：使用 `react-markdown` + `remark-gfm` 渲染更新内容
- **ChatMessage.tsx**：**没有使用任何 Markdown 渲染**，只是简单的 `<p>` 标签
- **技术栈不统一**：更新对话框有 Markdown 渲染（但配置不完整），Chat 消息无 Markdown 渲染

### 问题描述
1. **更新内容渲染问题**：
   - releaseNotes 来自 electron-updater，是 Markdown 格式（来自 GitHub）
   - ReactMarkdown 默认不渲染原始 HTML（安全考虑）
   - 用户看到 `<ul><li>...</li></ul>` 原始标签

2. **Chat 页面需求**：
   - 用户需要完整 Markdown 支持（代码块、列表、表格等）
   - 当前无任何 Markdown 渲染能力

3. **技术栈不一致**：
   - 项目中存在多套渲染方案，维护成本高

## 2. 设计目标

### 核心目标
1. ✅ 统一技术栈（react-markdown）
2. ✅ 支持完整 Markdown 渲染
3. ✅ 支持 HTML 内容（解决更新内容问题）
4. ✅ 支持代码高亮（rehype-highlight）
5. ✅ 支持 Mermaid 图表
6. ✅ 性能优化（动态加载）
7. ✅ 代码复用（统一组件）

### 非目标
- 不支持实时协作编辑
- 不支持自定义主题（固定深色模式）
- 不支持 Markdown 扩展语法（如 LaTeX 数学公式）

## 3. 技术方案

### 3.1 依赖选择

#### 核心依赖
```json
{
  "react-markdown": "^10.1.0",      // Markdown 渲染
  "remark-gfm": "^4.0.1",          // GitHub Flavored Markdown
  "rehype-raw": "^7.0.0",          // HTML 支持
  "rehype-highlight": "^7.0.0",    // 代码高亮
  "mermaid": "^11.0.0"             // 图表渲染
}
```

#### 选择理由
- **react-markdown**：React 生态最流行的 Markdown 渲染器
- **remark-gfm**：支持表格、任务列表、删除线等 GitHub 风格语法
- **rehype-raw**：支持 HTML 标签渲染（解决更新内容问题）
- **rehype-highlight**：轻量级代码高亮（基于 highlight.js）
- **mermaid**：支持流程图、序列图、甘蔗图等

### 3.2 架构设计

```
src/renderer/components/ui/markdown.tsx
├── 核心组件：Markdown
├── 代码高亮：rehype-highlight（动态加载）
├── 图表渲染：Mermaid（动态加载）
└── 样式适配：Tailwind Typography
```

### 3.3 组件设计

#### Markdown 组件接口
```tsx
interface MarkdownProps {
  children: string           // Markdown 内容
  className?: string        // 自定义样式类
  enableMermaid?: boolean   // 是否启用 Mermaid（默认 false）
}
```

#### 实现细节

**1. 动态加载策略**
```tsx
// 代码高亮：按需加载
const rehypeHighlight = lazy(() => import('rehype-highlight'))

// Mermaid：按需加载
const Mermaid = lazy(() => import('./Mermaid'))
```

**2. 自定义组件渲染**
```tsx
components={{
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '')
    
    // Mermaid 图表渲染
    if (match?.[1] === 'mermaid' && enableMermaid) {
      return <Mermaid content={String(children)} />
    }
    
    // 普通代码块
    return <code className={className} {...props}>{children}</code>
  }
}}
```

**3. 错误处理**
- Markdown 解析失败：显示原始文本
- Mermaid 渲染失败：显示代码块
- 代码高亮失败：降级为普通代码块

### 3.4 样式设计

#### Tailwind Typography 配置
```css
/* 使用 @apply 指令 */
.prose {
  @apply text-foreground;
}

.prose code {
  @apply bg-muted px-1 py-0.5 rounded;
}

.prose pre {
  @apply bg-muted border rounded-lg;
}

.prose table {
  @apply border-collapse;
}

.prose th, .prose td {
  @apply border px-3 py-2;
}
```

#### 深色模式适配
- 代码块：深色背景 `hsl(220, 14%, 9%)`
- 内联代码：浅色背景 `hsl(220, 12%, 13%)`
- 链接：主色调 `hsl(220, 10%, 20%)`

### 3.5 性能优化

#### 动态加载
```tsx
// 使用 React.lazy 实现代码分割
const rehypeHighlight = lazy(() => import('rehype-highlight'))
const Mermaid = lazy(() => import('./Mermaid'))

// 使用 Suspense 包裹
<Suspense fallback={<Loading />}>
  <ReactMarkdown ... />
</Suspense>
```

#### 缓存策略
- Mermaid 图表渲染结果缓存（使用 useMemo）
- 代码高亮结果缓存（rehype-highlight 内置）

## 4. 使用场景

### 4.1 UpdateDialog.tsx

**修改前**：
```tsx
<div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>{releaseNotes}</ReactMarkdown>
</div>
```

**修改后**：
```tsx
<Markdown>{releaseNotes}</Markdown>
```

### 4.2 ChatMessage.tsx

**修改前**：
```tsx
<p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
  {content}
</p>
```

**修改后**：
```tsx
<Markdown enableMermaid>{content}</Markdown>
```

## 5. 依赖管理

### 5.1 新增依赖
```bash
npm install rehype-raw rehype-highlight remark-gfm mermaid
```

### 5.2 版本锁定
```json
{
  "dependencies": {
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "rehype-raw": "^7.0.0",
    "rehype-highlight": "^7.0.0",
    "mermaid": "^11.0.0"
  }
}
```

## 6. 测试策略

### 6.1 单元测试
- Markdown 组件渲染测试
- 代码高亮测试
- Mermaid 图表测试
- 错误处理测试

### 6.2 集成测试
- UpdateDialog 更新内容渲染
- ChatMessage 消息渲染
- 动态加载测试

### 6.3 性能测试
- 首次渲染时间
- 动态加载时间
- 内存占用

## 7. 风险评估

### 7.1 技术风险
- **风险**：rehype-highlight 与现有 Tailwind 样式冲突
- **缓解**：使用 `@apply` 指令覆盖默认样式

### 7.2 性能风险
- **风险**：Mermaid 动态加载时间较长
- **缓解**：使用 `Suspense` 显示加载状态

### 7.3 兼容性风险
- **风险**：react-markdown 版本更新导致 API 变化
- **缓解**：锁定版本号，定期更新

## 8. 实施计划

### 阶段 1：基础实现
1. 创建 Markdown 组件
2. 配置 Tailwind Typography
3. 集成到 UpdateDialog

### 阶段 2：功能扩展
1. 添加代码高亮支持
2. 添加 Mermaid 支持
3. 集成到 ChatMessage

### 阶段 3：优化完善
1. 性能优化
2. 错误处理
3. 测试覆盖

## 9. 验收标准

### 功能验收
- ✅ 更新内容正确渲染（支持 HTML 和 Markdown）
- ✅ Chat 消息支持完整 Markdown 语法
- ✅ 代码块语法高亮
- ✅ Mermaid 图表正确渲染

### 性能验收
- ✅ 首次渲染时间 < 100ms
- ✅ 动态加载时间 < 500ms
- ✅ 内存占用无显著增长

### 代码质量验收
- ✅ 单元测试覆盖率 > 80%
- ✅ ESLint 检查通过
- ✅ TypeScript 类型检查通过

## 10. 后续扩展

### 可能的功能
- 支持 LaTeX 数学公式（KaTeX）
- 支持自定义主题
- 支持 Markdown 扩展语法

### 技术债务
- 考虑迁移到 Shiki（更高质量的代码高亮）
- 优化 Mermaid 渲染性能
- 支持更多图表类型

---

**文档版本**：v1.0
**最后更新**：2026-05-29
**批准人**：用户
