/**
 * 代码修复工作流 v2 — 基于审查结果的全量修复
 *
 * 5 个阶段，每阶段并行，阶段间有依赖屏障
 * 预估：17 agents，~8 分钟
 */

export const meta = {
  name: 'code-fix-v2',
  description: '基于代码审查结果，按 P0→P2 优先级修复全部不合规代码',
  phases: [
    { title: 'P0 安全+可观测', detail: 'API Key 脱敏 + console→logger（3 agents）' },
    { title: 'P0 代码拆分', detail: '超长函数拆分 + 嵌套降低（3 agents）' },
    { title: 'P1 架构+前端', detail: '数据层映射 + IPC 命名 + queryKey + 布尔前缀 + 错误吞没（5 agents）' },
    { title: 'P1 可观测性补充', detail: '日志级别 + 魔法数字 + handler 返回值（3 agents）' },
    { title: '验证', detail: 'TSC 编译 + 测试 + Lint（3 agents）' },
  ],
}

// ── Phase 1: P0 安全 + P1 可观测性（console→logger） ──
// 文件隔离：security 用 logger.ts+server.ts+handler.ts, obs1 用 index.ts, obs2 用 update/
phase('P0 安全+可观测')

const [securityFix, consoleFix1, consoleFix2] = await parallel([
  () => agent(`你是修复专家。修复 src/main/ 的安全问题。

**任务 1 — server.ts x-api-key 脱敏**
文件：src/main/proxy/server.ts
问题：第 108 行 allHeaders 构造只对 authorization 脱敏，遗漏 x-api-key
修复：将条件从 k === 'authorization' 改为 k === 'authorization' || k === 'x-api-key'

**任务 2 — handler.ts x-api-key 脱敏**
文件：src/main/proxy/handler.ts
问题：第 101 行 clientHeaders 构造只对 authorization 脱敏
修复：将条件改为 k === 'authorization' || k === 'x-api-key'
注意：同文件第 226 行已有正确模式可参考

**任务 3 — logger.ts sanitize() 扩展**
文件：src/main/core/logger.ts
问题 1：sanitize() 函数只匹配 authorization 键名
修复：扩展为匹配 authorization / x-api-key / token / password / secret 等键名
问题 2：console 输出（第 76 行）直接 JSON.stringify(data) 绕过 sanitize()
修复：在 console 输出前也调用 sanitize() 处理 data

**规则**：
- 使用 Edit 工具修改，不要重写整个文件
- 保持周围代码风格一致
- API Key 脱敏规则：只保留后 4 位，前缀用 *** 替代

修改完成后，列出所有修改的文件和行号。`, {
    label: '修复:安全(P0)',
    phase: 'P0 安全+可观测',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 src/main/index.ts 中的 console.log/error/warn 违规。

文件：src/main/index.ts
问题：7 处使用 console.log/console.error 代替 logger

修复步骤：
1. 在文件顶部添加 import：import { createLogger } from './core/logger'
2. 创建 logger 实例：const logger = createLogger('main')
3. 逐处替换：
   - 第 87-88 行：renderer console 转发 → 保留 console（这是转发渲染进程的 console 到主进程 console，设计如此），但改用 logger
   - 第 92 行：console.log('Renderer did-finish-load') → logger.info('Renderer did-finish-load')
   - 第 112 行：console.log('Loading dev URL:', ...) → logger.info('Loading dev URL', { url: process.env['ELECTRON_RENDERER_URL'] })
   - 第 121 行：console.error(...) → logger.error('Renderer load failed', { errorCode, errorDescription })
   - 第 176 行：console.log('[DEV] Using data dir:', ...) → logger.info('Using data dir', { dataDir })
   - 第 236 行：console.error('[STARTUP] Failed...', err) → logger.error('Failed to initialize backend', { error: err instanceof Error ? err.message : String(err) })

**注意**：第 87-88 行是 renderer console-message 转发逻辑，需要特殊处理 — 用 logger.log(level, message, { sourceId, line }) 替代 console 直接调用。

修改完成后，列出所有修改。`, {
    label: '修复:console→logger(index)',
    phase: 'P0 安全+可观测',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 update/ 模块的 console.log/error/warn 违规。

**文件 1：src/main/update/manager.ts**
问题：11 处 console.log/console.error
修复：
1. 添加 import：import { createLogger } from '../core/logger'
2. 创建 logger：const logger = createLogger('update-manager')
3. 替换所有 console.log → logger.info 或 logger.debug
4. 替换 console.error → logger.error
5. 消息拼接改为 metadata：console.log('[UpdateManager] Current:', v) → logger.info('Version check', { current: v })

**文件 2：src/main/update/config.ts**
问题：2 处 console.warn
修复：
1. 添加 import：import { createLogger } from '../core/logger'
2. 创建 logger：const logger = createLogger('update-config')
3. 替换 console.warn → logger.warn
4. 消息拼接改为 metadata

修改完成后，列出所有修改。`, {
    label: '修复:console→logger(update)',
    phase: 'P0 安全+可观测',
    model: 'sonnet',
  }),
])

// ── Phase 2: P0 代码拆分（超长函数 + 嵌套） ──
// 全部不同文件，可并行
phase('P0 代码拆分')

const [handlerSplit, requestSplit, sseStreamSplit] = await parallel([
  () => agent(`你是重构专家。拆分 src/main/proxy/handler.ts 中超长的 handleProxyRequest 函数（304 行）。

当前函数位于 createProxyHandler 内部，职责包括：
1. 请求头处理和认证
2. 模型路由解析
3. 请求体读取和协议转换
4. 上游 fetch 调用
5. 流式响应处理
6. 非流式响应处理
7. 错误处理和日志记录

拆分策略：
- extractClientHeaders(headers) — 提取和脱敏客户端请求头
- resolveRoute(modelId, apiKey) — 模型路由解析
- handleStreamResponse(response, route, debugInfo) — 流式响应处理
- handleJsonResponse(response, route, debugInfo) — 非流式响应处理
- 保持 handleProxyRequest 作为主编排函数，调用上述子函数

**规则**：
- 每个子函数不超过 50 行
- 嵌套不超过 3 层
- 子函数用 function 声明（非箭头函数），放在 createProxyHandler 内部
- 保持原有错误处理逻辑不变
- 先 Read 整个文件理解上下文，再用 Edit 修改

修改完成后验证：函数行数是否 ≤ 50，嵌套是否 ≤ 3 层。`, {
    label: '拆分:handler.ts',
    phase: 'P0 代码拆分',
    model: 'sonnet',
  }),

  () => agent(`你是重构专家。拆分 src/main/proxy/converter/request.ts 中的两个超长函数。

**函数 1：openaiToAnthropicRequest（234 行，嵌套 6 层）**
职责：OpenAI 请求格式 → Anthropic 请求格式
拆分策略：
- convertMessages(messages) — 消息数组转换（最复杂的部分，嵌套深）
- convertTools(tools) — 工具定义转换
- buildAnthropicParams(converted) — 组装最终参数

**函数 2：anthropicToOpenAIRequest（184 行）**
职责：Anthropic 请求格式 → OpenAI 请求格式
拆分策略：
- convertAnthropicMessages(messages) — 消息转换
- convertAnthropicTools(tools) — 工具转换
- buildOpenAIParams(converted) — 组装参数

**规则**：
- 每个子函数不超过 50 行
- 嵌套不超过 3 层（用 early return + 提取子函数）
- 先 Read 整个文件理解上下文
- 保持导出函数签名不变
- 使用 Edit 工具逐步修改

修改完成后验证：函数行数是否 ≤ 50，嵌套是否 ≤ 3 层。`, {
    label: '拆分:request.ts',
    phase: 'P0 代码拆分',
    model: 'sonnet',
  }),

  () => agent(`你是重构专家。拆分两个 SSE 相关文件中的超长函数。

**文件 1：src/main/proxy/converter/sse.ts**
- openAISSEToAnthropic（185 行）— 拆分为 parseOpenAIEvent + convertEvent + formatAnthropicEvent
- anthropicSSEToOpenAI（132 行）— 拆分为 parseAnthropicEvent + convertEvent + formatOpenAIEvent

**文件 2：src/main/proxy/stream.ts**
- convertSSEStream（130 行，嵌套 7 层）— 拆分为：
  - processSSEChunk(chunk, state) — 处理单个 SSE 块
  - handleStreamComplete(state) — 处理流完成
  - 降低嵌套：用 early return 替代深层 if 嵌套

**规则**：
- 每个子函数不超过 50 行
- 嵌套不超过 3 层
- 先 Read 整个文件理解上下文
- 保持导出函数签名不变
- stream.ts 的 convertSSEStream 是 createStreamService 内部函数，子函数也放在同一闭包内

修改完成后验证：函数行数是否 ≤ 50，嵌套是否 ≤ 3 层。`, {
    label: '拆分:sse+stream',
    phase: 'P0 代码拆分',
    model: 'sonnet',
  }),
])

// ── Phase 3: P1 架构 + 前端 ──
// 文件隔离：data层用 db/*, ipc用 ipc/*, queryKey用 lib/queries/*, 布尔用 shared/types+renderer, catch用多文件
phase('P1 架构+前端')

const [dataLayerFix, ipcNamingFix, queryKeyFix, boolPrefixFix, catchSwallowFix] = await parallel([
  () => agent(`你是修复专家。修复 src/main/db/ 数据层的 camelCase 转换违规。

规则：数据层应保持 snake_case 返回，camelCase 转换由 service 层完成。

**需修复的文件**（在数据层内部做了 snake_case → camelCase 转换）：
1. src/main/db/providers.ts — rowToProvider 函数 + Provider 接口
2. src/main/db/agents.ts — rowToAgent 函数 + Agent 接口
3. src/main/db/agent-configs.ts — rowToConfig 函数 + AgentConfig 接口
4. src/main/db/model-mappings.ts — rowToModelMapping 函数 + ModelMappingRow 接口

**修复策略**：
对于每个文件：
1. 移除 rowToXxx 转换函数
2. 修改接口定义，使用 snake_case 字段名
3. 修改查询函数，直接返回数据库行（不做转换）
4. 更新对应的 service.ts，添加 snake_case → camelCase 转换逻辑

**注意**：
- api-keys.ts 和 conversations.ts 已经正确（数据层保持 snake_case），可作为参考
- 修改接口后，所有引用该接口的地方都需要同步更新
- service 层的转换使用明确的字段映射，不用 as 类型断言

先 Read 每个文件理解当前实现，再逐步修改。修改完成后列出所有变更。`, {
    label: '修复:数据层映射',
    phase: 'P1 架构+前端',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 src/main/ipc/ 的接口契约问题。

**任务 1 — 通道命名规范化**（24 处）
规则：{domain}:{action}，动作词为 list/getById/create/update/delete

需修复的文件和通道：
- proxy.ts: proxy:status→proxy:get, proxy:start→proxy:start(保留), proxy:stop→proxy:stop(保留), proxy:restart→proxy:restart(保留), proxy:setPort→proxy:updatePort, proxy:getDebugMode→proxy:get, proxy:setDebugMode→proxy:update
- update/ipc.ts: update:check→update:check(保留), update:download→update:download(保留), update:install→update:install(保留), update:skip-version→update:skipVersion, update:get-config→update:getConfig, update:set-config→update:setConfig, update:getCurrentVersion→update:getCurrentVersion(保留)
- agents.ts: agent:get→agent:getById, agent:listConfigs→agent:listConfigs(保留), agent:getConfig→agent:getConfig(保留), agent:createConfig→agent:createConfig(保留), agent:updateConfig→agent:updateConfig(保留), agent:deleteConfig→agent:deleteConfig(保留), agent:switchConfig→agent:switchConfig(保留)
- conversation.ts: conversation:get→conversation:getById, conversation:messages→conversation:listMessages, conversation:addMessage→conversation:createMessage
- logs.ts: logs:query→logs:list, logs:stats→logs:stats(保留), logs:statsDetailed→logs:statsDetailed(保留)

**注意**：通道名变更后，preload 层和 renderer 层的 IPC 调用也需要同步更新！
- 检查 src/preload/ 中的通道名映射
- 检查 src/renderer/lib/ipc.ts 中的通道名

**任务 2 — IPC handler 返回 undefined**（6 处）
- proxy.ts: stop/setPort/setDebugMode → 返回 { success: true }
- update/ipc.ts: install/skip-version/set-config → 返回 { success: true }

先 Read 相关文件，理解当前实现，再逐步修改。修改完成后列出所有变更。`, {
    label: '修复:IPC契约',
    phase: 'P1 架构+前端',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 src/renderer/lib/queries/ 中的 queryKey 格式不合规。

规则：queryKey 必须使用 ['domain', 'action', ...params] 层级化数组格式。

**需修复的文件和 queryKey**：
1. providers.ts: ['providers'] → ['providers', 'list']
2. apiKeys.ts: ['apiKeys'] → ['apiKeys', 'list']
3. conversations.ts: ['conversations'] → ['conversations', 'list']
4. agents.ts: ['agents'] → ['agents', 'list'], ['agents', id] → ['agents', 'getById', id], ['agent-configs', agentId] → ['agentConfigs', 'list', agentId]
5. modelMappings.ts: ['model-mappings'] → ['modelMappings', 'list'], ['models'] → ['models', 'list']
6. update.ts: ['update-config'] → ['update', 'config'], ['current-version'] → ['update', 'currentVersion']
7. stats.ts: ['stats', '7d'] → ['stats', 'get', '7d'], ['stats', '24h'] → ['stats', 'get', '24h'], ['stats', '30d'] → ['stats', 'get', '30d']
8. logs.ts: ['logs', page, limit] → ['logs', 'query', page, limit]

**同时修复 invalidateQueries 引用**：
所有 mutation 的 onSuccess/invalidateQueries 中引用的 queryKey 也要同步更新。

**注意**：
- proxy.ts 的 queryKey 已合规（['proxy', 'status']、['proxy', 'debugMode']），不需要修改
- features/chat/hooks/useConversationManager.ts 中的 invalidateQueries 也要更新

先 Read 每个文件，找到所有 queryKey 和 invalidateQueries 引用，再逐个修改。修改完成后列出所有变更。`, {
    label: '修复:queryKey',
    phase: 'P1 架构+前端',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 src/ 中布尔值缺少 is/has/can 前缀的问题。

**需修复的标识符和文件**：

1. available: boolean → isAvailable
   - src/shared/types.ts: UpdateCheckResult.available
   - src/main/update/manager.ts: UpdateCheckResult.available

2. autoCheck: boolean → isAutoCheckEnabled
   - src/shared/types.ts: UpdateConfig.autoCheck
   - src/main/update/config.ts: UpdateConfig.autoCheck

3. allowPrerelease: boolean → isPrereleaseAllowed
   - src/shared/types.ts: UpdateConfig.allowPrerelease
   - src/main/update/config.ts: UpdateConfig.allowPrerelease

4. running: boolean → isRunning
   - src/main/proxy/manager.ts: ProxyConfig.running
   - src/renderer/lib/types.ts: ProxyStatus.running

5. allowed: boolean → isAllowed
   - src/main/proxy/rate-limiter.ts: RateLimitResult.allowed

6. done: boolean → isDone
   - src/main/proxy/converter/types.ts: StreamState.done

7. error: boolean → hasError
   - src/renderer/features/chat/hooks/useChatStream.ts: StreamMessage.error
   - src/renderer/features/chat/components/MessageList.tsx: Message.error
   - src/renderer/features/chat/components/ChatMessage.tsx: ChatMessageProps.error

8. active: boolean → isActive
   - src/renderer/components/ui/status-badge.tsx: StatusBadgeProps.active

9. collapsed: boolean → isCollapsed
   - src/renderer/features/chat/components/ConversationSidebar.tsx: ConversationSidebarProps.collapsed

10. showAddDialog: boolean → isAddDialogVisible
    - src/renderer/features/agent/components/AgentFormDialog.tsx

11. streamLoading: boolean → isStreamLoading
    - src/renderer/features/chat/components/ChatInputArea.tsx

12. updateAvailable: boolean → isUpdateAvailable
    - src/renderer/hooks/useUpdateCheck.ts

13. submitDisabled: boolean → isSubmitDisabled
    - src/renderer/components/ui/form-dialog.tsx

14. editDisabled / deleteDisabled → isEditDisabled / isDeleteDisabled
    - src/renderer/components/ui/action-buttons.tsx

**修复策略**：
- 修改接口/类型定义中的字段名
- 同步修改所有引用该字段的地方（Read + Grep 查找）
- 特别注意 shared/types.ts 的修改影响 main/ 和 renderer/ 两侧

先 Read shared/types.ts 和相关文件，再用 Grep 查找所有引用，最后逐个修改。修改完成后列出所有变更。`, {
    label: '修复:布尔前缀',
    phase: 'P1 架构+前端',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 src/ 中 .catch(() => {}) 静默吞没错误的问题。

**需修复的位置**：

后端（3 处）：
1. src/main/proxy/handler.ts:335 — .catch(() => {}) → .catch((e) => logger.debug('SSE log extraction failed', { error: e instanceof Error ? e.message : String(e) }))
2. src/main/proxy/handler.ts:347 — 同上
3. src/main/proxy/logger.ts:113 — .catch(() => {}) → .catch((e) => logger.debug('Request body read failed', { error: e instanceof Error ? e.message : String(e) }))

前端（6 处）：
4. src/renderer/App.tsx:69 — .catch(() => {}) → .catch((e) => console.error('Backend ready check failed', e))
5. src/renderer/hooks/useUpdateCheck.ts:51 — .catch(() => {}) → .catch((e) => console.error('Version check failed', e))
6. src/renderer/features/chat/hooks/useChatPage.ts:112 — .catch(() => {}) → .catch((e) => console.error('Title update failed', e))
7. src/renderer/features/chat/hooks/useChatPage.ts:128 — .catch(() => {}) → .catch((e) => console.error('Message save failed', e))
8. src/renderer/features/chat/hooks/useChatStream.ts:60 — readerRef.current?.cancel().catch(() => {}) → 保留（流取消清理，低风险）
9. src/renderer/features/chat/hooks/useChatStream.ts:223 — 同上，保留

**注意**：useChatStream.ts 的 2 处是 ReadableStream.cancel() 清理调用，属于惯用模式，保留不改。

先 Read 每个文件确认行号，再用 Edit 修改。修改完成后列出所有变更。`, {
    label: '修复:catch吞没',
    phase: 'P1 架构+前端',
    model: 'sonnet',
  }),
])

// ── Phase 4: P1 可观测性补充 ──
phase('P1 可观测性补充')

const [logLevelFix, magicNumberFix, handlerReturnFix] = await parallel([
  () => agent(`你是修复专家。修复 src/main/proxy/ 中日志级别使用不当的问题。

**需修复的位置**：
1. src/main/proxy/handler.ts — 3 处 INFO 应改为 WARN/ERROR：
   - 约第 189 行：CONVERSION_ERROR 用 logger.info → 改为 logger.warn
   - 约第 273 行：UPSTREAM_ERROR_BODY 用 logger.info → 改为 logger.warn
   - 约第 407 行：PROXY_ERROR 用 logger.info → 改为 logger.error

2. src/main/proxy/stream.ts — 1 处 INFO 应改为 ERROR：
   - 约第 182 行：SSE_CONVERSION_ERROR 用 logger.info → 改为 logger.error

先 Read 每个文件确认准确行号和上下文，再用 Edit 修改。修改完成后列出所有变更。`, {
    label: '修复:日志级别',
    phase: 'P1 可观测性补充',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。提取 src/main/ 中的魔法数字为命名常量。

**需修复的位置**：
1. src/main/proxy/converter/request.ts:95 — 4096 (max_tokens 默认值)
   → const DEFAULT_MAX_TOKENS = 4096

2. src/main/proxy/handler.ts — 4000 (日志 body 截断长度，多处)
   → const MAX_LOG_BODY_LENGTH = 4000

3. src/main/proxy/logger.ts:147 — 4000 (同上)
   → 引用同一常量或本地定义

4. src/main/proxy/rate-limiter.ts:34 — 60000 (默认窗口 1 分钟)
   → const DEFAULT_WINDOW_MS = 60_000

5. src/main/db/api-keys.ts — 36 (随机字节数), 8 (keyPrefix 长度), 60 (默认 rateLimit)
   → const KEY_RANDOM_BYTES = 36; const KEY_PREFIX_LENGTH = 8; const DEFAULT_RATE_LIMIT = 60

6. src/main/db/logs-writer.ts:116 — 10 * 1024 * 1024 (10MB 阈值)
   → const SMALL_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024

7. src/renderer/hooks/useClipboard.ts:20 — 2000 (2 秒重置)
   → const RESET_DELAY_MS = 2000

8. src/main/index.ts:107 — 3000 (更新检查延迟)
   → const UPDATE_CHECK_DELAY_MS = 3000

9. src/renderer/hooks/useUpdateCheck.ts:76 — 1000 (安装延迟)
   → const INSTALL_DELAY_MS = 1000

**规则**：
- 常量定义在使用处附近（文件顶部或函数外部）
- 使用 UPPER_SNAKE_CASE
- 添加注释说明含义

先 Read 每个文件确认准确行号，再用 Edit 修改。修改完成后列出所有变更。`, {
    label: '修复:魔法数字',
    phase: 'P1 可观测性补充',
    model: 'sonnet',
  }),

  () => agent(`你是修复专家。修复 src/main/ipc/ 中 handler 返回 undefined 和使用位置参数的问题。

**任务 1 — handler 返回 undefined**（6 处）
需返回 { success: true }：
- src/main/ipc/proxy.ts: proxy:stop handler
- src/main/ipc/proxy.ts: proxy:setPort (改名后可能是 proxy:updatePort) handler
- src/main/ipc/proxy.ts: proxy:setDebugMode (改名后可能是 proxy:update) handler
- src/main/ipc/update/ipc.ts: update:install handler
- src/main/ipc/update/ipc.ts: update:skipVersion handler
- src/main/ipc/update/ipc.ts: update:setConfig handler

**任务 2 — 位置参数改为单数据对象**（2 处）
- src/main/ipc/conversations.ts: conversation:createMessage (原 addMessage) — 4 个位置参数改为 data: { conversationId, role, content, thinking? }
- src/main/ipc/apikeys.ts: apikey:create — 2 个位置参数改为 data: { name, rateLimit? }

**注意**：位置参数改为单数据对象后，需要同步更新：
- src/preload/ 中对应的 IPC 调用
- src/renderer/lib/ipc.ts 中的类型定义
- src/renderer/lib/queries/ 中的 mutation 调用

先 Read 每个文件理解当前实现，再逐步修改。修改完成后列出所有变更。`, {
    label: '修复:handler返回值',
    phase: 'P1 可观测性补充',
    model: 'sonnet',
  }),
])

// ── Phase 5: 验证 ──
phase('验证')

const [tscCheck, testCheck, lintCheck] = await parallel([
  () => agent(`运行 TypeScript 编译检查。

执行命令：npx tsc --noEmit

如果报错，分析错误并修复。常见错误：
- 类型不匹配（布尔值重命名后）
- 导入路径错误
- 接口字段名变更后未同步引用

修复所有编译错误后再次运行 tsc --noEmit 确认通过。`, {
    label: '验证:TSC编译',
    phase: '验证',
    model: 'sonnet',
  }),

  () => agent(`运行测试套件。

执行命令：npm test

如果测试失败，分析失败原因并修复。常见问题：
- 布尔值重命名后测试断言未更新
- queryKey 格式变更后测试未同步
- 函数拆分后测试调用路径变化

修复所有测试失败后再次运行 npm test 确认全部通过。`, {
    label: '验证:测试',
    phase: '验证',
    model: 'sonnet',
  }),

  () => agent(`运行 ESLint 检查。

执行命令：npm run lint

如果报错，分析并修复常见 lint 问题：
- 未使用的导入（函数拆分后可能产生）
- 未使用的变量
- 格式问题

修复所有 lint 错误后再次运行确认通过。`, {
    label: '验证:Lint',
    phase: '验证',
    model: 'sonnet',
  }),
])

return {
  summary: {
    phase1: { security: securityFix, consoleIndex: consoleFix1, consoleUpdate: consoleFix2 },
    phase2: { handlerSplit, requestSplit, sseStreamSplit },
    phase3: { dataLayerFix, ipcNamingFix, queryKeyFix, boolPrefixFix, catchSwallowFix },
    phase4: { logLevelFix, magicNumberFix, handlerReturnFix },
    phase5: { tscCheck, testCheck, lintCheck },
  },
}
