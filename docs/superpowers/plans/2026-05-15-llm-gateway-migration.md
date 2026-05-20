# LLM Gateway: better-sqlite3 → sql.js + NDJSON 日志分片 迁移计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 superpowers:finishing-a-development-branch 交付

**目标：** 将 `better-sqlite3` 原生模块替换为 `sql.js`（WASM SQLite），解决 Electron 42 与 Node.js ABI 不兼容且环境无 C++ 编译工具链的问题。日志存储从单独的 SQLite 库改为 NDJSON 分片文件系统。

**架构：** 配置库（providers + api_keys + request_stats 预计算统计表）使用 sql.js 持久化到单文件 `config.db`。日志写入 NDJSON 分片文件（每文件 1 万行，最多 10 个文件，滚动删除最旧文件），仪表盘统计从预计算 `request_stats` 表查询，不读 NDJSON 文件。

**技术栈：** sql.js ^1.14.1（替换 better-sqlite3 ^12.10.0）、Node.js fs 模块（NDJSON 读写）

**追踪：** `[✅] 5/5 任务` — 全部完成

---

### Task 1: 创建 sql.js 兼容层

**文件：**
- 创建：`src/main/db/database.ts`
- 创建：`src/main/db/sql.js.d.ts`
- 删除：`src/main/types/`（旧类型目录）

**步骤：**
- [✅] **步骤 1：定义 sql.js 类型声明**
  创建 `sql.js.d.ts`，声明 `SqlJsDatabase` 接口（`run/prepare/exec/export/close`）和 `SqlJsStatement` 接口（`bind/step/getAsObject/free`），`initSqlJs` 默认导出。

- [✅] **步骤 2：实现 Database 封装类**
  - `Database.create(filePath?)` — 异步静态工厂，从文件加载或创建内存数据库，启用 `foreign_keys = ON`
  - `db.prepare(sql)` → `Statement` 对象
  - `db.exec(sql)` — 执行 DDL 后自动持久化
  - `db.pragma(sql)` — PRAGMA 查询
  - `db.save()` — 2 秒防抖写入文件（高频 stats 更新时不频繁写盘）
  - `db.saveImmediate()` — 强制立即持久化（用于进程退出前）
  - `db.close()` — 先持久化再关闭
  - `:memory:` 路径自动识别为内存数据库，跳过文件写入

- [✅] **步骤 3：实现 Statement 封装类**
  - `stmt.run(params?)` — 执行写操作，返回 `{ lastInsertRowid, changes }`
  - `stmt.get(params?)` — 查询单行，返回 `Record<string, unknown> | undefined`
  - `stmt.all(params?)` — 查询多行，返回 `Record<string, unknown>[]`
  - 自动参数转换：`{ name: val }` → `{ "@name": val }`（sql.js 需要前缀）
  - 原生值包装：`get(5)` → 自动包装为 `[5]`

- [✅] **步骤 4：验证**
  运行 `vitest run`，全部测试通过。

### Task 2: 改造配置库（connection + schema）

**文件：**
- 修改：`src/main/db/connection.ts`
- 修改：`src/main/db/schema.ts`
- 保持：`src/main/db/providers.ts`（仅 import 类型变更，SQL 不变）
- 保持：`src/main/db/api-keys.ts`（仅 import 类型变更，SQL 不变）

**步骤：**
- [✅] **步骤 1：重写 connection.ts**
  - `initDatabase(dbPath)` 改为异步，调用 `await Database.create(dbPath)`
  - `closeDatabase()` 调用 `db.close()`（内部先 saveImmediate 再关闭 sql.js）
  - `getDb()` 保持同步

- [✅] **步骤 2：重写 schema.ts**
  - 移除 `createLogsTable()` 函数（日志不再使用 SQLite）
  - 在 `createTables()` 中新增 `request_stats` 表：
    ```sql
    CREATE TABLE IF NOT EXISTS request_stats (
      stat_date TEXT NOT NULL,
      stat_hour INTEGER NOT NULL,
      total_requests INTEGER DEFAULT 0,
      total_tokens_in INTEGER DEFAULT 0,
      total_tokens_out INTEGER DEFAULT 0,
      total_errors INTEGER DEFAULT 0,
      total_duration_ms INTEGER DEFAULT 0,
      PRIMARY KEY (stat_date, stat_hour)
    )
    ```

- [✅] **步骤 3：验证**
  运行 `vitest run`，providers、api-keys、schema 测试全部通过。

### Task 3: 重写日志模块（NDJSON 分片 + 预计算统计）

**文件：**
- 重写：`src/main/db/logs.ts`

**步骤：**
- [✅] **步骤 1：实现 NDJSON 分片写入**
  - `initLogsDir(dir)` — 初始化日志目录，扫描已有文件恢复状态
  - `createLogEntry(entry)` — 追加 JSON 行到当前 NDJSON 文件
  - 当前文件达 1 万行时自动滚动：`logs-0001.ndjson` → `logs-0002.ndjson`...
  - 已达 10 个文件时，滚动删除最旧文件

