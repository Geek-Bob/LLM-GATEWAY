export const meta = {
  name: 'code-fix',
  description: '全量代码修复：182 个问题（24 P0 + 77 P1 + 81 P2），5 阶段 25 代理并行执行',
  phases: [
    { title: 'Phase 1: Domain Services' },
    { title: 'Phase 2: Backend Infrastructure' },
    { title: 'Phase 3: Frontend' },
    { title: 'Phase 4: JSDoc + P2' },
    { title: 'Phase 5: Verification' },
  ],
}

// ============================================================
// Phase 1: Domain Services + Data Layer (8 agents, parallel)
// ============================================================
phase('Phase 1: Domain Services')

await parallel([
  // 1.1 创建 db/model-mappings.ts
  () => agent(
    `Task: 创建 src/main/db/model-mappings.ts 数据层模块。
Read src/main/db/providers.ts as template, then create db/model-mappings.ts with:
- findModelMapping(db, sourceModel, providerId)
- listModelMappings(db)
- createModelMapping(db, data) -> id
- updateModelMapping(db, id, data)
- deleteModelMapping(db, id)
Read db/schema.ts first to confirm model_mappings table structure.
Use db.prepare() for SQL. Add TypeScript types. Follow providers.ts code style.
Only create this one file. Run npx tsc --noEmit after.`,
    { label: '1.1:model-mappings', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.2 apikey service 工厂注入
  () => agent(
    `Task: Fix src/main/domains/apikey/apikey.service.ts — factory injection pattern.
1. Read current file + db/api-keys.ts for function signatures
2. Add db: Database param to createApiKeyService()
3. Pass db to all db/api-keys function calls (listApiKeys(db), createApiKey(db, data), etc.)
4. Remove any getDb() calls
5. Export type: export type ApiKeyService = ReturnType<typeof createApiKeyService>
Only modify domains/apikey/apikey.service.ts. Run npx tsc --noEmit after.`,
    { label: '1.2:apikey', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.3 logs service 工厂注入 + types/schema
  () => agent(
    `Task: Fix src/main/domains/logs/ — factory injection + create types/schema.
1. Read logs.service.ts + db/logs.ts
2. CREATE domains/logs/logs.types.ts — LogQuery, LogResponse, LogStatsResponse types
3. CREATE domains/logs/logs.schema.ts — Zod schemas for query params (queryLogsSchema, statsRangeSchema)
4. Add db: Database param to createLogsService()
5. Pass db to all db/logs function calls
6. If logs.service.ts imports db/providers functions, remove that dependency
Only modify domains/logs/ files. Run npx tsc --noEmit after.`,
    { label: '1.3:logs', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.4 stats service 工厂注入 + types/schema
  () => agent(
    `Task: Fix src/main/domains/stats/ — factory injection + create types/schema.
1. Read stats.service.ts + db/logs.ts (for getLogStats signature)
2. CREATE domains/stats/stats.types.ts — StatsQuery, StatsResponse types
3. CREATE domains/stats/stats.schema.ts — Zod schema for range param
4. Add db: Database param to createStatsService()
5. Pass db to getLogStats(db, ...) call
Only modify domains/stats/ files. Run npx tsc --noEmit after.`,
    { label: '1.4:stats', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.5 conversation service 改用数据层函数
  () => agent(
    `Task: Fix src/main/domains/conversation/conversation.service.ts — use data layer functions.
1. Read conversation.service.ts + db/conversations.ts
2. Remove ALL inline SQL (db.prepare(...) calls) from service
3. Replace with calls to db/conversations.ts functions (listConversations, getConversation, createConversation, updateConversation, deleteConversation, listMessages, addMessage)
4. If db/conversations.ts is missing functions, add them there
5. Keep createConversationService(db) signature, just change internal implementation
6. Keep business logic (validation, transformation) in service
Modify: domains/conversation/conversation.service.ts + possibly db/conversations.ts. Run npx tsc --noEmit after.`,
    { label: '1.5:conversation', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.6 provider service 改用数据层函数
  () => agent(
    `Task: Fix src/main/domains/provider/provider.service.ts — use data layer functions.
1. Read provider.service.ts + db/providers.ts
2. Remove ALL inline SQL from service
3. Replace with calls to db/providers.ts functions (listProviders, getProvider, createProvider, updateProvider, deleteProvider)
4. Keep rowToResponse conversion logic in service
5. Keep createProviderService(db) signature
Only modify domains/provider/provider.service.ts. Run npx tsc --noEmit after.`,
    { label: '1.6:provider', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.7 models service 改用数据层函数
  () => agent(
    `Task: Fix src/main/domains/models/models.service.ts — use data layer functions.
1. Read models.service.ts + db/providers.ts + db/model-mappings.ts (created by agent 1.1)
2. Remove ALL inline SQL from service
3. getAllModels() providers query → use listActiveProviders(db) from db/providers.ts
4. model mapping CRUD → use db/model-mappings.ts functions
5. Keep createModelsService(db) signature
Modify: domains/models/models.service.ts. Run npx tsc --noEmit after.`,
    { label: '1.7:models', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),

  // 1.8 agent service 修复 + error messages
  () => agent(
    `Task: Fix src/main/domains/agent/ — factory injection + error messages.
1. Read agent.service.ts + db/agent-configs.ts + db/agents.ts
2. Fix db/agent-configs.ts: add db param to createAgentConfigRepository(db)
3. In agent.service.ts: pass db to createAgentConfigRepository(db)
4. Fix error messages to format: 'Failed to {action} {entity}: {reason}'
   - 'Config X not found' → 'Failed to switch config: config X not found'
   - 'Agent X not found' → 'Failed to switch config: agent X not found'
5. Ensure Agent type imported correctly
Modify: domains/agent/agent.service.ts, db/agent-configs.ts. Run npx tsc --noEmit after.`,
    { label: '1.8:agent', phase: 'Phase 1: Domain Services', model: 'sonnet' }
  ),
])

// ============================================================
// Phase 2: Backend Infrastructure (5 agents, parallel)
// ============================================================
phase('Phase 2: Backend Infrastructure')

await parallel([
  // 2.1 proxy/server.ts 安全+架构+拆分
  () => agent(
    `Task: Refactor src/main/proxy/server.ts — security + architecture + split into 4 files.

This is a 901-line file that needs major refactoring. Follow these steps carefully:

STEP 1 — Read and understand the full server.ts structure.

STEP 2 — Fix security issues (API Key logging):
- Line ~319: proxyHeaders log outputs full API Key → sanitize: only show last 4 chars ('***' + value.slice(-4))
- Line ~95: auth header truncation → change to last 4 chars only
- Line ~106: tokenPrefix → change to last 4 chars only
- Line ~198-199: CLIENT_REQUEST log → change to last 4 chars only

STEP 3 — Fix architecture (remove forbidden imports):
- Remove imports from db/api-keys, db/logs, db/connection, domains/models
- Change createApp() signature to accept services object:
  createApp(services: { apiKeyService, logService, modelsService, providerService, getDb })
- Services will be created in ipc/index.ts and passed in

STEP 4 — Split into 4 files:
- proxy/server.ts — keep ONLY createApp() with route registration, import from other files
- proxy/handler.ts — export handleProxyRequest() (the 299-line function)
- proxy/stream.ts — export convertSSEStream() (the 129-line function)
- proxy/logger.ts — export tryLogEntry(), logAuthFailure() and helpers

STEP 5 — Replace all console.log/console.error with logger from core/logger.ts

STEP 6 — Fix empty catch blocks (tryLogEntry catch → at least logger.debug)

STEP 7 — Run npx tsc --noEmit to verify compilation

Files to create: proxy/handler.ts, proxy/stream.ts, proxy/logger.ts
Files to modify: proxy/server.ts
Do NOT touch proxy/manager.ts, proxy/router.ts, proxy/forwarder.ts (handled by agent 2.2).`,
    { label: '2.1:server-split', phase: 'Phase 2: Backend Infrastructure', model: 'sonnet' }
  ),

  // 2.2 proxy 辅助文件修复
  () => agent(
    `Task: Fix proxy/manager.ts + proxy/router.ts + proxy/forwarder.ts.

MANAGER.TS:
1. Add hostname: '127.0.0.1' to serve() call (line ~62) — currently listens 0.0.0.0
2. Replace all console.log/console.error with logger from core/logger.ts

ROUTER.TS:
1. Remove import of getProviderByName from db/providers
2. Change resolveProvider() to accept providerService as parameter
3. Fix error messages to format 'Failed to {action} {entity}: {reason}':
   - 'Invalid model ID format' → 'Failed to parse model ID: invalid format'
   - 'Provider not found' → 'Failed to resolve provider: provider not found'
   - 'Provider is not active' → 'Failed to resolve provider: provider is disabled'
   - 'Model not found' → 'Failed to resolve model: model not in provider whitelist'

FORWARDER.TS:
1. Move Provider type import from db/providers to shared/types.ts (add Provider to shared/types.ts if not there)
2. Update import path

Files: proxy/manager.ts, proxy/router.ts, proxy/forwarder.ts, shared/types.ts
Run npx tsc --noEmit after.`,
    { label: '2.2:proxy-helpers', phase: 'Phase 2: Backend Infrastructure', model: 'sonnet' }
  ),

  // 2.3 ipc/index.ts 拆分+校验
  () => agent(
    `Task: Refactor src/main/ipc/index.ts — split by domain + add Zod validation + fix handler logic.

STEP 1 — Read ipc/index.ts full content.

STEP 2 — Split into domain-specific files:
- ipc/providers.ts — registerProviderHandlers(db)
- ipc/apikeys.ts — registerApiKeyHandlers(db)
- ipc/conversations.ts — registerConversationHandlers(db)
- ipc/logs.ts — registerLogHandlers(db)
- ipc/stats.ts — registerStatsHandlers(db)
- ipc/proxy.ts — registerProxyHandlers(db)
- ipc/models.ts — registerModelHandlers(db)
- ipc/agents.ts — registerAgentHandlers(db)
- ipc/update.ts — registerUpdateHandlers()
- ipc/system.ts — registerSystemHandlers() (shell, window events)

STEP 3 — ipc/index.ts becomes thin orchestrator:
  import all registerXxxHandlers, call them in setupIpcHandlers(db)

STEP 4 — Add Zod validation to handlers missing it:
- logs:query → create queryLogsSchema (or import from domains/logs/logs.schema.ts)
- logs:stats → z.enum(['24h', '7d', '30d'])
- logs:statsDetailed → z.enum(['24h', '30d'])
- proxy:start/restart/setPort → port: z.number().int().min(1).max(65535).optional()
- proxy:setDebugMode → enabled: z.boolean()
- models:mapping:create → add explicit type annotation to data param

STEP 5 — Fix conversation:create handler:
- Remove getById + null check business logic
- Let service.create() return full ConversationResponse (may need to modify conversation.service.ts)

STEP 6 — Pass db to service factories:
  const apiKeyService = createApiKeyService(db)
  const logsService = createLogsService(db)
  // etc.

STEP 7 — Run npx tsc --noEmit to verify.

Files: ipc/index.ts + 10 new domain handler files
Note: agent 1.5 may have modified conversation.service.ts — read it fresh.`,
    { label: '2.3:ipc-split', phase: 'Phase 2: Backend Infrastructure', model: 'sonnet' }
  ),

  // 2.4 db/logs.ts 拆分
  () => agent(
    `Task: Split src/main/db/logs.ts (771 lines) into 3 files + barrel export.

STEP 1 — Read db/logs.ts full content.

STEP 2 — Create 3 new files:
- db/logs-writer.ts — writeLogEntry(), rotateLogs(), loadMeta(), saveMeta(), getFileList(), countLines()
- db/logs-reader.ts — queryLogs(), getLogEntry(), getLogDetail() (if exists)
- db/logs-stats.ts — getLogStats(), getDetailedStats()

STEP 3 — Keep db/logs.ts as barrel export:
  export * from './logs-writer'
  export * from './logs-reader'
  export * from './logs-stats'

STEP 4 — Fix empty catch blocks in the new files:
- loadMeta catch → logger.debug('Failed to load logs meta', { error })
- saveMeta catch → logger.debug('Failed to save logs meta', { error })
- getFileList catch → logger.debug('Failed to list log files', { error })
- countLines catch → logger.debug('Failed to count lines', { error })

STEP 5 — Add magic number comments:
- Buffer.alloc(64 * 1024) → // 64KB buffer, balances memory vs read efficiency
- needLines * 10 → // Over-read 10x to compensate for filter淘汰

Files: db/logs.ts, db/logs-writer.ts(new), db/logs-reader.ts(new), db/logs-stats.ts(new)
Run npx tsc --noEmit after.`,
    { label: '2.4:logs-split', phase: 'Phase 2: Backend Infrastructure', model: 'sonnet' }
  ),

  // 2.5 db agents 修复
  () => agent(
    `Task: Fix src/main/db/agents.ts + db/agent-configs.ts — repository patterns.

1. Read db/agents.ts and db/agent-configs.ts
2. If agent.service.ts (modified by agent 1.8) passes db to createAgentConfigRepository, update the function signature
3. Ensure createAgentConfigRepository(db: Database) accepts db param
4. Ensure createAgentRepository(db: Database) accepts db param (if not already)
5. Fix function lengths if over 50 lines (split into smaller functions)

Files: db/agents.ts, db/agent-configs.ts
Run npx tsc --noEmit after.`,
    { label: '2.5:db-agents', phase: 'Phase 2: Backend Infrastructure', model: 'sonnet' }
  ),
])

// ============================================================
// Phase 3: Frontend (8 agents, parallel)
// ============================================================
phase('Phase 3: Frontend')

await parallel([
  // 3.1 App.tsx 修复
  () => agent(
    `Task: Fix src/renderer/App.tsx — direct IPC + relative paths + hook extraction.

STEP 1 — Read App.tsx + lib/ipc.ts to understand the abstraction layer.

STEP 2 — Replace all window.electronAPI usage with api from @/lib/ipc:
- window.electronAPI.backend → api.backend
- window.electronAPI.update → api.update
- window.electronAPI.onReady → api.backend.onReady
- etc.

STEP 3 — Fix ALL relative paths to @/ alias:
- './components/Layout' → '@/components/Layout'
- './pages/Dashboard' → '@/pages/Dashboard'
- './pages/Providers' → '@/pages/Providers'
- './pages/ApiKeys' → '@/pages/ApiKeys'
- './pages/Logs' → '@/pages/Logs'
- './pages/Chat' → '@/pages/Chat'
- './pages/Settings' → '@/pages/Settings'
- './pages/ModelMappings' → '@/pages/ModelMappings'
- './pages/Agents' → '@/pages/Agents'
- './components/ui/sonner' → '@/components/ui/sonner'
- './lib/queries/update' → '@/lib/queries/update'

STEP 4 — Extract update logic to hooks/useUpdateCheck.ts:
- Create new file hooks/useUpdateCheck.ts
- Move updateAvailable, updateProgress, downloaded, handleInstall, handleDownload, handleSkip logic
- App.tsx calls useUpdateCheck() hook

STEP 5 — Add JSDoc to App() function

Files: App.tsx, hooks/useUpdateCheck.ts(new)
Run npx tsc --noEmit after.`,
    { label: '3.1:App', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.2 Agents.tsx 拆分
  () => agent(
    `Task: Split src/renderer/pages/Agents.tsx (385 lines) into subcomponents.

STEP 1 — Read Agents.tsx + features/agent/ directory structure.

STEP 2 — Create subcomponents in features/agent/components/:
- AgentList.tsx — table/list rendering (extract from AgentsPage)
- AgentFormDialog.tsx — create/edit dialog (extract FormDialog usage)
- AgentDetailPanel.tsx — detail/expand view (if exists)

STEP 3 — Slim down pages/Agents.tsx to thin orchestrator (30-50 lines):
  - Import and compose subcomponents
  - Use pageVariants + childVariants for page animation

STEP 4 — Fix any relative paths → @/ alias

STEP 5 — Add JSDoc to all exported components

Files: pages/Agents.tsx, features/agent/components/AgentList.tsx(new), features/agent/components/AgentFormDialog.tsx(new), possibly AgentDetailPanel.tsx(new)
Run npx tsc --noEmit after.`,
    { label: '3.2:Agents', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.3 Providers.tsx 拆分
  () => agent(
    `Task: Split src/renderer/pages/Providers.tsx (315 lines) into subcomponents.

STEP 1 — Read Providers.tsx + features/provider/ directory.

STEP 2 — Create subcomponents in features/provider/components/:
- ProviderList.tsx — table with status badges
- ProviderFormDialog.tsx — create/edit dialog

STEP 3 — Fix native <label> → Label component (5 occurrences)

STEP 4 — Slim down pages/Providers.tsx (30-50 lines)

STEP 5 — Fix relative paths → @/ alias, add JSDoc

Files: pages/Providers.tsx, features/provider/components/ProviderList.tsx(new), features/provider/components/ProviderFormDialog.tsx(new)
Run npx tsc --noEmit after.`,
    { label: '3.3:Providers', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.4 ApiKeys.tsx 拆分
  () => agent(
    `Task: Split src/renderer/pages/ApiKeys.tsx (285 lines) into subcomponents.

STEP 1 — Read ApiKeys.tsx + features/apikey/ directory.

STEP 2 — Create subcomponents in features/apikey/components/:
- ApiKeyList.tsx — table with copy/mask actions
- ApiKeyFormDialog.tsx — create/edit dialog

STEP 3 — Fix native <label> → Label component (3 occurrences)

STEP 4 — Slim down pages/ApiKeys.tsx (30-50 lines)

STEP 5 — Fix relative paths, add JSDoc

Files: pages/ApiKeys.tsx, features/apikey/components/ApiKeyList.tsx(new), features/apikey/components/ApiKeyFormDialog.tsx(new)
Run npx tsc --noEmit after.`,
    { label: '3.4:ApiKeys', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.5 Dashboard.tsx 拆分
  () => agent(
    `Task: Split src/renderer/pages/Dashboard.tsx (288 lines) into subcomponents.

STEP 1 — Read Dashboard.tsx + features/dashboard/components/ (StatsCard.tsx, StatusBar.tsx, StatsCharts.tsx already exist).

STEP 2 — Extract remaining logic:
- DashboardStats.tsx — grid of StatsCard components
- ProviderStatusList.tsx — provider online/offline list (if in Dashboard)

STEP 3 — Slim down pages/Dashboard.tsx (30-50 lines)

STEP 4 — Fix relative paths, add JSDoc

Files: pages/Dashboard.tsx, features/dashboard/components/DashboardStats.tsx(new), possibly ProviderStatusList.tsx(new)
Run npx tsc --noEmit after.`,
    { label: '3.5:Dashboard', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.6 ModelMappings.tsx 拆分
  () => agent(
    `Task: Split src/renderer/pages/ModelMappings.tsx (234 lines) into subcomponents.

STEP 1 — Read ModelMappings.tsx + features/model-mapping/ directory.

STEP 2 — Create subcomponents in features/model-mapping/components/:
- MappingList.tsx — table of model mappings
- MappingFormDialog.tsx — create/edit dialog

STEP 3 — Fix native <label> → Label component (2 occurrences)

STEP 4 — Slim down pages/ModelMappings.tsx (30-50 lines)

STEP 5 — Fix relative paths, add JSDoc

Files: pages/ModelMappings.tsx, features/model-mapping/components/MappingList.tsx(new), features/model-mapping/components/MappingFormDialog.tsx(new)
Run npx tsc --noEmit after.`,
    { label: '3.6:ModelMappings', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.7 Chat.tsx 拆分
  () => agent(
    `Task: Split src/renderer/pages/Chat.tsx (230 lines) into subcomponents.

STEP 1 — Read Chat.tsx + features/chat/components/ (ChatInput, ChatMessage, ChatToolbar, ConversationSidebar already exist).

STEP 2 — Extract remaining logic if any subcomponents are missing.

STEP 3 — Slim down pages/Chat.tsx (30-50 lines)

STEP 4 — Fix relative paths, add JSDoc

Files: pages/Chat.tsx, possibly features/chat/components/new files
Run npx tsc --noEmit after.`,
    { label: '3.7:Chat', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),

  // 3.8 组件修复 + 测试路径
  () => agent(
    `Task: Fix ChatInput.tsx + ConversationSidebar.tsx + test file paths.

CHATINPUT.TX:
1. Replace native <textarea> with Textarea from @/components/ui/textarea
2. Replace inline style={{ maxHeight: 200, fontFamily: 'inherit' }} with Tailwind classes

CONVERSATIONSIDEBAR.TX:
1. Replace <motion.button> with Button asChild pattern (3 occurrences):
   <Button asChild variant="ghost" size="sm"><motion.button whileTap={{scale:0.95}} ...>...</motion.button></Button>

TEST FILES:
1. pages/__tests__/Chat.test.tsx — fix relative paths to @/ alias
2. features/update/components/__tests__/DownloadProgress.test.tsx — fix relative path
3. features/update/components/__tests__/UpdateDialog.test.tsx — fix relative path
4. features/update/components/__tests__/UpdateButton.test.tsx — fix relative path

Files: features/chat/components/ChatInput.tsx, features/chat/components/ConversationSidebar.tsx, 4 test files
Run npx tsc --noEmit after.`,
    { label: '3.8:component-fixes', phase: 'Phase 3: Frontend', model: 'sonnet' }
  ),
])

// ============================================================
// Phase 4: JSDoc + P2 (3 agents, parallel)
// ============================================================
phase('Phase 4: JSDoc + P2')

await parallel([
  // 4.1 后端 JSDoc + 错误消息格式
  () => agent(
    `Task: Add JSDoc to backend exported functions + fix error message formats.

JSDOC — Add to all exported functions/classes in src/main/:
- domains/**/service.ts — all exported functions
- proxy/converter/sse.ts — convertSSEEvent()
- proxy/manager.ts — setDebugMode()
- proxy/rate-limiter.ts — RateLimiter class
Format: /** Description. @param name - desc. @returns desc. */

ERROR MESSAGES — Fix to format 'Failed to {action} {entity}: {reason}':
- proxy/router.ts lines 29/50/54/58 (if not fixed by agent 2.2)
- domains/agent/agent.service.ts (if not fixed by agent 1.8)
- ipc/index.ts line 183 conversation:create error

Files: src/main/**/*.ts (many files, JSDoc additions only + error message fixes)
Do NOT modify any logic, only add JSDoc comments and fix error strings.`,
    { label: '4.1:backend-jsdoc', phase: 'Phase 4: JSDoc + P2', model: 'sonnet' }
  ),

  // 4.2 前端 JSDoc + 常量命名
  () => agent(
    `Task: Add JSDoc to frontend exported functions + fix constant naming.

JSDOC — Add to all exported functions/components in src/renderer/:
- pages/*.tsx — all page components
- components/Layout.tsx, TitleBar.tsx, ErrorBoundary.tsx
- features/*/hooks/*.ts — useChatStream, useConversationManager
- features/*/components/*.tsx — StatsCard, StatusBar, ChatInput, ChatMessage, etc.
- lib/api-client.ts — setApiKey, getApiKey, ApiError, apiFetch
- lib/shiki.ts — getHighlighter
- lib/queries/*.ts — all exported hooks (providers, apikeys, etc.)
Format: /** Description. @returns desc. */

CONSTANT NAMING:
- Layout.tsx: navItems → NAV_ITEMS
- lib/api-client.ts: baseUrl → BASE_URL

Files: src/renderer/**/*.tsx, src/renderer/**/*.ts (many files)
Do NOT modify any logic, only add JSDoc and rename constants.`,
    { label: '4.2:frontend-jsdoc', phase: 'Phase 4: JSDoc + P2', model: 'sonnet' }
  ),

  // 4.3 P2 修复
  () => agent(
    `Task: Fix P2 issues — magic numbers, boolean naming, inline styles.

MAGIC NUMBERS (add comments):
- db/logs.ts: Buffer.alloc(64 * 1024) → // 64KB buffer
- db/logs.ts: needLines * 10 → // Over-read 10x for filter compensation
- lib/utils.ts: 86400000 → extract to const MS_PER_DAY = 86400000
- proxy/forwarder.ts: '2023-06-01' → add comment // Anthropic API version

BOOLEAN NAMING (only if safe, no cascading changes needed):
- shared/types.ts: available → isAvailable (check all usages first!)
- shared/types.ts: autoCheck → shouldAutoCheck
- proxy/manager.ts: running → isRunning
- update/config.ts: autoCheck → shouldAutoCheck
- renderer/lib/types.ts: running → isRunning
Only rename if the boolean is used in fewer than 5 locations. Skip if too risky.

INLINE STYLE:
- ChatInput.tsx: style={{ maxHeight: 200, fontFamily: 'inherit' }} (if not fixed by agent 3.8)

Files: various across src/
Be conservative — only fix clear-cut cases. Skip anything that might cause cascading changes.`,
    { label: '4.3:p2-fixes', phase: 'Phase 4: JSDoc + P2', model: 'sonnet' }
  ),
])

// ============================================================
// Phase 5: Verification (1 agent)
// ============================================================
phase('Phase 5: Verification')

const verifyResult = await agent(
  `Task: Run full verification suite and report results.

Run these commands in order and capture output:
1. npx tsc --noEmit — TypeScript type check
2. npm run build — full build
3. npm test — all tests (frontend + backend)
4. npm run lint — ESLint

For each command, report:
- Exit code (0 = pass, non-0 = fail)
- Error count (if any)
- First 20 lines of errors (if any)

If any command fails, analyze the errors and identify which file/agent caused the issue.

Return a structured summary:
- tsc: PASS/FAIL + details
- build: PASS/FAIL + details
- test: PASS/FAIL + details
- lint: PASS/FAIL + details
- overall: PASS/FAIL`,
  { label: '5:verification', phase: 'Phase 5: Verification', model: 'sonnet' }
)

return {
  status: 'completed',
  verification: verifyResult,
  plan: 'docs/superpowers/plans/code-fix-plan.md',
}
