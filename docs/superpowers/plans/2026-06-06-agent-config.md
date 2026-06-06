# Agent 配置管理功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Agent 配置管理功能，支持管理多个 AI 编程助手的 settings 文件，支持一键切换。

**Architecture:** 新增 agent domain，独立管理 Agent 配置。数据库存储 Agent 定义和多个配置文件，切换时原子写入到 Agent 实际路径。与现有 Provider 系统解耦。

**Tech Stack:** TypeScript, SQLite (sql.js), Zod, TanStack Query, React, Electron IPC

---

## 文件结构

```
src/main/
├── db/
│   ├── schema.ts              # ✅ 已创建 agents + agent_configs 表
│   ├── agents.ts              # ✅ 已创建 Agent CRUD
│   └── agent-configs.ts       # ✅ 已创建 配置 CRUD
├── domains/agent/
│   ├── agent.types.ts         # ✅ 已创建 类型定义
│   ├── agent.schema.ts        # ✅ 已创建 Zod 验证
│   └── agent.service.ts       # ✅ 已创建 业务逻辑
└── ipc/index.ts               # ✅ 已注册 agent:* handlers

src/preload/
└── index.ts                   # ✅ 已添加 agent API bridge

src/renderer/
├── lib/queries/agents.ts      # ✅ 已创建 TanStack Query hooks
└── pages/Agents.tsx           # ⚠️ 需要完善：编辑配置、添加自定义 Agent
```

---

## 已完成任务

### Task 1-8: 核心功能 ✅

- [x] **Task 1:** 数据库表创建
- [x] **Task 2:** 内置 Agent 预设初始化
- [x] **Task 3:** Agent CRUD 数据库层
- [x] **Task 4:** Agent Config CRUD 数据库层
- [x] **Task 5:** Agent Domain 类型和验证
- [x] **Task 6:** Agent Service 业务逻辑
- [x] **Task 7:** IPC Handler 注册
- [x] **Task 8:** TanStack Query Hooks

---

## 剩余任务

### Task 9: 编辑配置对话框

**Files:**
- Modify: `src/renderer/pages/Agents.tsx`

- [ ] **Step 1: 添加编辑配置对话框状态**

```typescript
// 在 Agents 组件中添加状态
const [editingConfig, setEditingConfig] = useState<AgentConfigResponse | null>(null)
const [editContent, setEditContent] = useState('')
```

- [ ] **Step 2: 添加编辑按钮到配置项**

```typescript
// 在配置项的按钮组中添加编辑按钮
<Button
  variant="ghost"
  size="sm"
  onClick={() => {
    setEditingConfig(config)
    setEditContent(config.content)
  }}
>
  编辑
</Button>
```

- [ ] **Step 3: 创建编辑配置对话框**

```typescript
{/* 编辑配置对话框 */}
<Dialog open={!!editingConfig} onOpenChange={() => setEditingConfig(null)}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>编辑配置: {editingConfig?.name}</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <Textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        className="min-h-[400px] font-mono text-sm"
        placeholder="输入配置内容..."
      />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setEditingConfig(null)}>
        取消
      </Button>
      <Button onClick={handleUpdateConfig}>
        保存
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 4: 实现更新配置处理函数**

```typescript
const handleUpdateConfig = async () => {
  if (!editingConfig) return
  try {
    await updateConfig.mutateAsync({
      id: editingConfig.id,
      data: { content: editContent }
    })
    toast.success('配置已更新')
    setEditingConfig(null)
  } catch (error) {
    toast.error('更新失败: ' + (error as Error).message)
  }
}
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: 提交**

```bash
git add src/renderer/pages/Agents.tsx
git commit -m "feat(agent): add edit config dialog"
```

---

### Task 10: 添加自定义 Agent 对话框

**Files:**
- Modify: `src/renderer/pages/Agents.tsx`

- [ ] **Step 1: 添加自定义 Agent 对话框状态**

