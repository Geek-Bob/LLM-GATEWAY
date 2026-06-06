export const meta = {
  name: 'code-refactor-replace',
  description: '用共享组件/Hooks/工具函数替换页面中的重复代码',
  phases: [
    { title: '组件替换', detail: '替换 StatusBadge、EmptyState、PageHeader、TableSkeleton' },
    { title: 'Hook 替换', detail: '替换 useDeleteWithToast、useClipboard、useSavingAction' },
    { title: '动画替换', detail: '替换 pageVariants、childVariants、rowFadeIn' },
    { title: '清理', detail: '删除未使用导出' },
    { title: '验证', detail: '类型检查 + 测试' },
  ],
}

// Phase 1: 组件替换
phase('组件替换')

await agent(
  `替换 E:\\code\\llm-gateway\\src\\renderer 中的重复组件模式。

## 任务 1: 替换 StatusBadge（3 个文件）

文件:
- src/renderer/pages/ApiKeys.tsx (约 L242-260)
- src/renderer/pages/Providers.tsx (约 L227-244)
- src/renderer/pages/ModelMappings.tsx (约 L229-246)

共享组件已创建: src/renderer/components/ui/status-badge.tsx
导出: StatusBadge({ active, activeText?, inactiveText?, className? })

替换模式:
\`\`\`tsx
// 原来的:
<Badge variant="outline" className={cn('gap-1.5', key.is_active === 1 ? 'border-green-500/30 text-green-500' : 'border-muted-foreground/30 text-muted-foreground')}>
  <span className={cn('inline-block h-1.5 w-1.5 rounded-full', key.is_active === 1 ? 'bg-green-500' : 'bg-muted-foreground')} />
  {key.is_active === 1 ? '启用' : '禁用'}
</Badge>

// 替换为:
<StatusBadge active={key.is_active === 1} />
\`\`\`

注意:
- 添加 import { StatusBadge } from '@/components/ui/status-badge'
- 如果原来的 active 判断字段不同（如 provider.is_active），调整 active prop
- 删除不再需要的 Badge 导入（如果该文件只在 StatusBadge 中使用 Badge）

## 任务 2: 替换 EmptyState（8 个位置）

共享组件已创建: src/renderer/components/ui/empty-state.tsx
导出: EmptyState({ icon?, title, description?, className? })

文件和位置:
- src/renderer/pages/ApiKeys.tsx (约 L151-160) — "暂无 API Key"
- src/renderer/pages/Providers.tsx (约 L192-197) — "暂无供应商"
- src/renderer/pages/ModelMappings.tsx (约 L196-201) — "暂无映射"
- src/renderer/pages/Logs.tsx (约 L118-126) — "暂无日志"
- src/renderer/pages/Agents.tsx (约 L179, L201) — "暂无配置"
- src/renderer/components/ConversationSidebar.tsx (约 L98-101) — "暂无会话"
- src/renderer/pages/Dashboard.tsx (约 L189-191, L245-247) — "暂无统计数据"

替换模式:
\`\`\`tsx
// 原来的:
<div className="rounded-xl border border-border bg-card p-12 text-center">
  <div className="text-3xl mb-3 opacity-40">&#127970;</div>
  <p className="text-base font-medium mb-1 text-muted-foreground">暂无供应商</p>
  <p className="text-sm text-muted-foreground/60">点击上方「添加供应商」开始配置</p>
</div>

// 替换为:
<EmptyState icon="&#127970;" title="暂无供应商" description="点击上方「添加供应商」开始配置" />
\`\`\`

注意:
- 添加 import { EmptyState } from '@/components/ui/empty-state'
- icon 可以是 emoji 字符串或 lucide 图标 JSX
- 有些 EmptyState 没有 description，只传 title 即可

## 任务 3: 替换 PageHeader（4 个文件）

共享组件已创建: src/renderer/components/ui/page-header.tsx
导出: PageHeader({ title, description?, action?, className? })

文件:
- src/renderer/pages/ApiKeys.tsx (约 L116-129)
- src/renderer/pages/Providers.tsx (约 L155-168)
- src/renderer/pages/ModelMappings.tsx (约 L159-172)
- src/renderer/pages/Logs.tsx (约 L102-115)

替换模式:
\`\`\`tsx
// 原来的:
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">API Key 管理</h1>
    <p className="text-sm mt-1 text-muted-foreground">管理网关访问密钥</p>
  </div>
  <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />创建 API Key</Button>
</div>

// 替换为:
<PageHeader title="API Key 管理" description="管理网关访问密钥" action={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" />创建 API Key</Button>} />
\`\`\`

注意:
- 添加 import { PageHeader } from '@/components/ui/page-header'
- action prop 接收 JSX，保持原有按钮逻辑不变

## 任务 4: 替换 TableSkeleton（5 个文件）

共享组件已创建: src/renderer/components/ui/table-skeleton.tsx
导出: TableSkeleton({ rows?, className? })

文件:
- src/renderer/pages/ApiKeys.tsx (约 L132-139)
- src/renderer/pages/Providers.tsx (约 L185-191)
- src/renderer/pages/ModelMappings.tsx (约 L188-195)
- src/renderer/pages/Logs.tsx (约 L117-122)
- src/renderer/pages/Settings.tsx (约 L53-60)

替换模式:
\`\`\`tsx
// 原来的:
<div className="rounded-xl border border-border bg-card p-8">
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-12 w-full" />))}
  </div>
</div>

// 替换为:
<TableSkeleton rows={3} />
\`\`\`

注意:
- 添加 import { TableSkeleton } from '@/components/ui/table-skeleton'
- 删除不再需要的 Skeleton 导入（如果该文件只在骨架屏中使用 Skeleton）

每个文件修改后，运行 npx tsc --noEmit --pretty 验证类型正确。`,
  { label: 'replace-components', phase: '组件替换' }
)

