# Chat 页面 UI 重设计 设计文档

> **创建日期**：2026-06-20
> **背景**：思考参数透传功能已交付（13 任务完成），Chat 页面功能可用但视觉过简、控件堆叠笨重、信息密度低。用户要求重新设计 UI。

## 1. 问题陈述

现状（功能可用但视觉待改）：
- ThinkingSettings 卡片占整行（大色块+三个按钮+下拉）
- ChatToolbar 同样是大卡平铺供应商/模型/API Key 三个下拉
- 侧边栏固定 240px 不能折叠
- 消息气泡样式朴素
- 输入区空状态文案位置偏右
- 整体黑底+边框+控件堆叠，无 z-axis 层次与个性

## 2. 设计方向：冷锐极简「Instrument Panel」

**美学锚点**：Linear / Raycast / Vercel Dashboard / Vercel Design。

**核心气质**：专业工具感、克制、每像素有功能、信息密度高、单一冷色 accent、零装饰性渐变。

**关键原则**：
- 容器最小化：去除 ThinkingSettings/ChatToolbar 的 Card 包裹，改 chip/inline 形态
- 单一冷色 accent：所有强调统一用 cyan-400，不混色
- 锐利字体：系统字体栈 + 紧缩字距 tracking-tight，标题靠 weight 而非 size 区分
- 极细分隔：用 border-border/50 而非厚重卡片
- 微交互轻盈：100-200ms 颜色/位移过渡，禁用弹跳

## 3. 配色（精修现有 dark 主题）

新增 CSS 变量 `index.css`（不破坏现有 token）：

```css
@layer base {
  :root {
    /* 现有变量保留，新增 accent + chip 背景 */
    --accent: 188 95% 55%;             /* cyan-400 等效 HSL */
    --accent-foreground: 220 25% 8%;   /* cyan 上的深色文字 */
    --chip: 220 18% 14%;               /* chip 背景，比 muted 略亮 */
    --chip-active: 188 95% 55%;        /* active chip 背景（accent 透明 0.12） */
  }
}

@theme inline {
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-chip: hsl(var(--chip));
  --color-chip-active: hsl(var(--chip-active) / 0.12);
}
```

Tailwind 使用：`text-accent`、`bg-accent`、`bg-chip`、`border-accent/40`、`bg-chip-active`（已存在 text-destructive/bg-destructive 模式同理）。

**禁用**：紫色/蓝紫渐变（AI 俗套）、多处 accent 混色、emoji 当 icon。

## 4. 字体方案

**Tailwind 4 system stack**（index.css 的 body 已声明 system font），不引外部依赖。设计要点：
- 标题 `font-weight: 600, letter-spacing: -0.01em`（中文保持默认）
- 数字/技术信息（token 数、时间戳、模型 ID）用等宽：`font-mono` 类
- 字号层级靠 weight 而非 size 跳变（避免大字标题突兀感）

## 5. 布局重构

### 5.1 三栏 z-axis 重排

```
┌────────┬───────────────────────────────────────────────┐
│        │ 顶栏工具条 48px（供应商·模型·Key·思考·强度） │
│  侧栏  ├───────────────────────────────────────────────┤
│ 240px  │                                                │
│ (可折叠 │          消息区（主内容）                      │
│  到56px)│                                                │
│        │                                                │
│        ├───────────────────────────────────────────────┤
│        │ 底栏输入区 64-120px（自动高度）                │
└────────┴───────────────────────────────────────────────┘
```

**与现状差异**：
- 顶栏取代 ChatToolbar + ThinkingSettings 两张大卡 → 整行水平 chip 流
- 侧栏可折叠（新增折叠状态，56px 图标条）
- 消息区占满主内容（无内嵌 Card）
- 底栏固定，不再是绝对定位

### 5.2 顶栏工具条（48px）

水平 chip 流（左→右）：
- 「供应商」Select（120px）
- 「模型」Select（140px）
- 「API Key」Select（120px）
- 分隔条 1px（h-4 border-l）
- 思考 chip：「🧠 disabled」/「🧠 enabled」/「🧠 adaptive」（Popover 切换，活跃态 cyan）
- 强度 chip：「强度 · medium ▼」（Popover 下拉，disabled 状态灰显）

所有 chip 无 Card 包裹，inline 排列。点击 chip 浮出 Popover 切换。

### 5.3 ThinkingSettings 重构（chip 形态）

**chip**（顶栏内）：
- 思考：单个 Button + Popover，Popover 内 3 个 Radio 选项（disabled/enabled/adaptive）
- 强度：单个 Button + Popover，Popover 内 6 个 Radio 选项（minimal/low/medium/high/xhigh/max）
- disabled 状态：强度 chip opacity-50 pointer-events-none（保留当前值不重置，便于切回）

