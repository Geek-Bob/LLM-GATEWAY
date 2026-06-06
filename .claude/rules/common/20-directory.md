---
description: 通用目录边界与类型治理（前后端共用）
---

# 类型治理
- 核心实体基础接口只在 `shared/types.ts` 定义（ProviderEntity、ApiKeyEntity 等）
- 各层通过 type alias 或 `Omit`/`Pick` 派生，禁止重新定义同名 interface
- 在多层重复定义相同实体的 interface（基础类型统一在 `shared/types.ts`）

# 禁止
- `renderer/` 导入 `main/` 任何文件（编译隔离）
- `core/` 导入 `domains/` 任何文件（下层不能依赖上层）
- `proxy/` 导入 `domains/` 任何文件（工具层不含业务）
- `shared/` 导入 `features/` 或 `domains/`（共享层不依赖业务）
