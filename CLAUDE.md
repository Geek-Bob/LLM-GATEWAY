# LLM Gateway

## Build & Test
- `npm run dev` — electron-vite dev (Electron + Vite)
- `npm run build` — electron-vite build (全量构建)
- `npm test` — vitest run (294 tests)
- `npm run lint` — eslint src/ (flat config: eslint.config.mjs)

## Architecture
- Electron 42 + frameless window (frame:false, titleBarStyle:hidden, show:!isDev)
- electron-vite 5.x sets process.env.ELECTRON_RENDERER_URL — 必须用它而非硬编码端口
- Vite 开发端口 auto-increment (5173→5174+)，ELECTRON_RENDERER_URL 自动适配
- 启动 dev 前逐个 PID kill 所有 node/electron：`for pid in $(wmic ... get ProcessId | grep -E "[0-9]"); do wmic ... where "ProcessId=$pid" call terminate; done`（taskkill/wmic 批量均不可靠）
- Vite dev Windows 上 esbuild 因 Defender 锁定 deps_temp_* 文件失败，需设 TMPDIR/TEMP/TMP 到 C 盘再 npm run dev
- 主进程代码改后 HMR 不重启，需 kill 旧进程再 `npm run dev`
- sql.js 替代 better-sqlite3（无需原生编译），config.db 单文件持久化
- NDJSON 日志分片：logs/ 目录下最多 10 文件×1 万行/文件，无需日志 DB
- 代理服务器：hono (src/main/proxy/server.ts)，支持 Anthropic/OpenAI 兼容格式路由
- 代理 token 提取：非流式读 responseBody.usage；流式 OpenAI 读最后 chunk.usage，Anthropic 读 message_start.usage + message_delta.usage
- IPC：contextBridge + ipcMain.handle，window.electronAPI 暴露给渲染进程
- Chat 通过 IPC chat:send → main process → localhost:8080（代理）→ provider，不直连
- 代理认证：支持 Authorization: Bearer 和 X-Api-Key 两种方式；Bearer 前缀大小写不敏感
- 代理服务通过 proxy/manager.ts 管理生命周期（start/stop/restart），IPC 暴露 proxy:start/stop/restart/setPort
- gateway API key 明文存储（key_encrypted 列），Chat 通过代理时使用
- 调试日志写入 os.tmpdir()/llm-gateway-*.log，不用硬编码路径
- 渲染进程传模型名只用 model ID（如 gpt-4），不加 provider 前缀
- 渲染进程：React 19 + react-router-dom v7 + recharts + framer-motion
- recharts Tooltip formatter value 为 ValueType | undefined，需 Number(value ?? 0) 而非 .toLocaleString()

## Skill 使用铁律

在任何回应或行动之前，必须先调用 Skill 工具检查是否有适用的技能。这是不可协商的。

### 开发阶段 × 技能路由

| 阶段 | 触发条件 | 技能 | 职责 |
|------|----------|------|------|
| **需求/设计** | 新功能、新组件、行为变更 | `superpowers:brainstorming` | 理解需求、设计方案、写规格文档 |
| **写计划** | 有规格需要多步骤实施 | `superpowers:writing-plans` | 拆任务、写实施计划、TDD 步骤 |
| **执行计划** | 有书面计划要执行 | `superpowers:subagent-driven-development` | 逐任务实现 + spec review + code review |
| **前端 UI** | 页面/组件视觉设计 | `frontend-design:frontend-design` | 高审美、现代化 UI 实现 |
| **修 Bug** | 测试失败/意外行为/错误 | `superpowers:systematic-debugging` | P1 调查→P2 假设→P3 验证→P4 修复 |
| **测试先行** | 实现新函数/修复 bug | `superpowers:test-driven-development` | Red→Green→Refactor |
| **代码审查** | 完成任务后、合并前 | `superpowers:requesting-code-review` | 派审查者子代理检查代码质量 |
| **验证** | 声称完成/修复/通过前 | `superpowers:verification-before-completion` | 先运行验证命令，再声称成功 |
| **收尾** | 测试全过、准备集成 | `superpowers:finishing-a-development-branch` | 合并/PR/保留/放弃 4 选 1 |

### 技能优先级
1. **流程技能优先**（brainstorming、debugging）— 决定如何接近任务
2. **实施技能其次**（frontend-design）— 指导执行

### 铁律（不可协商）
- **任何编程动作必须先调 Skill 工具**，没有"简单任务"例外
- 用"简单"当借口不调技能 = 违规
- 调了技能不遵守其规则 = 违规

## Conventions
- ESLint: flat config, @typescript-eslint/no-explicit-any 为 warn（有意使用）
- 测试：vitest + jsdom，每文件 co-located __tests__/ 目录
- 日志：NDJSON 分片 + sql.js 预计算统计（仪表盘不读 NDJSON）
- 仪表盘统计：request_stats_provider 表按 (date, hour, provider_id, model) 聚合；Dashboard 需分别拉取 statsDetailed('24h') 和 statsDetailed('30d')
- NDJSON log entries 含 auto-incrementing id 字段；queryLogs 返回过滤后 total
