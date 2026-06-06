# Agent 配置管理功能设计文档

## 概述

引入 Agent 配置管理功能，支持管理多个 AI 编程助手（Claude Code、Codex、Gemini CLI 等）的 settings 文件。用户可以为每个 Agent 创建多个配置，根据情况一键切换。

## 核心目标

1. **管理 Agent 配置** — 像 CC Switch 一样，管理多个 AI 编程助手的配置文件
2. **支持多配置** — 每个 Agent 可以创建多个配置（如 default、work、personal）
3. **一键切换** — 切换时原子写入到 Agent 的实际配置路径
4. **支持自定义** — 用户可以添加自定义 Agent

## 内置 Agent 列表

| 名称 | 显示名称 | 配置路径 | 格式 |
|------|----------|----------|------|
| claude | Claude Code | ~/.claude/settings.json | json |
| claude-desktop | Claude Desktop | ~/.claude-desktop/config.json | json |
| codex | Codex | ~/.codex/config.toml | toml |
| gemini | Gemini CLI | ~/.gemini/settings.json | json |
| opencode | OpenCode | ~/.opencode/config.json | json |
| openclaw | OpenClaw | ~/.openclaw/config.json | json |
| hermes | Hermes | ~/.hermes/config.json | json |

## 数据模型

### agents 表（Agent 定义）

```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- 'claude', 'codex', 'gemini', ...
  display_name TEXT NOT NULL,          -- 'Claude Code', 'Codex', ...
  config_path TEXT NOT NULL,           -- '~/.claude/settings.json'
  config_format TEXT NOT NULL,         -- 'json', 'toml', 'env'
  is_builtin INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### agent_configs 表（配置文件）

```sql
CREATE TABLE agent_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- 'default', 'work', 'personal', ...
  content TEXT NOT NULL,               -- JSON/TOML 内容
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, name)
);
```

## 核心功能

### Agent 管理

- **listAgents()** — 列出所有 Agent（内置 + 自定义）
- **getAgent(id)** — 获取单个 Agent 详情
- **createAgent(input)** — 创建自定义 Agent
- **updateAgent(id, input)** — 更新 Agent 信息
- **deleteAgent(id)** — 删除自定义 Agent（内置不可删）

### 配置管理

- **listConfigs(agentId)** — 列出某个 Agent 的所有配置
- **getConfig(id)** — 获取单个配置内容
- **createConfig(agentId, name, content)** — 创建新配置
- **updateConfig(id, content)** — 更新配置内容
- **deleteConfig(id)** — 删除配置
- **switchConfig(agentId, configId)** — 切换当前配置（原子写入）

## 切换机制

### 原子写入流程（参考 cc-switch）

```typescript
async function switchConfig(agentId: number, configId: number): Promise<void> {
  // 1. 读取目标配置
  const config = await db.getConfig(configId)
  const agent = await db.getAgent(agentId)

  // 2. 更新数据库状态
  await db.clearCurrentConfig(agentId)
  await db.setCurrentConfig(configId)

  // 3. 原子写入到 Agent 路径
  const configPath = expandHomePath(agent.configPath)
  const tmpPath = `${configPath}.tmp.${Date.now()}`

  // 写入临时文件
  await fs.writeFile(tmpPath, config.content, 'utf-8')

  // 原子替换
  await fs.rename(tmpPath, configPath)
}
```

### 路径展开

```typescript
function expandHomePath(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1))
  }
  return p
}
```

### 错误处理

- 路径不存在 → 自动创建目录
- 写入失败 → 回滚数据库状态
- 权限不足 → 抛出明确错误

## UI 设计

### 页面结构

**独立顶级页面** `/agents`，在侧边栏导航中有独立入口（Agents 菜单项，Bot 图标）。

```
┌─────────────────────────────────────────────────────────┐
│  Agents                                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─ Claude Code ───────────────────────────────────────┐ │
│  │  ~/.claude/settings.json           [+] 添加配置     │ │
│  │  ├── ● default (当前)          [编辑] [删除]         │ │
│  │  ├── ○ work                    [编辑] [删除]         │ │
│  │  └── ○ personal                [编辑] [删除]         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ Codex ─────────────────────────────────────────────┐ │
│  │  ~/.codex/config.toml              [+] 添加配置     │ │
│  │  └── ● default (当前)          [编辑] [删除]         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  [+ 添加自定义 Agent]                                    │
└─────────────────────────────────────────────────────────┘
```

### 与 Settings 页面的关系

- **Agents 页面** — 管理 AI 编程助手的配置文件（独立功能）
- **Settings 页面** — 仅管理软件自身设置（自动更新、关于）

### 交互流程

1. **切换配置** — 点击配置名称，触发 `switchConfig()`
2. **编辑配置** — 点击 [编辑] 按钮，弹出编辑器对话框，支持 JSON/TOML 内容编辑
3. **删除配置** — 点击 [删除] 按钮，AlertDialog 确认，当前配置不可删除
4. **添加配置** — 点击 [+] 添加配置按钮，输入名称和内容
5. **添加自定义 Agent** — 点击 [+ 添加自定义 Agent] 按钮，输入名称、显示名称、配置路径、格式

## 架构集成

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  Renderer (React)                                        │
│  ┌─ Agents.tsx (独立页面 /agents) ─────────────────────┐ │
│  │  useAgents() / useAgentConfigs() / useSwitchConfig() │ │
│  └─────────────────────────────────────────────────────┘ │
│                          ↓ IPC                           │
├─────────────────────────────────────────────────────────┤
│  Main (Electron)                                         │
│  ┌─ ipc/index.ts ─────────────────────────────────────┐  │
│  │  agent:list / agent:create / agent:switch ...       │  │
│  └────────────────────────────────────────────────────┘  │
│                          ↓                               │
│  ┌─ domains/agent/ ───────────────────────────────────┐  │
│  │  agent.service.ts → db/agents.ts + fs.writeFile     │  │
│  └────────────────────────────────────────────────────┘  │
│                          ↓                               │
│  ┌─ db/ ──────────────────────────────────────────────┐  │
│  │  agents.ts (CRUD) + agent_configs.ts (CRUD)         │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 与 Provider 系统的关系

- **独立**：Agent 配置和 Provider 配置是两个独立系统
- **无依赖**：Agent 不需要知道 Provider 的存在
- **可协同**：用户可以在 Agent 配置中引用 Gateway 的端口（如 `http://localhost:8080`）