**组件结构变更**（同一文件 ThinkingSettings.tsx）：
- 内部加 Popover 包装（用 `@/components/ui/popover`）
- 选项用 `RadioGroup`（需先确认 `@/components/ui/` 有无，否则用 RadioGroup shadcn 模式 or Button 列表）
- active 态：chip 文字 cyan，背景 bg-chip-active，border-accent/40

### 5.4 侧边栏折叠

- 折叠态（56px）：仅显示 4 个图标按钮（消息/新会话/折叠切换/设置入口），无文字
- 展开态（240px）：当前 ConversationSidebar 完整版，新增折叠按钮在最顶部
- 折叠/展开用 framer-motion width 动画 200ms ease-out
- 会话列表行：hover 显左边 2px accent 条 + bg-muted/30，标题用 truncate，时间戳用 font-mono text-xs text-muted-foreground

### 5.5 消息气泡精修

- 移除大圆角（rounded-3xl），改 rounded-xl（Card/Popover 档）
- 边框 1px border-border/50，无大色块背景
- 用户消息：右对齐，bg-muted/30 极淡背景
- AI 消息：左对齐，bg-card 极淡边框
- 思考流：流式期间在消息顶部加 1px accent 进度条 + chip 「🧠 thinking...」脉冲动画
- thinking 文本：bg-muted/20 + border-l-2 border-accent/40 左侧条，等宽字体，font-size 略小
- 代码块：bg-muted/30 + rounded-md，顶部小色条标识语言
- 消息元信息（时间/模型）：font-mono text-xs text-muted-foreground

### 5.6 输入区（底栏 64-120px）

- 顶边 1px border-border/50
- 左侧 textarea：placeholder 简短（"输入消息... (Shift+Enter 换行）"），font-size 14px
- 右侧发送 Button：icon 模式（ArrowUp），disabled 时 opacity-50，hover scale-1.02 active scale-0.98
- 流式期间：发送按钮变停止按钮（Square icon + accent 色）
- 去除独立空状态卡（"选择模型和 API Key..."）——改底栏上方一行浅色提示文字

## 6. 微交互规范

| 触发 | 动画 | 时长 | 缓动 |
|------|------|------|------|
| chip 状态切换 | 颜色 + 背景过渡 | 150ms | easeOut |
| chip hover | bg-muted/30 fade in | 100ms | easeOut |
| 消息出现 | fade-in + translateY(4→0) | 200ms | easeOut |
| 消息列表 stagger | delay: idx * 0.03 | — | — |
| 思考流脉冲 | accent 透明度 0.4↔1 | 1500ms loop | easeInOut |
| 侧栏折叠 | width 240↔56 | 200ms | easeOut |
| 发送按钮 hover | scale 1.02 | 100ms | easeOut |
| 发送按钮 active | scale 0.98 | 80ms | easeOut |
| 侧栏会话 hover | 左边 2px accent 条 fade in | 150ms | easeOut |

## 7. 契约与接口

### 7.1 共享类型

无新增。`ThinkingType` / `ReasoningEffort` / `ThinkingConfig` 已在 shared/types.ts 定义，本次仅 UI 形态变更。

### 7.2 模块接口

| 模块 | 变更 | 接口签名 |
|------|------|---------|
| `Chat.tsx` | 重构布局：顶栏/消息区/底栏三段 | 同 `useChatPage` 返回值（不变） |
| `ChatToolbar.tsx` | 改名为「顶栏工具条」语义，内容并入 ThinkingSettings | props 不变 |
| `ThinkingSettings.tsx` | chip 形态 + Popover 切换 | props 不变 `{thinkingType, reasoningEffort, onThinkingTypeChange, onReasoningEffortChange}` |
| `ConversationSidebar.tsx` | 加折叠状态、56px ↔ 240px 动画 | props 加 `collapsed: boolean, onToggleCollapsed: () => void` |
| `MessageList.tsx` | 消息样式精修（圆角/边框/间距） | props 不变 |
| `ChatMessage.tsx` | 气泡精修 + 思考脉冲 + 元信息 mono | props 不变 |
| `ChatInputArea.tsx` | 底栏固定 + 发送按钮 icon 化 | props 不变 |
| `index.css` | 新增 accent/chip CSS 变量 | 无（CSS 层） |
| `useChatPage.ts` | 加 `sidebarCollapsed` / `setSidebarCollapsed` 状态 + `toggleSidebar` 现存增强 | 返回值加 toggle |
| `ChatInput.tsx` | 与 ChatInputArea 合并或保留 | 评估 |

