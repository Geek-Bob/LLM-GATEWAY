---
description: 命名约定与注释要求（前后端共用），始终加载
---

# 通用铁律（前后端共用）

## 命名约定
- 组件/类：PascalCase
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 布尔值：is/has/can 开头
  - 例外：第三方库/框架返回的布尔值或受控 prop 沿用原命名（如 TanStack Query 的 `isLoading`、Radix 的 `open`/`defaultOpen`、原生 HTML 的 `disabled`/`required`/`checked`/`readOnly`）
  - 例外：React 事件回调 prop 遵循 React 约定（如 `onChange`/`onClick`），不强制 is/has/can 前缀
  - 例外：解构赋值中跟随源命名（如 `const [isOpen, setIsOpen] = useState(false)`）
  - ❌ `loading`（应改为 `isLoading`）；自定义组件中的布尔变量/state 用 `isOpen`，但接收/透传 Radix 等库的 `open` prop 沿用原名
  - ✅ `isLoading`（TanStack Query）、`onChange`（React 事件回调）
- 文件名：组件 `.tsx` 用 PascalCase，工具 `.ts` 用 camelCase
- 测试文件：`{name}.test.ts(x)` 或 `{name}.spec.ts(x)`；类型断言测试用 `{name}.test-d.ts`；放置于源文件同目录或 `__tests__/` 子目录
- 文件系统大小写：禁止同目录下出现仅大小写不同的文件名；import 路径的字母大小写必须与磁盘文件名完全一致（Windows 不区分大小写不报错，但 macOS/Linux CI 会失败）

## 注释要求
- 导出函数/类必须有 JSDoc（参数说明 + 返回值）。核心 API 函数额外需要 `@example` 代码片段
  - barrel re-export（`index.ts` 的 re-export）和 type alias（`export type Xxx = ...`）不需要独立 JSDoc，继承原定义的文档
  - JSDoc 模板：
    ```typescript
    /**
     * 创建新的 provider 记录。
     * @param input - provider 配置（名称、类型、API Key）
     * @returns 创建的 provider 实体
     * @example
     * const provider = await createProvider({ name: 'openai', providerType: 'openai', apiKey: 'sk-...' })
     */
    ```
- 包含魔法数字的计算逻辑必须注释说明含义
  - 魔法数字：代码中出现的、含义不明显的数字字面量
  - ❌ `for (let i = 0; i < 3; i++)` → ✅ `const MAX_RETRIES = 3; for (let i = 0; i < MAX_RETRIES; i++)`
  - 不算魔法数字：单元测试中的预期值、数组索引（`0`/`1`）、常量定义内部的 RHS 数字。但端口号、超时毫秒数、文件大小限制等配置型数字仍必须提取为命名常量并集中在 config 模块（即使是端口号 `8080`，硬编码在多处也算违规）
- 涉及条件分支超过 2 层、或需要跨模块理解的业务规则必须注释说明"为什么"

## 错误消息格式
- 后端错误消息遵循 `Failed to {action} {entity}: {reason}` 格式（详见 backend/34-error-handling.md）
- 前端错误消息通过 `getErrorMessage(e)` 统一提取
