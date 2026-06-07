# 全量代码修复计划

## 1. 总览

基于 6 个审查代理的并行审计，共发现 **182 个问题**（24 P0 + 77 P1 + 81 P2）。

修复策略：按依赖关系分 5 个阶段执行，每阶段内并行修改不同文件，**文件级零冲突**。

| 阶段 | 内容 | 代理数 | 预计时间 |
|------|------|--------|---------|
| Phase 1 | Domain Services + Data Layer | 8 | 5-10 min |
| Phase 2 | Backend Infrastructure | 5 | 10-15 min |
| Phase 3 | Frontend Components | 8 | 5-10 min |
| Phase 4 | JSDoc + P2 Fixes | 3 | 3-5 min |
| Phase 5 | Verification | 1 | 5 min |

## 2. 冲突分析

### 核心原则：同一文件只被一个代理修改

```
Phase 1 ──┐
           ├── barrier（Phase 1 完成后 Phase 2 才开始）
Phase 2 ──┤
           ├── barrier
Phase 3 ──┤  （Phase 3 与 Phase 2 无文件重叠，但为安全起见顺序执行）
           ├── barrier
Phase 4 ──┘  （JSDoc 在所有代码修改之后，避免冲突）
```

### 文件级隔离矩阵

| 文件/目录 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-----------|---------|---------|---------|---------|
| domains/* | ✅ | | | |
| db/model-mappings.ts | ✅(新建) | | | |
| proxy/server.ts | | ✅ | | |
| proxy/handler.ts | | ✅(新建) | | |
| proxy/stream.ts | | ✅(新建) | | |
| proxy/logger.ts | | ✅(新建) | | |
| proxy/manager.ts | | ✅ | | |
| proxy/router.ts | | ✅ | | |
| proxy/forwarder.ts | | ✅ | | |
| ipc/index.ts | | ✅ | | |
| ipc/*.ts | | ✅(新建) | | |
| db/logs*.ts | | ✅ | | |
| db/agents*.ts | | ✅ | | |
| shared/types.ts | | ✅ | | |
| App.tsx | | | ✅ | |
| hooks/useUpdateCheck.ts | | | ✅(新建) | |
| pages/Agents.tsx | | | ✅ | |
| pages/Providers.tsx | | | ✅ | |
| pages/ApiKeys.tsx | | | ✅ | |
| pages/Dashboard.tsx | | | ✅ | |
| pages/ModelMappings.tsx | | | ✅ | |
| pages/Chat.tsx | | | ✅ | |
| features/agent/components/* | | | ✅(新建) | |
| features/provider/components/* | | | ✅(新建) | |
| features/apikey/components/* | | | ✅(新建) | |
| features/dashboard/components/* | | | ✅(已有) | |
| features/model-mapping/components/* | | | ✅(新建) | |
| features/chat/components/* | | | ✅(已有) | |
| ChatInput.tsx | | | ✅ | |
| ConversationSidebar.tsx | | | ✅ | |
| 测试文件 | | | ✅ | |
| 全项目 JSDoc | | | | ✅ |
| 全项目 P2 | | | | ✅ |

**结论：每阶段内各代理修改的文件完全隔离，无冲突风险。**

### 依赖关系

- Phase 2 依赖 Phase 1：domain service 接口变更（工厂注入 db 参数）后，IPC 和 proxy 层需同步更新
- Phase 3 独立于 Phase 1/2：前端不依赖后端接口变更（通过 preload IPC 桥接）
- Phase 4 依赖 Phase 1-3：JSDoc 在代码修改后添加，避免与代码变更冲突

## 3. 阶段详情

### Phase 1: Domain Services + Data Layer

目标：统一工厂注入模式，补充缺失的 types/schema，业务层改用数据层函数。

| 代理 | 任务 | 修改文件 | P 级别 |
|------|------|---------|--------|
| 1.1 | 创建 model-mappings 数据层 | db/model-mappings.ts(新建) | P1 |
| 1.2 | apikey service 工厂注入 | domains/apikey/apikey.service.ts | P1 |
| 1.3 | logs service 工厂注入 + types/schema | domains/logs/service.ts, types.ts(新建), schema.ts(新建) | P1 |
| 1.4 | stats service 工厂注入 + types/schema | domains/stats/service.ts, types.ts(新建), schema.ts(新建) | P1 |
| 1.5 | conversation service 改用数据层函数 | domains/conversation/conversation.service.ts | P1 |
| 1.6 | provider service 改用数据层函数 | domains/provider/provider.service.ts | P1 |
| 1.7 | models service 改用数据层函数 | domains/models/models.service.ts | P1 |
| 1.8 | agent service 修复 + error messages | domains/agent/agent.service.ts, db/agent-configs.ts | P1+P2 |

### Phase 2: Backend Infrastructure

目标：修复安全漏洞、架构越界、拆分大文件、补充 Zod 校验。

| 代理 | 任务 | 修改文件 | P 级别 |
|------|------|---------|--------|
| 2.1 | proxy/server.ts 安全+架构+拆分 | server.ts, handler.ts(新建), stream.ts(新建), logger.ts(新建) | P0+P1 |
| 2.2 | proxy 辅助文件修复 | manager.ts, router.ts, forwarder.ts | P0+P1+P2 |
| 2.3 | ipc/index.ts 拆分+校验+handler 逻辑 | index.ts + 10 个 domain handler 文件(新建) | P0+P1+P2 |
| 2.4 | db/logs.ts 拆分 + 空 catch | logs.ts, logs-writer.ts(新建), logs-reader.ts(新建), logs-stats.ts(新建) | P0+P2 |
| 2.5 | db agents 修复 | agents.ts, agent-configs.ts | P1 |

### Phase 3: Frontend Components

目标：拆分超长页面组件、修复直接 IPC 调用、修复相对路径、修复原生元素。

| 代理 | 任务 | 修改文件 | P 级别 |
|------|------|---------|--------|
| 3.1 | App.tsx 修复 | App.tsx, hooks/useUpdateCheck.ts(新建) | P0+P1 |
| 3.2 | Agents.tsx 拆分 | pages/Agents.tsx, features/agent/components/(新建) | P0+P1 |
| 3.3 | Providers.tsx 拆分 | pages/Providers.tsx, features/provider/components/(新建) | P0+P1+P2 |
| 3.4 | ApiKeys.tsx 拆分 | pages/ApiKeys.tsx, features/apikey/components/(新建) | P0+P1+P2 |
| 3.5 | Dashboard.tsx 拆分 | pages/Dashboard.tsx, features/dashboard/components/ | P0+P1 |
| 3.6 | ModelMappings.tsx 拆分 | pages/ModelMappings.tsx, features/model-mapping/components/(新建) | P0+P1+P2 |
| 3.7 | Chat.tsx 拆分 | pages/Chat.tsx, features/chat/components/ | P0+P1 |
| 3.8 | 组件修复 + 测试路径 | ChatInput.tsx, ConversationSidebar.tsx, 测试文件 | P1+P2 |

### Phase 4: JSDoc + P2 Fixes

目标：补充 JSDoc、修复 P2 级别问题。

| 代理 | 任务 | 修改文件 | P 级别 |
|------|------|---------|--------|
| 4.1 | 后端 JSDoc + 错误消息格式 | src/main/** | P1+P2 |
| 4.2 | 前端 JSDoc + 常量命名 | src/renderer/** | P1+P2 |
| 4.3 | P2 修复（魔法数字+布尔命名） | 全项目 | P2 |

### Phase 5: Verification

目标：验证所有修改的正确性。

- `npx tsc --noEmit`（类型检查）
- `npm run build`（全量构建）
- `npm test`（全量测试）
- `npm run lint`（代码规范）

## 4. 验证策略

| 检查点 | 时机 | 命令 |
|--------|------|------|
| 类型检查 | Phase 2 结束后 | npx tsc --noEmit |
| 全量构建 | Phase 2 结束后 | npm run build |
| 全量测试 | Phase 2 结束后 | npm test |
| 最终验证 | Phase 4 结束后 | 全部运行 |

## 5. 风险控制

1. **文件冲突**：每代理明确文件范围，不越界修改
2. **接口变更**：Phase 1 改接口 → Phase 2 同步更新调用方（通过 barrier 保证顺序）
3. **拆分兼容**：新文件保持 barrel export，不破坏现有导入
4. **测试失败**：Phase 5 验证失败时，定位问题并修复
5. **编译错误**：每代理结束前运行 `npx tsc --noEmit` 验证