- [✅] **步骤 2：实现分页查询**
  - `queryLogs({ page, limit, providerId?, dateFrom?, dateTo? })`
  - 第 1 页 = 最新文件，第 2 页 = 第二新文件，以此类推
  - 只加载单个文件到内存解析，支持客户端过滤
  - total = (已完成文件数 × 10000) + 当前文件行数

- [✅] **步骤 3：实现预计算统计**
  - `updateRequestStats({ tokensIn, tokensOut, durationMs, statusCode })` — 每次代理请求完成后调用，使用 `INSERT ... ON CONFLICT DO UPDATE` 更新小时级聚合
  - `getLogStats({ range })` — 从 `request_stats` 表查询 `SUM/AVG`，支持 24h/7d/30d

- [✅] **步骤 4：实现日志清理**
  - `cleanupOldLogs()` — 删除超出 10 个的最旧 NDJSON 文件

- [✅] **步骤 5：验证**
  运行 `vitest run`，logs 测试全部通过（含文件滚动、边界删除、预计算统计）。

### Task 4: 更新集成层（server + ipc + health + index）

**文件：**
- 修改：`src/main/proxy/server.ts`
- 修改：`src/main/ipc/index.ts`
- 修改：`src/main/utils/health.ts`
- 修改：`src/main/index.ts`

**步骤：**
- [✅] **步骤 1：更新 server.ts**
  - 移除 `import type Database from 'better-sqlite3'`
  - 移除 `logDb` 选项和上下文变量
  - `tryLogEntry` 改为调用 `createLogEntry(entry)` 和 `updateRequestStats(entry)`

- [✅] **步骤 2：更新 ipc/index.ts**
  - 移除 `setLogsDb()` 和 `logsDb` 全局变量
  - 日志 IPC 处理函数不再传 db 参数

- [✅] **步骤 3：更新 health.ts**
  - 移除 `import Database from 'better-sqlite3'`
  - `startLogCleanup()` 改为无参调用 `cleanupOldLogs()`

- [✅] **步骤 4：更新 index.ts**
  - 移除 `createLogsTable`、`setLogsDb` 导入
  - 添加 `initLogsDir` 导入和初始化
  - 配置库改为 `config.db`（而非 `gateway.db`）
  - `startLogCleanup()` 不带 db 参数

- [✅] **步骤 5：验证**
  `npm run build` 通过，`vitest run` 全部通过。

### Task 5: 更新测试 + 移除 better-sqlite3

**文件：**
- 修改：`src/main/db/__tests__/connection.test.ts`
- 修改：`src/main/db/__tests__/schema.test.ts`
- 重写：`src/main/db/__tests__/logs.test.ts`
- 修改：`src/main/db/__tests__/providers.test.ts`
- 修改：`src/main/db/__tests__/api-keys.test.ts`
- 修改：`src/main/proxy/__tests__/router.test.ts`
- 修改：`src/main/proxy/__tests__/server.test.ts`
- 修改：`package.json`

**步骤：**
- [✅] **步骤 1：更新 connection.test.ts**
  - 移除 `import Database from 'better-sqlite3'`
  - `initDatabase` 改为 `await initDatabase`

- [✅] **步骤 2：更新 schema.test.ts**
  - 移除 `createLogsTable` 测试块
  - 添加 `request_stats` 表结构验证测试
  - 移除 `import Database from 'better-sqlite3'`

- [✅] **步骤 3：重写 logs.test.ts**
  - NDJSON 文件创建验证
  - 字段存储验证（完整字段 + 可选字段默认值）
  - 分页查询验证（页码映射 + total 计算）
  - 客户端过滤验证（providerId + dateFrom/dateTo）
  - 文件滚动验证（1 万行自动滚动、超 10 文件删除最旧）
  - `cleanupOldLogs` 验证
  - 预计算统计验证（累加、错误计数、平均值、日期范围）

- [✅] **步骤 4：更新 providers.test.ts + api-keys.test.ts**
  - 添加 `beforeEach(async () => { await initDatabase(':memory:'); createTables() })`
  - 移除冗余的逐测试 initDatabase/createTables

- [✅] **步骤 5：更新 router.test.ts + server.test.ts**
  - `beforeEach`/`beforeAll` 改为 `async` + `await initDatabase`

- [✅] **步骤 6：清理依赖**
  - `package.json` 移除 `better-sqlite3` 和 `@types/better-sqlite3`
  - `npm uninstall better-sqlite3 @types/better-sqlite3`

- [✅] **步骤 7：最终验证**
  - `npm run build` ✅
  - `vitest run` ✅ 119/119 测试全部通过

---

## 验证摘要

| 检查项 | 结果 |
|--------|------|
| TypeScript 编译 | ✅ `electron-vite build` 全部通过 |
| 现有测试套件 | ✅ 119/119 通过 |
| 新 E2E 流程（sql.js 持久化） | ✅ `save()` 防抖 + `saveImmediate()` 强制写盘 |
| 新 E2E 流程（NDJSON 分片） | ✅ 写入/分页/滚动/清理全部通过 |
