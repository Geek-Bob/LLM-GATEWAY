# Chat 页面 UI 重设计 实施计划

> **给执行代理的说明：** 必须使用子技能：使用 superpowers:subagent-driven-development 逐任务实现此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 将 Chat 页面从「功能可用但视觉笨重」改造为「冷锐极简 Instrument Panel」：顶栏 chip 流 + 折叠侧栏 + 精修气泡 + 底栏输入，无功能逻辑变更。

**架构：** 纯前端 UI 重构，不改 IPC / service / hook 业务逻辑。新增 cyan accent CSS 变量；ThinkingSettings 从「卡片+三按钮+下拉」改为「chip+Popover+Button 列表」；ChatToolbar 去除 Card 包裹改为 inline flex；侧栏加 56px 折叠态（图标条）；消息气泡圆角 3xl→xl、边框 50% 透明；输入区从 Card 包裹改为底栏内联，发送按钮变 icon 方形。

**技术栈：** Tailwind v4 内置 HSL 变量 + Radix Popover + framer-motion width 动画 + lucide-react 图标。零新依赖、零业务逻辑变更、零 IPC 变更。

**设计文档：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md`

---

## Task 0: 新增 cyan accent 与 chip CSS 变量

**目标：** 在 `index.css` 中覆盖 `--accent` 为 cyan-400 HSL 值，并新增 `--chip` / `--chip-active` / `--accent-foreground` 等视觉 token；通过 `@theme inline` 映射为 Tailwind 可用 utility。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#3-配色精修现有-dark-主题`

**需求描述：**
当前 `index.css` dark 主题下 `--accent: 220 10% 17%`（中性灰），与新调性不符。需在 `.dark` 块（**非** `:root` 块）内将其覆盖为 `188 95% 55%`（cyan-400 等效 HSL），同步新增 `--chip: 220 18% 14%`（chip 背景）、`--chip-active: 188 95% 55%`（active chip 透明度 0.12 基础色）。`--accent-foreground: 210 20% 92%` **保持不变**（cyan 背景上的文字仍用浅色，与 Button 全局默认 `text-accent-foreground` 一致；chip 内 cyan 上的深色文字不使用此变量，直接 inline `text-[hsl(220_25%_8%)]`——避免破坏其他走 `text-accent-foreground` 的浅色场景）。light 主题的 `--accent` **不动**（保持 `220 14% 96%`，与项目 dark-only 策略一致）。`@theme inline` 块新增 `--color-chip` / `--color-chip-active` 的映射（`bg-chip-active` 需 alpha 通道，使用 `hsl(var(--chip-active) / 0.12)`）。本任务**不改任何组件**——只准备视觉 token 供后续任务使用；现有 `text-accent` / `bg-accent` 等使用在切换后会自然从灰色变为 cyan，不破坏其他页面（`text-accent` 当前仅在 Chat 页面使用，全局副作用可控）。

**产出（Produces）：**
- 文件：`src/renderer/index.css`
- 模块：CSS 变量层（无 JS 导出）

**消费（Consumes）：**
- 无（Layer 0 契约任务）

**文件：**
- 修改：`src/renderer/index.css`

**验收标准：**
- [ ] dark 块 `--accent` 值为 `188 95% 55%`（**修改**，非新增）
- [ ] dark 块 `--accent-foreground` 仍为 `210 20% 92%`（**不动**）
- [ ] dark 块新增 `--chip: 220 18% 14%`
- [ ] dark 块新增 `--chip-active: 188 95% 55%`
- [ ] `@theme inline` 块新增 `--color-chip` / `--color-chip-active` 映射（**不新增** `--color-accent-foreground`）
- [ ] light 块（`:root`）CSS 变量结构保持不变（不动）
- [ ] 全局搜索 `text-accent-foreground` 无破坏性影响（Button 默认值与 cyan accent 兼容）
- [ ] `npm run lint` 0 errors
- [ ] `npx tsc -b --noEmit` exit 0

**步骤：**
1. 修改 `index.css` 的 `.dark` 块（`--accent` 改 cyan-400、新增 `--chip` / `--chip-active`）与 `@theme inline` 块（新增 `--color-chip` / `--color-chip-active` 映射）
2. 运行 lint + tsc 验证
3. 提交

---

## Task 1: ThinkingSettings 重构为 chip+Popover 形态

**目标：** ThinkingSettings 从「卡片+三按钮+下拉」改为「两个 chip 按钮 + Popover 内 Button 列表单选」，active 态 cyan 边框 + 半透明背景；保留现有 props 签名与回调行为不变。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#53-thinkingsettings-重构chip-形态`