// Phase 2: Hook 替换
phase('Hook 替换')

await agent(
  `替换 E:\\code\\llm-gateway\\src\\renderer 中的重复 Hook 模式。

## 任务 1: 替换 useDeleteWithToast（4 个文件）

Hook 已创建: src/renderer/hooks/useDeleteWithToast.ts
导出: useDeleteWithToast(deleteMutation, entityName) → { execute(id, displayName) }

文件:
- src/renderer/pages/ApiKeys.tsx — handleDelete 函数
- src/renderer/pages/Providers.tsx — handleDelete 函数
- src/renderer/pages/ModelMappings.tsx — handleDelete 函数
- src/renderer/pages/Agents.tsx — handleDelete 函数

替换模式:
\`\`\`tsx
// 原来的:
const handleDelete = async (key: ApiKey) => {
  try {
    await deleteMutation.mutateAsync(key.id)
    toast.success(\`API Key「\${key.name}」已删除\`)
  } catch (e) {
    toast.error(\`删除失败: \${getErrorMessage(e)}\`)
  }
}

// 替换为:
const { execute: handleDelete } = useDeleteWithToast(deleteMutation, 'API Key')
// 调用方式: handleDelete(key.id, key.name)
\`\`\`

注意:
- 添加 import { useDeleteWithToast } from '@/hooks/useDeleteWithToast'
- 调用处需要适配: handleDelete(item.id, item.name) 或 handleDelete(item.id, item.displayName)
- 如果该文件的 getErrorMessage 只在 handleDelete 中使用，可以删除 getErrorMessage 导入

## 任务 2: 替换 useClipboard（3 个文件）

Hook 已创建: src/renderer/hooks/useClipboard.ts
导出: useClipboard() → { copied, copy(text) }

文件:
- src/renderer/pages/ApiKeys.tsx — handleCopyCreatedKey 函数 (约 L90-96)
- src/renderer/pages/Dashboard.tsx — copyToClipboard 函数 (约 L53-59)
- src/renderer/components/StatusBar.tsx — handleCopyUrl 函数 (约 L21-28)

替换模式:
\`\`\`tsx
// 原来的:
const [copied, setCopied] = useState(false)
const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  } catch { /* clipboard write failed */ }
}

// 替换为:
const { copied, copy } = useClipboard()
const handleCopy = () => copy(text)
\`\`\`

注意:
- 添加 import { useClipboard } from '@/hooks/useClipboard'
- 删除对应的 useState(false) 声明
- 删除 setTimeout 相关代码

## 任务 3: 替换 useSavingAction（3 个文件）

Hook 已创建: src/renderer/hooks/useSavingAction.ts
导出: useSavingAction() → { saving, execute(fn, errorPrefix?) }

文件:
- src/renderer/pages/ApiKeys.tsx — handleCreate 函数 (约 L71-88)
- src/renderer/pages/Providers.tsx — handleSave 函数 (约 L111-150)
- src/renderer/pages/ModelMappings.tsx — handleSave 函数 (约 L133-161)

替换模式:
\`\`\`tsx
// 原来的:
const [saving, setSaving] = useState(false)
const handleSave = async () => {
  setSaving(true)
  try {
    await someMutation.mutateAsync(data)
    toast.success('保存成功')
  } catch (e) {
    toast.error(\`保存失败: \${getErrorMessage(e)}\`)
  } finally {
    setSaving(false)
  }
}

// 替换为:
const { saving, execute } = useSavingAction()
const handleSave = () => execute(async () => {
  await someMutation.mutateAsync(data)
  toast.success('保存成功')
}, '保存失败')
\`\`\`

注意:
- 添加 import { useSavingAction } from '@/hooks/useSavingAction'
- 删除对应的 const [saving, setSaving] = useState(false)
- 如果该文件的 getErrorMessage 只在 handleSave 中使用，可以删除 getErrorMessage 导入

每个文件修改后，运行 npx tsc --noEmit --pretty 验证类型正确。`,
  { label: 'replace-hooks', phase: 'Hook 替换' }
)