### 文件结构

```
src/main/
├── domains/agent/
│   ├── agent.service.ts    # 业务逻辑
│   ├── agent.schema.ts     # Zod 验证
│   ├── agent.types.ts      # 类型定义
│   └── __tests__/
├── db/
│   ├── agents.ts           # Agent CRUD
│   └── agent-configs.ts    # 配置 CRUD
└── ipc/index.ts            # 新增 agent:* handlers

src/renderer/
├── pages/Agents.tsx        # 独立 Agent 配置管理页面
└── lib/queries/
    └── agents.ts           # TanStack Query hooks
```

## 实现优先级

### P0（核心功能） ✅ 已完成
1. ✅ 数据库表创建
2. ✅ 内置 Agent 预设初始化
3. ✅ Agent CRUD API
4. ✅ 配置 CRUD API
5. ✅ 切换功能（原子写入）

### P1（UI 完善） ⚠️ 部分完成
1. ✅ 独立 Agents 页面（已从 Settings 分离）
2. ❌ 配置编辑器对话框（后端 API 就绪，UI 未实现）
3. ❌ 添加自定义 Agent 对话框（后端 API 就绪，UI 未实现）

### P2（增强功能） ❌ 未开始
1. 配置导入/导出
2. 配置模板
3. 配置对比

## 测试策略

### 单元测试 ✅ 已完成
- ✅ Agent service 测试 (20 tests)
- ✅ 配置 CRUD 测试 (16 tests)
- ✅ 原子写入测试
- ✅ 路径展开测试
- ✅ Zod Schema 验证测试 (38 tests)

### 集成测试 ⚠️ 部分完成
- ❌ IPC handler 测试
- ✅ 端到端切换测试 (8 tests)

### E2E 测试 ❌ 未开始
- UI 交互测试
- 配置切换验证