**需求描述：**
ThinkingSettings 接收 `thinkingType` / `reasoningEffort` / `onThinkingTypeChange` / `onReasoningEffortChange` 四个 props（保持不变）。新形态：两个 `Button` 形态 chip 并排显示，左 chip 显示当前 `thinkingType`（前缀 Brain 图标），右 chip 显示当前 `reasoningEffort`（格式「强度 · medium」）。点击 chip 浮出 Radix Popover（来自 `@/components/ui/popover`），Popover 内用 `flex flex-col gap-1` 布局的 Button 列表（variant="ghost"），每项显示选项文本 + 当前选中态用 `bg-accent/10 text-accent border-l-2 border-accent` 标识。点击选项触发对应 onChange 并关闭 Popover。`thinkingType === 'disabled'` 时右 chip `opacity-50 pointer-events-none`（保留当前值不重置）。**禁止**使用 `@/components/ui/radio-group`（不存在）；用 Button 列表实现单选。本任务组件**不持有任何状态**——所有视觉与回调由 props 驱动（与现状一致）。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/ThinkingSettings.tsx`（覆盖）
- 模块：`ThinkingSettings` 组件

**消费（Consumes）：**
- Task 0：CSS 变量 `--accent` / `--chip` / `--chip-active`
- Task 0：lucide-react Brain / Zap 图标（已有项目依赖）
- 现有：`@/components/ui/popover`（`Popover` / `PopoverTrigger` / `PopoverContent`）
- 现有：`@/components/ui/button`
- 现有：`@/shared/types`（`ThinkingType` / `ReasoningEffort`）

**文件：**
- 修改：`src/renderer/features/chat/components/ThinkingSettings.tsx`
- 修改：`src/renderer/features/chat/components/__tests__/ThinkingSettings.test.tsx`（如果存在；否则新建）

**验收标准：**
- [ ] 组件 props 签名与现状完全一致（4 个 props：`thinkingType` / `reasoningEffort` / `onThinkingTypeChange` / `onReasoningEffortChange`）
- [ ] 渲染两个 chip：左 chip 显示 `thinkingType`（前缀 Brain 图标），右 chip 显示「强度 · {reasoningEffort}」
- [ ] 点击左 chip 浮出 Popover，包含 3 个选项（disabled/enabled/adaptive）
- [ ] 点击右 chip 浮出 Popover，包含 6 个选项（minimal/low/medium/high/xhigh/max）
- [ ] `thinkingType === 'disabled'` 时右 chip `opacity-50 pointer-events-none`
- [ ] 当前选项在 Popover 内有视觉区分（`bg-accent/10 text-accent border-l-2 border-accent` 或类似 active 态）
- [ ] 点击 Popover 选项后 Popover 自动关闭（通过 onOpenChange(false) 控制）
- [ ] 调用 `onThinkingTypeChange` / `onReasoningEffortChange` 回调（验证 fire 一次）
- [ ] 仅持有 Popover open/close 的最小必要 state（`useState<boolean>` 两个，分别对应左右 chip）——**不是**完全无 state
- [ ] **重写**现有 11 个测试（`__tests__/ThinkingSettings.test.tsx`）以适配 chip+Popover 形态：删除 `getByRole('button', { name: 'disabled' })` 等直接 chip 断言，改为「点击 chip → 查找 Popover 内选项 → 点击选项」交互路径
- [ ] `npx vitest run src/renderer/features/chat/components/__tests__/ThinkingSettings.test.tsx` exit 0
- [ ] `npx tsc -b --noEmit` exit 0

**步骤：**
1. 阅读现有 `__tests__/ThinkingSettings.test.tsx` 11 个测试，列出需改写的断言清单
2. 删除或重写不适配新形态的测试断言
3. 为新形态（chip 渲染、Popover 打开/关闭、选项点击）编写失败测试
4. 运行测试，验证失败
5. 重构 ThinkingSettings 为 chip+Popover 实现（含 Popover open 最小 state）
6. 运行测试，验证通过
7. 提交

---

## Task 2: ChatToolbar 去 Card 改 inline flex

**目标：** ChatToolbar 去除外层 Card 包裹改为「顶栏 48px 高 + inline flex 水平 chip 流」，Select 触发器用更紧凑的尺寸与样式。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#52-顶栏工具条48px`

