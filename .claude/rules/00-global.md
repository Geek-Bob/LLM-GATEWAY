---
description: 全局禁止项和必须项，覆盖所有目录和文件类型
---

# 禁止
- `console.log` → 用 `core/logger.ts`
- `core/` 中引入业务逻辑（core 只含通用工具）
- 单文件超过 500 行时必须按职责拆分（参考 converter.ts → converter/ 目录模式）

# 必须
- 新功能 SDD（spec）→ TDD（Red → Green → Refactor），无例外
- 所有代码必须加注释：导出函数/类必须有 JSDoc，关键逻辑分支必须有行内注释说明意图
- 技术架构变更后必须更新 `docs/ARCHITECTURE.md`：目录结构、数据流、模块职责描述与实际代码保持一致
- 业务 CRUD 全部走 IPC（preload → ipcMain.handle）：providers / logs / stats / conversations / apiKeys
