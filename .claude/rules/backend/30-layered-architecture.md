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
│   └── index.ts              # 接口层：IPC handler 注册（全部业务 CRUD）
├── domains/                  # 业务层：按聚合根划分
│   └── {name}/
│       ├── {name}.service.ts     # 业务入口
│       ├── {name}.schema.ts      # Zod 校验
│       └── {name}.types.ts       # 类型定义
├── db/                       # 数据层：数据库操作
│   ├── connection.ts             # 连接管理
│   ├── schema.ts                 # 建表
│   └── {entity}.ts               # 各实体 CRUD
├── proxy/                    # 接口层：代理路由（仅 Chat）
│   ├── server.ts                 # Hono 应用
│   ├── manager.ts                # 生命周期
│   ├── router.ts                 # 模型→供应商路由
│   ├── forwarder.ts              # URL/Header 构建
│   ├── middleware.ts             # Auth 中间件
│   ├── rate-limiter.ts           # 限流
│   └── converter/                # 协议转换
│       ├── types.ts              # 共享类型
│       ├── request.ts            # 请求转换
│       ├── response.ts           # 响应转换
│       ├── sse.ts                # SSE 状态机
│       └── index.ts              # barrel export
├── core/                     # 基础设施层：通用工具
│   └── logger.ts                 # 统一日志
└── update/                   # 入口层：自动更新
```

## 依赖方向
- 上层可依赖下层，下层禁止依赖上层
- 同层之间禁止互相依赖（业务层 A 不引用业务层 B 的实现）
- 基础设施层（core/）禁止导入任何业务层代码

## 每层职责边界
- 接口层：只做校验、转发、格式化，禁止写业务逻辑
- 业务层：只做业务规则判断和数据编排，禁止直接操作数据库连接
- 数据层：只做 CRUD 和查询，禁止包含业务规则判断
- 基础设施层：只提供通用能力（日志、加密、工具函数），禁止引用业务概念

## 禁止
- 接口层直接操作数据库（绕过业务层）
- 业务层直接操作 Request/Response 对象
- 数据层包含业务规则判断（如"管理员可以删除任意记录"）
- 基础设施层导入 domains/ 或 proxy/ 的任何文件
- 任何层中出现 `fs.appendFileSync` / `fs.readFileSync`（统一用 logger）
