# LLM Gateway
Electron 42 桌面客户端 — 多 LLM 供应商统一代理 + 聊天 + 仪表盘

## Build & Test
- `npm run dev` — electron-vite dev | `npm run build` — 全量构建
- `npm test` — vitest run | `npm run lint` — eslint src/
- `npx tsc --noEmit` — 类型检查（不产出文件）
- `npx vitest run <path>` — 单文件/目录测试

## 全局铁律
- 中文输出，技术术语保留英文
- 详细规则见 `.claude/rules/00-core.md`（禁止项 + 必须项）

## 规则模块（按需加载）
- `.claude/rules/00-core.md` — 全局禁止项+必须项
- `.claude/rules/10-tech-stack.md` — 版本红线和禁止 API
- `.claude/rules/20-directory.md` — 目录边界、导入规则、类型治理
- `.claude/rules/30-main.md` — 主进程 domain 模式 + proxy 路由约定
- `.claude/rules/31-renderer.md` — 渲染进程 feature 模式
- `.claude/rules/50-testing.md` — 测试约定
- `.claude/rules/60-security.md` — 安全要求

## 架构速览
Renderer → preload IPC → ipc/index.ts → domains/{name}.service.ts → db（业务 CRUD 三层）
Renderer → HTTP (localhost:8080) → Hono proxy → upstream Provider（仅 Chat 对话）
例外：shell/window/update 事件走 IPC

## 已知问题
- `logs.test.ts` "10000 entries" 测试超时 — 预存问题，非本次变更引入，忽略
