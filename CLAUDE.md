# LLM Gateway
Electron 42 桌面客户端 — 多 LLM 供应商统一代理 + 聊天 + 仪表盘

## Build & Test
- `npm run dev` — electron-vite dev | `npm run build` — 全量构建
- `npm test` — vitest run | `npm run lint` — eslint src/

## 全局铁律
- 新功能 SDD（spec）→ TDD（Red → Green → Refactor），无例外
- 数据请求走 TanStack Query，禁止组件内裸 fetch
- 中文输出，技术术语保留英文

## 规则模块（按需加载）
- `.claude/rules/00-core.md` — 全局禁止项+必须项
- `.claude/rules/10-tech-stack.md` — 版本红线和禁止 API
- `.claude/rules/20-directory.md` — 目录边界和导入规则
- `.claude/rules/30-main.md` — 主进程 domain 模式（模板）
- `.claude/rules/31-renderer.md` — 渲染进程 feature 模式（模板）
- `.claude/rules/40-api.md` — Hono API 设计规范
- `.claude/rules/50-testing.md` — 测试约定
- `.claude/rules/60-security.md` — 安全要求

## 架构速览
Renderer → HTTP (localhost:8080) → Hono → domain/* → proxy/* → Provider
例外：apiKeys CRUD 走 IPC（bootstrap），shell/window/update 事件走 IPC
