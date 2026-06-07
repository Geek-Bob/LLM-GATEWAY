---
description: 命名约定与注释要求（前后端共用），始终加载
---

# 通用铁律（前后端共用）

## 命名约定
- 组件/类：PascalCase
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 布尔值：is/has/can 开头
  - 例外：第三方库/框架返回的布尔值沿用框架命名（如 TanStack Query 的 `isLoading`/`isError`）
  - 例外：React 事件回调 prop 遵循 React 约定（如 `onChange`/`onClick`），不强制 is/has/can 前缀
  - 例外：解构赋值中跟随源命名（如 `const [isOpen, setIsOpen] = useState(false)`）
  - ❌ `loading`、`open`（应改为 `isLoading`、`isOpen`）
  - ✅ `isLoading`（TanStack Query）、`onChange`（React 事件回调）
- 文件名：组件 `.tsx` 用 PascalCase，工具 `.ts` 用 camelCase
- 测试文件：`{name}.test.ts` 或 `{name}.spec.ts`，与源文件同目录

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
  - 不算魔法数字：端口号（`8080`）、数组索引（`0`）、常量定义（`const PORT = 8080`）
- 复杂业务规则必须注释说明"为什么"
