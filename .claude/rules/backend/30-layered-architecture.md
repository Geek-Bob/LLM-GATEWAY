---
description: 分层架构与依赖方向（导入路径约束），始终加载
---

# 分层与依赖

## 层级划分
系统分为 5 层，每层职责单一，不可混淆：
1. 入口层 — 应用启动、窗口管理、生命周期
2. 接口层 — IPC handler、代理路由，负责输入校验和输出格式化
3. 业务层 — domain service，纯业务逻辑，不含框架代码
4. 数据层 — 数据库操作，提供查询抽象
5. 基础设施层 — 日志、配置、工具函数

## 目录结构
```
src/main/
├── index.ts                  # 入口层：窗口/Tray/启动
├── ipc/
│   ├── index.ts              # 注册编排，调用各 domain 的 registerXxxHandlers
│   ├── ipc-utils.ts          # wrapIpcHandler 通用 try/catch 工具
│   ├── sse-parser.ts         # SSE 行解析（共享给 chat 流）
│   └── {domain}.ts           # 每个 domain 一个 handler 文件（providers/agents/conversations/...）
├── domains/                  # 业务层：按聚合根划分
│   └── {name}/
│       ├── {name}.service.ts     # 业务入口
│       ├── {name}.schema.ts      # Zod 校验
│       └── {name}.types.ts       # 类型定义
├── db/                       # 数据层：数据库操作
│   ├── connection.ts             # 连接管理
│   ├── schema.ts                 # 建表
│   └── {entity}.ts               # 各实体 CRUD（如 providers.ts、api-keys.ts）
├── proxy/                    # 接口层：代理路由（仅 Chat）
│   ├── server.ts                 # Hono 应用
│   ├── manager.ts                # 生命周期
│   ├── router.ts                 # 模型→供应商路由
│   ├── forwarder.ts              # URL/Header 构建
│   ├── middleware.ts             # Auth 中间件
│   ├── rate-limiter.ts           # 限流
│   ├── handler.ts               # 请求处理 pipeline
│   ├── stream.ts                # SSE 流转换服务
│   ├── logger.ts                # 代理日志聚合 + SSE token 抽取（extractContent/UsageFromSSE）
│   └── converter/                # 协议转换
│       ├── types.ts              # 共享类型
│       ├── request.ts            # 请求转换
│       ├── response.ts           # 响应转换
│       ├── sse.ts                # SSE 状态机
│       └── index.ts              # barrel export
├── core/                     # 基础设施层：通用工具
│   ├── logger.ts                 # 统一日志
│   └── config-migration.ts       # 启动时一次性配置/数据迁移
└── update/                   # 入口层：自动更新
```

## 依赖方向
- 上层可依赖下层，下层禁止依赖上层（具体约束见下方导入路径约束）
- 同层之间允许单向调用（A service 可引用 B service），禁止循环依赖

## 导入路径约束（编译器可检查）
```
所有层均可 type-only 导入 shared/types（仅类型，不带运行期代码）；shared/ 禁止反向导入 main/ 任何文件（CLAUDE.md 已声明）。
入口层：index.ts, update/
  ├── 可导入：全部下层
接口层：ipc/
  ├── 禁止导入：db/（例外：type-only 导入 db/database 的 Database 类型 + db/connection 的 getDb 用于注入）
  ├── 可导入：domains/, core/
接口层：proxy/
  ├── 禁止导入：db/, domains/
  ├── 可导入：core/
业务层：domains/
  ├── 禁止导入：proxy/
  ├── 数据层访问模式见 `backend/31-domain-modeling.md`
  ├── 可导入：db/（通过数据层函数）、core/, 其他 domains/ 的 service
数据层：db/
  ├── 禁止导入：domains/, proxy/, ipc/
  ├── 可导入：core/
基础设施层：core/
  └── 禁止导入：domains/, proxy/, ipc/, db/
```

## 每层职责边界
- 接口层（ipc/、proxy/）：只做校验、转发、格式化，禁止写业务逻辑
- 业务层（domains/）：只做业务规则判断和数据编排，禁止导入 hono 包（Context、HonoRequest、Hono 实例等所有 hono 包导出），所有 Hono 相关对象必须停在 proxy/ 层
- 数据层（db/）：只做 CRUD 和查询，禁止包含业务规则判断（如"管理员可以删除任意记录"）
- 基础设施层（core/）：只提供通用能力（日志、工具函数），禁止引用业务概念