**需求描述：**
ChatToolbar 接收的 props 与现状完全一致（providers / selectedProviderId / onSelectProvider / availableModels / selectedModel / onSelectModel / apiKeys / selectedApiKeyId / onSelectApiKey）。视觉变更：去除 `<Card className="p-3 mb-4 flex items-center gap-3 flex-wrap">` 包裹，改为 `<div className="h-12 flex items-center gap-2 px-3 border-b border-border/50">`，让顶栏自然形成 48px 高的横向工具条（后续 Chat.tsx 集成时背景继承父容器）。三个 Select 触发器尺寸改为更紧凑：`h-8 text-xs`、移除 flex-1 min-w、改为固定 `min-w-[120px]`，与设计文档 5.2 节「供应商 120px / 模型 140px / API Key 120px」对齐。**不改**任何 props 行为（受控 Select，value/onValueChange 维持现状）。**不改**Select Content 内部样式（统一由 `@/components/ui/select` 控制）。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/ChatToolbar.tsx`（覆盖）
- 模块：`ChatToolbar` 组件

**消费（Consumes）：**
- 现有：`@/components/ui/select`
- 现有：`@/lib/types`（`Provider` / `ApiKey`）
- 不消费 Task 0 变量（仅视觉尺寸调整）

**文件：**
- 修改：`src/renderer/features/chat/components/ChatToolbar.tsx`

**验收标准：**
- [ ] 组件 props 签名与现状完全一致
- [ ] 不再 import `@/components/ui/card`
- [ ] 根元素为 `<div className="h-12 flex items-center gap-2 px-3 border-b border-border/50">`
- [ ] 三个 Select 触发器紧凑尺寸（h-8 text-xs min-w-[120px]）
- [ ] 三个 Select 的 onValueChange 行为与现状完全一致
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors

**步骤：**
1. 修改 ChatToolbar JSX 结构（去 Card、加边框底、调整 Select 触发器样式）
2. 运行 tsc + lint
3. 提交

---

## Task 3: ChatInput 改 icon 按钮 + ChatInputArea 改为底栏布局

**目标：** ChatInput 的发送按钮从「文字+图标」改为「icon 方形按钮」；ChatInputArea 去除 Card 包裹改为底栏 64-120px 自适应高度布局；ChatInput 接收新增 `isStreaming` prop 以支持停止态。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#56-输入区底栏-64-120px`

**需求描述：**
**ChatInput 变更**：发送按钮从「`发送` 文字+Send 图标」改为「`ArrowUp 方形按钮` icon-only」，样式 `h-9 w-9 shrink-0 rounded-md bg-accent text-accent-foreground hover:opacity-90 active:scale-95 transition-all`，传 `size="icon"` 复用 ui/button 已有 icon 尺寸档。**流式期间**按钮变停止态：背景转 `bg-destructive text-destructive-foreground` + 显示 `Square` 图标（发送时显示 ArrowUp，停止时显示 Square）。`disabled` 时 `opacity-50 pointer-events-none`。新增 prop `isStreaming: boolean`（默认 false）与 `onStop?: () => void`（仅 isStreaming 期间使用）。Textarea 的 `disabled` 条件**保持现状** `disabled={isStreamLoading || !selectedModel || !selectedApiKeyId}`（在 ChatInput 内部，依赖父级传入的 disabled prop 或 isStreaming 推导）——即：流式时 textarea 仍 disabled，无 model/apiKey 时也 disabled；按钮态由 isStreaming 切换（与 textarea disabled 同步）。

**ChatInputArea 变更**：去除 `<Card className="p-3 flex items-center gap-2 bg-background/50">` 包裹，改为 `<div className="flex items-end gap-2 px-3 py-2 border-t border-border/50">`，让底栏自然形成顶边 1px 边框 + 上下内边距的输入区。**移除** ChatInputArea 中现有的「流式期间显示独立停止 Button」分支（行 44-49）——停止按钮已合并到 ChatInput 内部。ChatInputArea 透传 `isStreaming={isStreamLoading}` 与 `onStop` 给 ChatInput；保留 ChatInputArea 现有 6 个 props（`inputKey` / `isStreamLoading` / `selectedModel` / `selectedApiKeyId` / `onSend` / `onStop`），不变更。`inputKey` 透传 ChatInput 的 React key 重置（保留）。

