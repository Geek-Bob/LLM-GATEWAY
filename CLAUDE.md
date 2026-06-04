# LLM Gateway
Electron 42 桌面客户端 — 多 LLM 供应商统一代理 + 聊天 + 仪表盘

## Build & Test
- `npm run dev` — electron-vite dev | `npm run build` — 全量构建
- `npm test` — vitest run | `npm run lint` — eslint src/
- `npx tsc --noEmit` — 类型检查（不产出文件）
- `npx vitest run <path>` — 单文件/目录测试

## 全局铁律
- 中文输出，技术术语保留英文
- 详细规则见下方规则模块表

## 规则模块
| 文件 | 触发条件 | 职责 |
|------|---------|------|
| `00-global.md` | 始终加载 | 全局禁止项+必须项 |
| `05-engineering.md` | 始终加载 | 架构思维、防御性编程、可读性 |
| `10-tech-stack.md` | 始终加载 | 版本红线和禁止 API |
| `20-directory.md` | `src/**` | 目录边界、导入规则、类型治理 |
| `30-main.md` | `src/main/**` | 主进程 domain 模式 + proxy 路由约定 |
| `31-renderer.md` | `src/renderer/**` | 渲染进程 feature 模式 |
| `50-testing.md` | `**/*.test.*` | 测试约定 |
| `60-security.md` | 始终加载 | 安全要求 |

## 架构速览
Renderer → preload IPC → ipc/index.ts → domains/{name}.service.ts → db（业务 CRUD 三层）
Renderer → HTTP (localhost:8080) → Hono proxy → upstream Provider（仅 Chat 对话）
例外：shell/window/update 事件走 IPC

## 数据存储
- SQLite（sql.js/WASM）：providers / apiKeys / conversations / messages / stats
- NDJSON 日志：每条请求一行 JSON，500 行/文件，最多 20 文件轮转（10000 条上限）
- 元数据：`logs-meta.json` 记录 entryCounter / currentFileNumber / currentFileLines
- 日志分页：文件级定位 + 正向流式读取，O(page_size) 内存

## Gotchas
- dev 模式 data 目录：`npx electron out/main/index.js` 指向 `%APPDATA%/Electron`，需手动设路径
- 日志迁移：`node scripts/migrate-logs.mjs`（行数/文件变更时重新分片）
