# 架构先行
- 任何功能开发前，先明确模块职责、接口契约、数据流方向
- 高层模块定义"做什么"，低层模块决定"怎么做"（依赖倒置）
- 修复问题时先理解根因，从架构层面解决，不堆砌 workaround
- 方案设计前必须先读相关代码文件，理解现有逻辑，不凭空设计

# 解耦与抽象
- 单一职责：每个模块/函数只做一件事
- 通过接口/类型契约通信，不暴露内部实现
- 组件复用：重复出现 3 次以上的 UI 模式必须抽取为共享组件

# 防御性编程
- 边界条件：所有外部输入必须校验（Zod schema、类型守卫）
- 空值处理：nullable 字段必须有明确的处理策略（`?.` 或 `??` 或显式检查）
- 错误边界：异步操作必须有 try-catch，错误信息必须包含上下文
- 资源清理：数据库连接、文件句柄、事件监听器必须有清理逻辑

# 可读性
- 命名即文档：变量/函数名必须自解释，禁止缩写（除非是领域共识缩写如 API、URL）
- 函数长度：单函数不超过 50 行，超过则拆分
- 嵌套深度：不超过 3 层，超过则用 early return 或提取子函数
- 注释意图：注释解释"为什么"，而非"做什么"（代码本身说明做什么）

# 全局观
- 修改前先理解：读取相关代码、理解调用链路、确认影响范围
- 一致性：新代码必须与周围代码风格一致（命名、结构、错误处理）
- 向后兼容：接口变更必须考虑已有调用方，必要时提供迁移路径

# 正反示例

## 嵌套过深 → 用 early return

❌ 禁止（嵌套 4 层）：
```typescript
function processUser(user) {
  if (user) {
    if (user.isActive) {
      if (user.role === 'admin') {
        doAdminStuff(user)
      }
    }
  }
}
```

✅ 正确（early return）：
```typescript
function processUser(user) {
  if (!user) return
  if (!user.isActive) return
  if (user.role !== 'admin') return
  doAdminStuff(user)
}
```

## 函数过长 → 拆分子函数

❌ 禁止（80 行的"上帝函数"）：
```typescript
async function handleRequest(req) {
  // 20 行验证
  // 20 行业务逻辑
  // 20 行数据转换
  // 20 行响应构建
}
```

✅ 正确（拆分为 4 个函数）：
```typescript
async function handleRequest(req) {
  const input = validateInput(req)
  const result = await processBusinessLogic(input)
  const transformed = transformData(result)
  return buildResponse(transformed)
}
```

## 空值处理 → 显式策略

❌ 禁止（忽略 null 风险）：
```typescript
const name = user.profile.name  // user 或 profile 可能为 null
```

✅ 正确（显式处理）：
const name = user?.profile?.name ?? 'Unknown'
```