### 7.3 跨端契约

无 IPC 变更，纯 UI 重构。

## 8. 设计决策记录

| 决策 | 备选 | 选定 | 理由 |
|---|---|---|---|
| 字体方案 | Geist Sans/Mono（CDN）vs 系统字体栈 | **系统字体栈** | 零依赖、零网络请求、零构建配置变更。用户选定 |
| accent 色 | 紫蓝渐变 vs cyan/teal vs emerald | **cyan/teal** | 冷锐极简调性契合，避免 AI 俗套。用户选定 |
| 侧栏 | 固定 240px vs 可折叠 vs 顶栏弹出 | **可折叠** | 多一层状态，桌面端实用。用户选定 |
| ThinkingSettings 形态 | 卡片三按钮+下拉 vs chip+Popover | **chip+Popover** | 顶栏 inline 编辑风格，更紧凑、密度更高 |
| ChatToolbar 包裹 | Card 包裹 vs inline flex | **inline flex（去 Card）** | 容器最小化，控件直接浮在顶栏背景上 |
| 消息气泡圆角 | rounded-3xl vs rounded-xl | **rounded-xl** | visual-style.md Card/Popover 档，与现有 Popover/Modal 一致 |
| 消息气泡背景 | 大色块 vs 极淡边框 | **极淡边框** | 避免视觉重量，密度更高 |
| 输入区 | 绝对定位底栏 vs flex 自然流 | **flex 自然流** | 适配 flex 布局，代码更简洁 |
| 字体方案引外部依赖 | 引 vs 不引 | **不引（系统字体）** | 用户选定，零依赖 |
| 渐变 | 任何渐变背景 vs 单色 | **单色** | 「冷锐极简」核心气质，避免 AI 俗套 |

## 9. 组件复用与新建

**复用**（`@/components/ui/`）：
- Button、Card、Select、Popover、RadioGroup（确认存在，否则用 Button 列表替代）、Skeleton、Badge、Tooltip

**新建**：
- 无（仅改样式与组合，不新增 UI 原子组件）

**需确认**：`@/components/ui/radio-group` 是否存在，若无则用 Button 列表或 Popover 内 Button 列表实现单选。

## 10. 影响范围

| 文件 | 操作 |
|---|---|
| `src/renderer/index.css` | 新增 accent/chip CSS 变量 |
| `src/renderer/features/chat/components/ChatToolbar.tsx` | 改布局：去 Card，inline flex |
| `src/renderer/features/chat/components/ThinkingSettings.tsx` | 改形态：chip + Popover |
| `src/renderer/features/chat/components/ConversationSidebar.tsx` | 加折叠态、动画、紧凑行 |
| `src/renderer/features/chat/components/MessageList.tsx` | 精修样式 |
| `src/renderer/features/chat/components/ChatMessage.tsx` | 精修气泡 + 思考脉冲 |
| `src/renderer/features/chat/components/ChatInputArea.tsx` | 改底栏布局 + icon 按钮 |
| `src/renderer/features/chat/components/ChatInput.tsx` | 评估：合并到 ChatInputArea 或保留 |
| `src/renderer/pages/Chat.tsx` | 重构整体布局为顶栏/消息/底栏三段 |
| `src/renderer/features/chat/hooks/useChatPage.ts` | 暴露 toggleSidebar（已存在）、加 collapsed state |
| `src/renderer/pages/__tests__/Chat.test.tsx` | 扩展：测试折叠/顶栏集成/ThinkingSettings Popover 形态 |
| `src/renderer/features/chat/components/__tests__/ThinkingSettings.test.tsx` | 扩展：测试 chip + Popover 形态 |

## 11. 不做的事（YAGNI）

- ❌ 不引外部字体（用户选定系统字体）
- ❌ 不做 light mode（项目仅 dark-only）
- ❌ 不加 emoji 装饰（仅用 lucide 图标）
- ❌ 不重写功能逻辑（useChatPage/useChatStream/useConversationManager 逻辑不变）
- ❌ 不改 IPC 契约
- ❌ 不动其他页面（Dashboard/Providers/Logs 等保持原样）
- ❌ 不加渐变/阴影堆叠等装饰性效果

## 12. 风险与验证

**风险**：
- Popover 在 Radix 下的 pointer-events / focus 行为可能与现有测试不兼容
- 折叠态侧边栏的动画可能影响测试（jsdom 无 layout）
- ChatMessage 精修可能影响现有 message 流测试

**验证**：
- 视觉：本地启动 `npm run dev` 人工审视
- 功能：npm test 全量通过（前端 202 测试无回归）
- 类型：npx tsc -b --noEmit exit 0
- lint：npm run lint 0 errors