// Phase 3: 动画替换
phase('动画替换')

await agent(
  `替换 E:\\code\\llm-gateway\\src\\renderer 中的重复动画模式。

## 任务 1: 替换 pageVariants/childVariants（3 个文件）

动画常量已创建: src/renderer/lib/animations.ts
导出: pageVariants, childVariants, rowFadeIn(idx)

文件:
- src/renderer/pages/Agents.tsx (约 L54-62)
- src/renderer/pages/Dashboard.tsx (约 L28-36)
- src/renderer/pages/Settings.tsx (约 L23-31)

替换模式:
\`\`\`tsx
// 原来的:
const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const
const childVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
} as const

// 替换为:
import { pageVariants, childVariants } from '@/lib/animations'
\`\`\`

注意:
- 删除文件中的 pageVariants 和 childVariants 定义
- 添加 import { pageVariants, childVariants } from '@/lib/animations'

## 任务 2: 替换 rowFadeIn（3 个文件）

文件:
- src/renderer/pages/ApiKeys.tsx (约 L176-181)
- src/renderer/pages/Providers.tsx (约 L212-218)
- src/renderer/pages/ModelMappings.tsx (约 L215-221)

替换模式:
\`\`\`tsx
// 原来的:
<motion.tr
  key={item.id}
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, delay: idx * 0.03 }}
>

// 替换为:
<motion.tr key={item.id} {...rowFadeIn(idx)}>
\`\`\`

注意:
- 添加 import { rowFadeIn } from '@/lib/animations'
- 如果文件还没有 pageVariants 导入，一起加上

每个文件修改后，运行 npx tsc --noEmit --pretty 验证类型正确。`,
  { label: 'replace-animations', phase: '动画替换' }
)

// Phase 4: 清理
phase('清理')

await agent(
  `清理 E:\\code\\llm-gateway\\src 中的未使用代码。

## 任务 1: 删除 setApiBaseUrl

文件: src/renderer/shared/lib/api-client.ts
操作: 删除 setApiBaseUrl 函数定义（约 L21-23）

## 任务 2: 删除 buildProxyBody

文件: src/main/proxy/forwarder.ts
操作: 删除 buildProxyBody 函数定义（约 L80）

文件: src/main/proxy/__tests__/forwarder.test.ts
操作: 删除对应的 describe('buildProxyBody') 测试块

## 任务 3: 删除未使用类型导出

以下类型导出后从未被外部文件导入，改为非导出的内部类型或直接删除：

1. src/main/domains/provider/provider.types.ts — ProviderRow（改为非导出）
2. src/shared/types.ts — ConversationMessageEntity（改为非导出）
3. src/renderer/lib/types.ts — ConversationMessage（改为非导出）
4. src/main/proxy/router.ts — ModelRoute（改为非导出）
5. src/main/proxy/rate-limiter.ts — RateLimitResult（改为非导出）
6. src/main/ipc/sse-parser.ts — SSELine（改为非导出）
7. src/main/db/providers.ts — ProviderUpdate（改为非导出）
8. src/main/db/api-keys.ts — ApiKeyResult（改为非导出）

注意:
- 改为非导出 = 删除 export 关键字，保留 interface/type 定义
- 不要删除类型定义本身，只是不再导出
- 每个文件修改后，运行 npx tsc --noEmit --pretty 验证

## 任务 4: 移除 TableRow 冗余样式

文件:
- src/renderer/pages/ApiKeys.tsx
- src/renderer/pages/Providers.tsx
- src/renderer/pages/ModelMappings.tsx

操作: 检查 ui/table.tsx 的 TableRow 组件是否已包含 hover:bg-muted/50 和 border-b 样式。如已包含，直接删除页面中 TableRow 上的重复 className。

每个文件修改后，运行 npx tsc --noEmit --pretty 验证类型正确。`,
  { label: 'cleanup', phase: '清理' }
)

// Phase 5: 验证
phase('验证')

await agent(
  `验证 E:\\code\\llm-gateway 的所有修改。

1. 运行 npx tsc --noEmit --pretty — 确认类型检查通过
2. 运行 npm test — 确认所有测试通过
3. 运行 npm run lint — 确认 ESLint 检查通过
4. 检查是否有遗漏的替换：
   - grep -r "from '../" src/renderer --include="*.tsx" --include="*.ts" | grep -v __tests__ | grep -v node_modules
   - grep -r "e instanceof Error" src/renderer --include="*.tsx" | grep -v __tests__
   - grep -r "<button" src/renderer --include="*.tsx" | grep -v __tests__ | grep -v ui/

如果发现任何问题，修复后再次验证。

最终输出验证结果摘要。`,
  { label: 'verify', phase: '验证' }
)

log('## 代码重构完成')
log('所有 P0 和 P1 修复已完成，P2 清理已完成。')
