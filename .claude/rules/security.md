# 安全要求

## Electron 安全模型

### IPC 通信
- 渲染进程通过 `contextBridge` 暴露的 `window.electronAPI` 访问主进程能力
- 严禁在渲染进程启用 `nodeIntegration` 或禁用 `context隔离`
- 所有 IPC handler 必须校验输入参数，不信任渲染进程传入的数据

### API Key 处理
- gateway API key 当前明文存储（`key_encrypted` 列），已知技术债
- 渲染进程展示 key 时只显示前缀（`key_prefix`），不暴露完整 key
- 禁止在日志、错误消息、console 中打印完整 API key

### 代理服务器
- 代理认证支持 `Authorization: Bearer` 和 `X-Api-Key` 两种方式
- Bearer 前缀大小写不敏感
- 代理转发请求时，必须验证请求来源合法性

## 输入校验

- 所有用户输入（表单、URL 参数）在发送到主进程前必须校验
- IPC handler 收到的参数需做类型检查和边界校验
- 数据库查询使用参数化语句，严禁字符串拼接 SQL

## 渲染进程安全

- 严禁使用 `dangerouslySetInnerHTML`，除非有明确的 XSS 防护
- 外部 URL 使用 `shell.openExternal()` 打开，不直接 `window.open()`
- 禁止使用 `eval()`、`new Function()`、`innerHTML` 赋值

## 依赖安全

- 定期运行 `npm audit` 检查已知漏洞
- 新增依赖需评估：维护状态、下载量、是否最小化引入
- 禁止引入未审查的第三方脚本或 CDN 资源

## 日志与调试

- 调试日志写入 `os.tmpdir()/llm-gateway-*.log`，不用硬编码路径
- 生产构建不输出 debug 级别日志
- 错误信息对用户友好，不暴露堆栈跟踪或内部路径