**props 变更契约**：
- ChatInput: `{ onSend, disabled?, isStreaming? (default false), onStop? }` — 旧 `onSend` / `disabled` 保留
- ChatInputArea: `{ inputKey, isStreamLoading, selectedModel, selectedApiKeyId, onSend, onStop }` — 全部保留（与现状行 21-28 完全一致）

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/ChatInput.tsx`（覆盖）
- 文件：`src/renderer/features/chat/components/ChatInputArea.tsx`（覆盖）
- 模块：`ChatInput` / `ChatInputArea` 组件

**消费（Consumes：）**
- 现有：`@/components/ui/button`（size="icon" 档）
- 现有：`@/components/ui/textarea`
- Task 0：CSS 变量 `--accent` / `--accent-foreground`
- lucide-react：ArrowUp / Square（已有依赖）

**文件：**
- 修改：`src/renderer/features/chat/components/ChatInput.tsx`
- 修改：`src/renderer/features/chat/components/ChatInputArea.tsx`

**验收标准：**
- [ ] ChatInput 发送按钮为 icon-only 方形按钮（`size="icon"` 档，`h-9 w-9 shrink-0 rounded-md`）
- [ ] ChatInput 发送按钮样式 `bg-accent text-accent-foreground`
- [ ] ChatInput `isStreaming === true` 时按钮显示 `Square` 图标 + `bg-destructive text-destructive-foreground` 样式 + 点击触发 onStop
- [ ] ChatInput `isStreaming === false` 时按钮显示 `ArrowUp` 图标 + `bg-accent text-accent-foreground` 样式 + 点击触发 onSend
- [ ] ChatInput 接收新 prop `isStreaming?: boolean`（默认 false）
- [ ] ChatInput 接收新 prop `onStop?: () => void`
- [ ] ChatInput 内部 Textarea 的 `disabled` 条件保持现状（流式 + 无 model + 无 apiKey 任一即 disabled）
- [ ] ChatInputArea 不再 import `@/components/ui/card`
- [ ] ChatInputArea 根元素为 `<div className="flex items-end gap-2 px-3 py-2 border-t border-border/50">`
- [ ] ChatInputArea 不再独立渲染停止按钮（已合并到 ChatInput）
- [ ] ChatInputArea 的 inputKey / isStreamLoading / selectedModel / selectedApiKeyId / onSend / onStop 6 个 props 全部保留
- [ ] ChatInputArea 内部正确传递 `isStreaming={isStreamLoading}` 与 `onStop={onStop}` 给 ChatInput
- [ ] ChatInputArea 内部正确传递 `disabled={isStreamLoading || !selectedModel || !selectedApiKeyId}` 给 ChatInput
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors

**步骤：**
1. 为 ChatInput 新形态（icon 按钮、isStreaming 切换、onStop）编写失败测试（如尚无测试）
2. 运行测试，验证失败
3. 重构 ChatInput 实现 icon 按钮 + 流式切换
4. 重构 ChatInputArea 去掉 Card 包裹 + 透传新 props
5. 运行测试 + tsc + lint
6. 提交

---

## Task 4: ChatMessage 气泡精修 + 思考脉冲动画

**目标：** ChatMessage 气泡圆角 2xl→xl、去除大色块改极淡边框；思考区域左侧 2px accent 边条；新增流式思考顶部 1px 进度条（复用 `animate-pulse-cyan`）；元信息统一 font-mono text-xs。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#55-消息气泡精修`

**需求描述：**
ChatMessage 接收的 props 与现状完全一致（role / content / thinking? / isThinking? / model? / isStreaming? / hasError? / onRegenerate?）。视觉变更：
1. 气泡外层 `rounded-2xl px-5 py-3.5` → `rounded-xl px-4 py-3`
2. 气泡背景：`bg-primary/10` → `bg-muted/30`（用户消息）；`bg-muted/30` → `bg-card` + `border-border/60`（AI 消息）；`bg-destructive/10` → `bg-destructive/5` + `border-destructive/30`（错误态）
3. 思考区域：增加 `border-l-2 border-accent/40` 左侧条；标题行加入 Brain 图标（lucide-react）替代「思考过程」文字（保留文字）；内容字体 `text-xs` 改 `font-mono text-xs` 等宽
4. 流式思考期间（`isThinking === true`）在思考区域顶部加 1px `bg-accent animate-pulse-cyan` 进度条（周期沿用 `index.css` 现状 2s ease-in-out，与 `pulse-dot` keyframe 对齐；设计文档 §6 写 1500ms 暂不修改 keyframe 保持向后兼容）
5. 消息元信息（顶部 model）：保留 `text-[11px] font-mono text-muted-foreground`，但与设计文档 5.5 节「`font-mono text-xs text-muted-foreground`」统一改为 `text-xs font-mono text-muted-foreground`
6. Action buttons 区（复制/重新生成）保持现状，**只**调整 spacing：`mt-3 pt-2` → `mt-2 pt-2`
7. 流式末尾光标（`bg-primary` 1.5x4 inline-block）颜色改 `bg-accent`

