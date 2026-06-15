---
description: 工程原则与编码规范（前后端共用），始终加载
---

# 工程原则（前后端共用）

## 架构先行
- 任何功能开发前，先明确模块职责、接口契约、数据流方向
- 高层模块定义"做什么"，低层模块决定"怎么做"（依赖倒置）
- 修复问题时先理解根因，从架构层面解决，不堆砌 workaround
- 方案设计前必须先读相关代码文件，理解现有逻辑，不凭空设计

## 解耦与抽象
- 单一职责：每个模块/函数只做一件事（适用于函数和模块粒度，层级职责划分见 `backend/30-layered-architecture.md`）
- 通过接口/类型契约通信，不暴露内部实现
  - 模块只导出公开 API 函数，辅助函数标记为模块私有（不导出）
  - 返回值类型只暴露调用方需要的字段（使用 Pick/Omit）
  - 配置项通过参数注入，不硬编码在实现中

## 防御性编程
- 边界条件：所有外部输入必须校验（Zod schema、类型守卫）
- 空值处理：nullable 字段必须有明确的处理策略（`?.` 或 `??` 或显式检查）

```typescript
// ❌ 错误：无空值处理
const name = user.profile.name  // profile 可能为 null

// ✅ 正确：使用 ?? 提供默认值
const name = user.profile?.name ?? 'unknown'
```
- 错误边界：异步操作必须有明确的错误处理策略（try-catch / .catch() / 错误边界）
  - 底层操作用 try-catch 捕获后重新抛出带上下文的错误（格式见 `backend/34-error-handling.md` 错误上下文）
  - 顶层 handler 捕获后映射为用户可见消息
  - 禁止空 catch 和只打印不处理（详见 `backend/34-error-handling.md` 禁止项）
- 资源清理：数据库连接、文件句柄、事件监听器必须有清理逻辑
  - 前端：`useEffect` 返回 cleanup 函数、`AbortController` 取消请求
  - 后端（Electron 主进程）：`app.on('before-quit', ...)` 关闭数据库；服务 `stop()` 方法释放端口；纯 Node 脚本可用 `process.on('beforeExit', ...)`（连接管理见 `backend/33-data-access.md`）

## 可读性
- 命名即文档：变量/函数名必须自解释，禁止缩写（除非是领域共识缩写如 API、URL）
- 函数长度：单函数不超过 50 行（计算范围从 JSDoc 起始 `/**` 到函数闭合 `}`，如无 JSDoc 则从函数签名行起；不含空行和单独占行的纯注释行；JSDoc 长说明本身也是函数复杂度信号），超过则拆分
- 嵌套深度：不超过 3 层，超过则用 early return 或提取子函数
  - 每个控制流块（`if`/`for`/`while`/`switch`/`try-catch`）算一层
  - 函数调用的回调不算额外层（回调重置计数）
  - ✅ `if { for { if {} } }` 为 3 层（达到上限）
  - ✅ `arr.map(x => { if {} })` 中 `if` 为第 1 层（回调重置计数）
- 注释意图：注释解释"为什么"，而非"做什么"（代码本身说明做什么）
- 日志输出规范见 `backend/36-observability.md`

## 全局观
- 修改前先理解：修改函数签名前，必须用 LSP 查找所有引用（Find All References），确认影响范围并在 PR 描述中列出受影响文件。修改 `shared/types.ts` 前必须运行 `npx tsc --noEmit` 确认无编译错误
- 一致性：新代码必须与周围代码风格一致（命名、结构、错误处理）
- 向后兼容：接口变更必须考虑已有调用方，必要时提供迁移路径
  - 接口范围：IPC 通道签名、service 函数签名、`shared/types.ts` 中的共享类型
  - 迁移路径：新增字段用 optional（`?`），不删除旧字段；重命名时保留旧签名作为 deprecated alias；删除功能前先 grep 确认无调用方
