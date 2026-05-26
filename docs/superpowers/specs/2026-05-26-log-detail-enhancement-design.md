# 日志详情增强 + Debug 模式

**日期**: 2026-05-26
**状态**: 已评审

## 背景

当前请求日志列表只展示基础元数据（模型、状态码、耗时、token），无法看到请求/响应的具体内容。Proxy debug log 有详细的探点数据（客户端入参、上游 URL、请求体、响应体、路由信息、协议转换），但写在临时目录的独立文件里，与日志列表没有关联。用户排查问题需要同时打开两个文件对照查看。

## 目标

将 debug 信息嵌入 NDJSON 日志条目，在日志页面点击条目可展开详情面板，一站式查看完整请求链路。

## 数据模型

### `LogEntryProps` 新增可选 `debug` 字段

```typescript
interface LogDebugInfo {
  client: {
    body: string        // 客户端原始请求体 JSON（完整，不截断）
    apiFormat: string
  }
  route: {
    providerName: string
    providerType: string
    baseUrl: string
    modelName: string
  }
  conversion?: {        // 仅协议转换时存在
    from: string
    to: string
    originalPath: string
    convertedPath: string
    originalModel: string
    convertedModel: string
  }
  upstream: {
    url: string          // 上游完整 URL
    body: string         // 上游请求体 JSON（完整）
    statusCode: number
    responseBody: string // 上游响应体 JSON（完整）
  }
}
```

### NDJSON 存储

debug 字段与其他字段平级序列化到每行 JSON。仅 debug 模式开启时有值，关闭时不写入此字段。不做截断。

## Debug 模式开关

- **位置**: 日志列表页面顶部，标题右侧
- **存储**: `proxy/manager.ts` 内存变量，运行时可变，重启后默认关闭
- **IPC**: `proxy:getDebugMode` / `proxy:setDebugMode`
- **作用**: 控制 `handleProxyRequest` 是否填充 `debug` 字段传给 `createLogEntry`
- **视觉**: 高亮开关，清晰标识当前状态

## 后端改动

### `src/main/db/logs.ts`
- `createLogEntry` 新增可选 `debug` 参数，序列化时写入 NDJSON
- `normalizeEntry` 透传 `debug` 字段

### `src/main/proxy/server.ts`
- `handleProxyRequest` 中收集所有 debug 信息（client body, route, conversion, upstream url/body/responseBody）
- 最终一步传入 `createLogEntry({ ...logBase, debug })`
- 现有 `proxyDebugLog` 调用保留不变

### `src/main/proxy/manager.ts`
- 新增 `debugMode` 状态变量 + getter/setter
- 新增 IPC handler

### `src/main/ipc/index.ts`
- 新增 `proxy:getDebugMode` / `proxy:setDebugMode` handler

### `src/preload/index.ts`
- 暴露 `proxy.getDebugMode()` / `proxy.setDebugMode(enabled: boolean)`

### `src/renderer/lib/types.ts`
- 新增 `LogDebugInfo` 接口
- `LogEntry` 新增 `debug?: LogDebugInfo`
- `electronAPI.proxy` 新增 `getDebugMode` / `setDebugMode`

## UI 改动 (`src/renderer/pages/Logs.tsx`)

### 顶部 Debug 开关
- 标题右侧 toggle switch
- 页面加载时读取 debug 模式状态
- 切换时调用 `api.proxy.setDebugMode()`

### 表格行可点击
- 点击行展开详情面板，再次点击或点其他行切换
- 选中行高亮

### 右侧详情面板
- 从右侧滑入，占 ~40% 宽度
- 分 4 个 Section：客户端请求、路由&转换、上游请求、上游响应
- JSON 内容用 `<pre>` 格式化展示，可滚动
- 关闭按钮清除选中
- **debug 未开启时**: 显示基本信息 + 提示开启 Debug 模式

## 测试

- `forwarder.test.ts`: 已有测试不变
- `logs.test.ts`: 新增 `debug` 字段写入/读取测试
- `ipc/index.ts`: 新增 debug mode IPC handler 测试
- Logs 页面组件测试: 详情面板展开/关闭，debug 开关切换

## 约束

- debug body 不截断，完整存储
- debug 模式默认关闭，用户主动开启
- 不影响现有仪表盘统计功能
- 不影响现有代理转发逻辑