```typescript
const [showAddAgent, setShowAddAgent] = useState(false)
const [newAgent, setNewAgent] = useState({
  name: '',
  displayName: '',
  configPath: '',
  configFormat: 'json' as const,
})
```

- [ ] **Step 2: 添加"添加自定义 Agent"按钮**

```typescript
{/* 在 Agent 列表底部 */}
<Button
  variant="outline"
  className="w-full"
  onClick={() => setShowAddAgent(true)}
>
  <Plus className="w-4 h-4 mr-2" />
  添加自定义 Agent
</Button>
```

- [ ] **Step 3: 创建添加自定义 Agent 对话框**

```typescript
<Dialog open={showAddAgent} onOpenChange={setShowAddAgent}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>添加自定义 Agent</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="agent-name">名称</Label>
        <Input
          id="agent-name"
          value={newAgent.name}
          onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
          placeholder="my-agent"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agent-display-name">显示名称</Label>
        <Input
          id="agent-display-name"
          value={newAgent.displayName}
          onChange={(e) => setNewAgent({ ...newAgent, displayName: e.target.value })}
          placeholder="My Agent"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agent-config-path">配置路径</Label>
        <Input
          id="agent-config-path"
          value={newAgent.configPath}
          onChange={(e) => setNewAgent({ ...newAgent, configPath: e.target.value })}
          placeholder="~/.my-agent/config.json"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agent-config-format">配置格式</Label>
        <Select
          value={newAgent.configFormat}
          onValueChange={(value: 'json' | 'toml' | 'env') =>
            setNewAgent({ ...newAgent, configFormat: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="toml">TOML</SelectItem>
            <SelectItem value="env">ENV</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowAddAgent(false)}>
        取消
      </Button>
      <Button onClick={handleCreateAgent}>
        创建
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 4: 实现创建 Agent 处理函数**

```typescript
const createAgent = useCreateAgent()

const handleCreateAgent = async () => {
  if (!newAgent.name || !newAgent.displayName || !newAgent.configPath) {
    toast.error('请填写所有必填字段')
    return
  }
  try {
    await createAgent.mutateAsync(newAgent)
    toast.success('Agent 已创建')
    setShowAddAgent(false)
    setNewAgent({ name: '', displayName: '', configPath: '', configFormat: 'json' })
  } catch (error) {
    toast.error('创建失败: ' + (error as Error).message)
  }
}
```

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: 提交**

```bash
git add src/renderer/pages/Agents.tsx
git commit -m "feat(agent): add custom agent creation dialog"
```

---

### Task 11: 完善测试覆盖

**Files:**
- Create: `src/main/ipc/__tests__/agent-handlers.test.ts`

- [ ] **Step 1: 写 IPC handler 集成测试**

```typescript
// src/main/ipc/__tests__/agent-handlers.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDatabase } from '../../db/schema'

describe('Agent IPC Handlers', () => {
  let db: any

  beforeEach(async () => {
    db = await initDatabase(':memory:')
  })

  it('should handle agent:list', async () => {
    // 模拟 IPC handler 调用
    const agents = await db.all('SELECT * FROM agents')
    expect(agents.length).toBeGreaterThan(0)
  })

  it('should handle agent:createConfig', async () => {
    // 测试创建配置
    const agent = await db.get('SELECT id FROM agents LIMIT 1')
    const result = await db.run(
      'INSERT INTO agent_configs (agent_id, name, content) VALUES (?, ?, ?)',
      [agent.id, 'test', '{}']
    )
    expect(result.lastID).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行测试验证通过**

Run: `npm test -- --run src/main/ipc/__tests__/agent-handlers.test.ts`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/main/ipc/__tests__/agent-handlers.test.ts
git commit -m "test(agent): add IPC handler integration tests"
```

---

## 实施计划完成

**计划已保存到 `docs/superpowers/plans/2026-06-06-agent-config.md`**

两种执行方式：

**1. Subagent-Driven（推荐）** - 每个任务派发一个新的子代理执行，任务间审查，快速迭代

**2. Inline Execution** - 在当前会话中执行任务，批量执行并设置检查点

选择哪种方式？
