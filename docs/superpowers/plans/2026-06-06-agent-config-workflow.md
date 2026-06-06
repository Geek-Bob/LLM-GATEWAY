export const meta = {
  name: 'complete-agent-config-ui',
  description: '完成 Agent 配置管理功能的 UI 部分：编辑配置对话框、添加自定义 Agent 对话框',
  phases: [
    { title: '编辑配置', detail: '实现编辑配置对话框' },
    { title: '添加 Agent', detail: '实现添加自定义 Agent 对话框' },
    { title: '验证', detail: '类型检查和测试' },
  ],
}

phase('编辑配置')
// Task 9: 编辑配置对话框
await agent(
  `在 src/renderer/pages/Agents.tsx 中实现编辑配置对话框功能。

**要求：**
1. 添加编辑配置对话框状态：editingConfig, editContent
2. 在配置项中添加"编辑"按钮（所有配置都可以编辑）
3. 创建编辑配置对话框，使用 Textarea 编辑内容
4. 实现 handleUpdateConfig 处理函数，调用 useUpdateAgentConfig mutation
5. 保存成功后关闭对话框并显示 toast

**技术要求：**
- 使用 Dialog 组件（已导入）
- 使用 Textarea 组件（已导入）
- 使用 useUpdateAgentConfig hook（已在 lib/queries/agents.ts 中定义）
- 遵循项目代码风格

请先读取 src/renderer/pages/Agents.tsx 了解当前实现，然后添加编辑功能。`,
  { label: '编辑配置对话框', phase: '编辑配置', agentType: 'code-simplifier' }
)

phase('添加 Agent')
// Task 10: 添加自定义 Agent 对话框
await agent(
  `在 src/renderer/pages/Agents.tsx 中实现添加自定义 Agent 对话框功能。

**要求：**
1. 添加对话框状态：showAddAgent, newAgent (name, displayName, configPath, configFormat)
2. 在 Agent 列表底部添加"添加自定义 Agent"按钮
3. 创建添加自定义 Agent 对话框，包含：
   - 名称输入框（必填，小写字母+连字符）
   - 显示名称输入框（必填）
   - 配置路径输入框（必填，如 ~/.my-agent/config.json）
   - 配置格式下拉选择（JSON/TOML/ENV）
4. 实现 handleCreateAgent 处理函数，调用 useCreateAgent mutation
5. 创建成功后关闭对话框、清空表单、显示 toast

**技术要求：**
- 使用 Dialog, Input, Label, Select 组件（已导入）
- 使用 useCreateAgent hook（已在 lib/queries/agents.ts 中定义）
- 使用 Button 组件（已导入）
- 遵循项目代码风格

请先读取 src/renderer/pages/Agents.tsx 了解当前实现，然后添加创建 Agent 功能。`,
  { label: '添加自定义 Agent', phase: '添加 Agent', agentType: 'code-simplifier' }
)

phase('验证')
// 验证任务
await agent(
  `验证 Agent 配置管理功能的完整性。

**检查清单：**
1. 运行类型检查：npx tsc --noEmit
2. 检查所有导入是否正确
3. 检查 Dialog 组件是否正确使用
4. 检查 mutation 调用是否正确

**测试场景：**
- 编辑配置：点击编辑按钮 → 修改内容 → 保存 → 验证更新
- 添加 Agent：点击添加按钮 → 填写表单 → 创建 → 验证列表更新
- 删除配置：点击删除 → 确认 → 验证列表更新

如果有任何问题，修复它们。`,
  { label: '验证功能', phase: '验证', agentType: 'code-simplifier' }
)