**props 行为不变**——所有交互（点击折叠、复制、重新生成）保持现状。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/ChatMessage.tsx`（覆盖）
- 模块：`ChatMessage` 组件

**消费（Consumes：）**
- Task 0：CSS 变量 `--accent`（通过 `text-accent` / `bg-accent` / `border-accent/40` 等）
- 现有：`@/components/shared/markdown`
- 现有：`@/components/ErrorBoundary`
- 现有：`@/components/ui/button`
- 现有：`framer-motion`（入场动画保留）
- 现有：`lucide-react`（ChevronDown / Copy / RefreshCw 已用；新增 Brain）
- 现有：`animate-pulse-cyan` keyframe（`index.css` 已定义）

**文件：**
- 修改：`src/renderer/features/chat/components/ChatMessage.tsx`

**验收标准：**
- [ ] 气泡圆角 `rounded-xl`（不是 2xl/3xl）
- [ ] 用户消息气泡背景 `bg-muted/30`
- [ ] AI 消息气泡背景 `bg-card border-border/60`
- [ ] 错误消息气泡背景 `bg-destructive/5 border-destructive/30`
- [ ] 思考区域包含 `border-l-2 border-accent/40` 左侧条
- [ ] 思考区域标题行有 Brain 图标 + 「思考过程」文字
- [ ] 思考内容字体 `font-mono text-xs`
- [ ] `isThinking === true` 时思考区域顶部有 1px `bg-accent animate-pulse-cyan` 进度条
- [ ] 消息顶部 model 文本 `text-xs font-mono text-muted-foreground`
- [ ] 流式末尾光标颜色 `bg-accent`
- [ ] Action buttons 间距 `mt-2 pt-2`
- [ ] 所有现有 props 行为（折叠切换、复制、重新生成）保持不变
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors

**步骤：**
1. 修改 ChatMessage 样式类名与新增 Brain 图标 + 思考进度条
2. 运行 tsc + lint
3. 提交

---

## Task 5: MessageList 样式精修

**目标：** MessageList 去除空态独立 Card 改为底栏上方一行浅色提示文字；消息列表容器调整内边距与上下间距。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#56-输入区底栏-64-120px`（空态变提示文字部分）

**需求描述：**
MessageList 接收的 props 与现状完全一致（messages / onRegenerate / messagesEndRef）。视觉变更：
1. 容器 `flex-1 overflow-auto mb-4 px-1` → `flex-1 overflow-auto px-3 py-4`（去掉外底距、加内边距）
2. 空态：去除 `<Card>` 包裹 + 移除 `MessageSquare` 大图标，改为底栏上方一行浅色提示文字：`<p className="text-center text-sm text-muted-foreground/60">选择模型和 API Key，输入消息开始测试</p>`
3. 移除 `Card` / `CardContent` import
4. 消息列表入场动画保留（AnimatePresence + ChatMessage 自带 motion）

**props 行为不变**——`onRegenerate` 仍然只在最后一条非流式 assistant 消息上回调。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/MessageList.tsx`（覆盖）
- 模块：`MessageList` 组件 + `Message` 类型导出

**消费（Consumes：）**
- 现有：`framer-motion`（`AnimatePresence` / `motion`）
- 现有：`ChatMessage` 组件
- 不直接消费 Task 0 变量

**文件：**
- 修改：`src/renderer/features/chat/components/MessageList.tsx`

**验收标准：**
- [ ] 不再 import `@/components/ui/card`
- [ ] 容器根元素 `flex-1 overflow-auto px-3 py-4`
- [ ] 空态文案「选择模型和 API Key，输入消息开始测试」居中显示（`text-center text-sm text-muted-foreground/60`）
- [ ] 空态无 `Card` 包裹无大图标
- [ ] `Message` 接口导出保持不变（其他模块依赖此类型）
- [ ] `onRegenerate` 仍仅在最后一条非流式 assistant 消息上传递
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors

**步骤：**
1. 修改 MessageList JSX 结构与空态文案
2. 运行 tsc + lint
3. 提交

---

## Task 6: ConversationSidebar 折叠态图标条化 + 展开态样式精修

**目标：** ConversationSidebar 折叠态从「单图标按钮 div」改为「56px 宽 4 个图标按钮纵列（展开 / 新建 / 设置占位 / 关于占位）」；展开态行 hover 显示 2px accent 左边条；时间戳与 model 改 font-mono text-xs。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#54-侧边栏折叠` + `#55-消息气泡精修`（行样式参考）

