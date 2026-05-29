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
- 渲染进程：React 19 + react-router-dom v7 (HashRouter) + shadcn/ui (Radix) + TanStack Query + recharts + framer-motion + Lucide React + Sonner
- shadcn/ui 组件在 `src/renderer/components/ui/`，通过 CLI 或手动引入，使用 `cn()` (clsx + tailwind-merge) 合并类名
- TanStack Query hooks 在 `src/renderer/lib/queries/`，每个数据域一个文件，替代 useEffect+useState 模式
- `dark` 类必须在 `<html>` 元素上（`main.tsx` 中 `document.documentElement.classList.add('dark')`），Radix Portal 组件脱离 DOM 树需要全局作用域
- Tailwind CSS v4 使用 CSS-first 配置（`@theme inline` 指令），不创建 tailwind.config.ts
- 浏览器中 `window.electronAPI` 不存在，Chat 等 IPC 调用需 `api?.chat` null guard
- macOS 26 Liquid Glass 色系：深空灰背景 `hsl(220,14%,9%)`，卡片 `hsl(220,12%,13%)`，冷蓝调边框 `hsl(220,10%,20%)`
- recharts Tooltip formatter value 为 ValueType | undefined，需 Number(value ?? 0) 而非 .toLocaleString()

## Skill 使用铁律
在任何回应或行动之前，必须先调用 Skill 工具检查是否有适用的技能。这是不可协商的。

## Conventions                                                                                                                                                                                               
- 迁移 CSS 时注意移除 body 上的 `user-select: none`（Electron 遗留），文字应默认可选中 
- ESLint: flat config, @typescript-eslint/no-explicit-any 为 warn（有意使用）
- 测试：vitest + jsdom，每文件 co-located __tests__/ 目录
- 日志：NDJSON 分片 + sql.js 预计算统计（仪表盘不读 NDJSON）
- 仪表盘统计：request_stats_provider 表按 (date, hour, provider_id, model) 聚合；Dashboard 需分别拉取 statsDetailed('24h') 和 statsDetailed('30d')
- NDJSON log entries 含 auto-incrementing id 字段；queryLogs 返回过滤后 total
- `new-api-main/` 目录是外部项目残留，其空测试套件会报 FAIL，忽略即可
