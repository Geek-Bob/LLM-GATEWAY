---
description: 命名约定与注释要求（前后端共用），始终加载
---

# 通用铁律（前后端共用）

## 命名约定
- 组件/类：PascalCase
- 函数/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 布尔值：is/has/can 开头
- 文件名：组件 `.tsx` 用 PascalCase，工具 `.ts` 用 camelCase

## 注释要求
- 导出函数/类必须有 JSDoc（参数说明 + 返回值 + 示例）
- 包含魔法数字的计算逻辑必须注释说明含义
- 复杂业务规则必须注释说明"为什么"