**需求描述：**
ConversationSidebar 接收的 props 与现状完全一致（conversations / activeId / onSelect / onNew / onDelete / isCollapsed / onToggleCollapse）。视觉与结构变更：
1. 折叠态：从 10px 宽单图标改为 56px 宽 flex-col **2 个**图标按钮（PanelLeft 展开 / Plus 新建）——遵循设计文档 §11 YAGNI「不做未实现功能」，**不**添加 MessageSquare / Settings 占位（避免与「禁止导航到不存在页面」冲突）。折叠态外层用 framer-motion `motion.div` 配 `initial={{ width: 0, opacity: 0 }} animate={{ width: 56, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }}`（与展开态对称 200ms ease-out）。`shrink-0 w-14 border-r border-border/50`。
2. 展开态容器：保持 `w-60 border-r border-border/50`，header 区（标题 + 新建 + 折叠按钮）保留但调整 padding `px-3 py-2`；header 标题字号 `text-[10px] tracking-wider uppercase`（与现状一致）。
3. 会话行样式调整：mx-1.5 my-0.5 → `mx-1.5 my-px`（紧凑行高）；hover 时显示左侧 2px accent 条用 `border-l-2 border-transparent hover:border-l-accent`（active 态用 `border-l-accent bg-accent/5`）；active 态颜色从 `bg-primary/10 border-primary/20` 改为 `bg-accent/5 border-l-accent`。
4. 元信息行：`text-[10px]` → `text-xs`（设计文档 5.5 节统一字号）；model 与时间戳均加 `font-mono`。
5. 删除按钮保留（active 态显示），样式不变。

**props 行为不变**——onSelect / onNew / onDelete / onToggleCollapse 全部保留。

**产出（Produces）：**
- 文件：`src/renderer/features/chat/components/ConversationSidebar.tsx`（覆盖）
- 模块：`ConversationSidebar` 组件

**消费（Consumes：）**
- Task 0：CSS 变量 `--accent`（通过 `bg-accent/5` / `border-l-accent` 等）
- 现有：`@/components/ui/button`
- 现有：`@/components/shared/empty-state`
- 现有：`framer-motion`（layout / AnimatePresence）
- 现有：`@/lib/utils`（`formatRelativeDate`）
- 现有：`lucide-react`（已用：Plus / PanelLeftClose / PanelLeft / Trash2；折叠态**不新增** MessageSquare / Settings）

**文件：**
- 修改：`src/renderer/features/chat/components/ConversationSidebar.tsx`

**验收标准：**
- [ ] 折叠态宽度 `w-14`（56px），包含 **2 个**图标按钮（PanelLeft / Plus）
- [ ] 折叠态外层用 framer-motion 宽度动画（与展开态对称，200ms）
- [ ] 折叠态 PanelLeft 图标点击调用 onToggleCollapse
- [ ] 折叠态 Plus 图标点击调用 onNew
- [ ] 展开态宽度 `w-60`，header 区 + 列表区结构保留
- [ ] 会话行 hover 时显示 2px accent 左边条（`border-l-2 border-transparent hover:border-l-accent`）
- [ ] 会话行 active 态用 `bg-accent/5 border-l-accent`
- [ ] 会话行 model / 时间戳 `text-xs font-mono`
- [ ] 所有 props（conversations / activeId / onSelect / onNew / onDelete / isCollapsed / onToggleCollapse）行为不变
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors

**步骤：**
1. 修改 ConversationSidebar 折叠态与展开态 JSX
2. 运行 tsc + lint
3. 提交

---

## Task 7: Chat.tsx 三段布局重构 + ThinkingSettings 集成到顶栏

**目标：** Chat.tsx 重构为「折叠侧栏 + 顶栏工具条（ChatToolbar + ThinkingSettings 内联）+ 消息区 + 底栏输入」三段布局；去除 ThinkingSettings 外层 Card 包裹；统一顶栏内所有 chip 在同一行。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#51-三栏-z-axis-重排` + `#52-顶栏工具条48px` + `#53-thinkingsettings-重构chip-形态`

**需求描述：**
Chat.tsx 接收的 props 来自 useChatPage（已包含 sidebarCollapsed / toggleSidebar），无变化。结构变更：
1. 顶层 `<motion.div className="flex h-full">` 保留
2. 侧栏：`<ConversationSidebar ... />` 保留在 `motion.div variants={childVariants} className="contents"` 内
3. 主区：`<motion.div className="flex-1 flex flex-col min-w-0 pl-3">` → `<motion.div className="flex-1 flex flex-col min-w-0">`（去掉 pl-3，让 ChatToolbar 自己加水平 padding）
4. 顶栏：新建一个容器 `<div className="flex items-center h-12 px-3 gap-2 border-b border-border/50">`：
   - 内含 `<ChatToolbar ... />`（已自包含）
   - 移除其外层 Card（Task 2 已做）
   - 紧接 ThinkingSettings chip（不再用 Card 包裹）
   - 两者之间用 `<div className="h-4 w-px bg-border/50 mx-1" />` 1px 竖直分隔条
   - ThinkingSettings 暴露为水平排布（`flex items-center gap-2`）
5. 移除原本 ThinkingSettings 的 Card 包裹
6. 移除原本 ChatToolbar 的外层 mb-4（已由顶层 border-b 接管分隔）
7. 消息区：`<MessageList ... />` 保留
8. 底栏：`<ChatInputArea ... />` 保留（已自包含顶边 border-t）
9. 移除 `Card` import（不再使用）

**props 行为不变**——useChatPage 暴露的 callbacks 全部透传。

**产出（Produces：）**
- 文件：`src/renderer/pages/Chat.tsx`（覆盖）
- 模块：`ChatPage` 组件

**消费（Consumes：）**
- Task 0：CSS 变量（通过 Tailwind class 间接）
- Task 1：`ThinkingSettings` 组件（新形态）
- Task 2：`ChatToolbar` 组件（去 Card）
- Task 3：`ChatInputArea` 组件（去 Card）
- Task 5：`MessageList` 组件
- Task 6：`ConversationSidebar` 组件
- 现有：`useChatPage` hook
- 现有：`framer-motion`（pageVariants / childVariants）

**文件：**
- 修改：`src/renderer/pages/Chat.tsx`
- 修改：`src/renderer/pages/__tests__/Chat.test.tsx`（如果存在；否则新建）

**验收标准：**
- [ ] 不再 import `@/components/ui/card`
- [ ] 顶层为 `<motion.div className="flex h-full">` 含 `pageVariants` 入场
- [ ] 侧栏在子层 `<motion.div variants={childVariants} className="contents">` 内
- [ ] 主区根元素 `flex-1 flex flex-col min-w-0`（无 pl-3）
- [ ] 顶栏容器 `flex items-center h-12 px-3 gap-2 border-b border-border/50`
- [ ] 顶栏内 ChatToolbar + 1px 竖直分隔条 + ThinkingSettings 水平排列
- [ ] ThinkingSettings 不再被 Card 包裹
- [ ] ChatToolbar 不再被 Card 包裹（由 Task 2 实现）
- [ ] MessageList 与 ChatInputArea 在顶栏之下
- [ ] **重写** `__tests__/Chat.test.tsx` 中受 Task 1/3/5 影响的断言（约 15-20 处）：`getAllByRole('combobox')` 期望值从 4 改为 3、`getByText('停止')` / `getByText('发送')` 改为按 icon 查找（`getByRole('button', { name: /停止/ })` 或测试 Icon 父元素）、`getByRole('group', { name: '执行方式' })` 调整为 chip 触发后的 Popover 查询路径、`getByText(/选择模型和 API Key/)` 改为新文案、空态查询路径变更
- [ ] 所有重写后的测试通过：`npx vitest run src/renderer/pages/__tests__/Chat.test.tsx`
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm run lint` 0 errors
- [ ] `npm run test:frontend` exit 0

**步骤：**
1. 阅读现有 `__tests__/Chat.test.tsx`，列出受 Task 1/3/5 影响需重写的断言清单
2. 重构 Chat.tsx 三段布局 + 顶栏 chip 流
3. 重写测试断言以适配新形态（不删测试，保留意图只换查询路径）
4. 运行测试 + tsc + lint
5. 提交

---

## Task 8: 全量验证

**目标：** 在所有组件重构完成后跑全量验证（lint + tsc + 全部测试 + 启动 dev 流程串一遍），确认无回归、无类型错误、UI 渲染正确。

**设计文档索引：** `docs/superpowers/specs/2026-06-20-chat-ui-redesign-design.md#12-风险与验证`

**需求描述：**
本任务**不修改任何代码**，只做最终验证。所有命令在仓库根目录执行：
1. `npm run lint` — 0 errors / 0 warnings（warning 可在 reason 合理时保留）
2. `npx tsc -b --noEmit` — exit 0
3. `npm test` — 全量前后端测试通过
4. `npm run test:frontend` — 前端测试通过（特别关注 Chat 页面 + ThinkingSettings）
5. `npm run test:backend` — 后端测试无回归（本次未改后端，但需确认）
6. 视觉验证（人工）：`npm run dev` 启动后人工检查 Chat 页面：顶栏 chip 流正确、侧栏可折叠且折叠态 4 个图标、消息气泡圆角与边框、输入区底栏布局、思考脉冲动画在流式时显示
7. **功能回归**：人工发送一条消息确认 SSE 流正常；切换对话确认思考设置跟随；修改思考设置确认持久化（重新加载页面后保留）

验证结果写入 PR description 或临时验证报告（不强制提交文件）。

**产出（Produces）：**
- 无（验证任务）

**消费（Consumes：）**
- Task 0-7 所有产出

**文件：**
- 无

**验收标准：**
- [ ] `npm run lint` exit 0
- [ ] `npx tsc -b --noEmit` exit 0
- [ ] `npm test` exit 0（前后端全量）
- [ ] `npm run dev` 启动后 Chat 页面顶栏呈现水平 chip 流（供应商 / 模型 / API Key / 1px 分隔条 / 思考 chip / 强度 chip）
- [ ] 侧栏折叠按钮可切换 240px ↔ 56px
- [ ] 折叠态显示 4 个图标按钮
- [ ] 消息气泡圆角、边框、model 元信息 mono 字体符合设计
- [ ] 发送按钮为 icon 方形按钮（无「发送」文字）
- [ ] 流式思考期间显示 `animate-pulse-cyan` 进度条
- [ ] ThinkingSettings chip 点击浮出 Popover，选项可单选
- [ ] 切对话后思考设置跟随加载
- [ ] 修改思考设置后刷新页面仍保留
- [ ] SSE 流式发送/接收完整可用（无 console error）
- [ ] 自动更新文档（如有需要）：README / ARCHITECTURE 描述与实际行为一致

**步骤：**
1. 执行 lint → 失败则定位修复
2. 执行 tsc → 失败则定位修复
3. 执行 test:frontend → 失败则定位修复
4. 执行 test:backend → 失败则定位修复
5. 启动 dev → 人工视觉验证 7 项 → 不符则回退到对应 Task 修复
6. （可选）提交验证报告
7. 报告整体结果

---

## 执行分层

> 由 Produces/Consumes 自动分析得出。同层任务修改不同文件且无依赖关系 → 可并行执行。

| 层级 | 任务 | 依赖 | 可并行 |
|:----:|------|------|:------:|
| L0 | Task 0: 新增 cyan accent CSS 变量 | 无 | — |
| L1 | Task 1: ThinkingSettings chip+Popover | Task 0 | ✅ |
| L1 | Task 2: ChatToolbar 去 Card | 无（独立视觉） | ✅ |
| L2 | Task 3: ChatInput icon + ChatInputArea 底栏 | Task 0 | ✅ |
| L2 | Task 4: ChatMessage 气泡精修 | Task 0 | ✅ |
| L2 | Task 5: MessageList 样式精修 | 无 | ✅ |
| L2 | Task 6: ConversationSidebar 折叠态 | Task 0 | ✅ |
| L3 | Task 7: Chat.tsx 三段布局集成 | Task 1, 2, 3, 5, 6 | — |
| L4 | Task 8: 全量验证 | Task 0-7 | — |

### 分层说明

- **L0 (Task 0)**：CSS 变量是所有 chip+active 态视觉的根，无 JS 依赖，必须先行
- **L1 (Task 1, 2)**：ThinkingSettings（chip 形态）与 ChatToolbar（去 Card）独立，互不引用；ChatToolbar 不依赖 Task 0 变量（仅尺寸调整）
- **L2 (Task 3, 4, 5, 6)**：4 个独立组件样式精修，互不引用；ChatMessage（Task 4）依赖 Task 0 变量
- **L3 (Task 7)**：Chat.tsx 集成层，必须等所有子组件完成
- **L4 (Task 8)**：全量验证，必须等集成完成

### 同层并行安全性

- L1：Task 1 修改 ThinkingSettings.tsx，Task 2 修改 ChatToolbar.tsx → **不同文件** ✅
- L2：Task 3 / 4 / 5 / 6 各改不同文件（ChatInput.tsx + ChatInputArea.tsx / ChatMessage.tsx / MessageList.tsx / ConversationSidebar.tsx）→ **无文件冲突** ✅

---

## 备注

- 计划共 9 个任务（Task 0-8）
- 总改动文件数：8 个 .tsx + 1 个 .css + 1-2 个测试文件
- 预计交付后 Chat 页面符合「冷锐极简 Instrument Panel」设计方向
- 零新依赖、零 IPC 变更、零业务逻辑变更
- Task 8 是验证任务，由 Controller 直接执行（不派子代理）
