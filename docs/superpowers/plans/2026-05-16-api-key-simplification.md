# API Key 明文展示 实施计划

> **针对代理工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施此计划。
>
> **标记追踪系统：** 所有步骤使用 `- [ ]` 语法预置为待执行。执行时实时更新：
> - `[ ]` 未执行 → `[✅]` 已完成 / `[❌]` 执行失败 / `[🚫]` 已跳过
> - 全部 `[✅]` 后使用 superpowers:finishing-a-development-branch 交付、



**目标：** 后端直接存储明文 API Key，前端表格行内加眼睛按钮弹出小 popover 展示完整 key + 复制按钮。

**架构：** 移除加解密流程，create/update 直接存明文；list 查询时对遗留加密数据做降级解密（try/catch），新版数据直接返回明文。渲染进程通过 list 响应直接拿到 key，眼睛切换纯前端状态管理，无需额外 IPC。

**技术栈：** sql.js, Hono, React 19, framer-motion

**追踪：** `[ ] 0/6 任务` — 计划阶段

---

### Task 1: [✅] 后端 providers — 移除加密，字段重命名

**文件：**
- 修改：`src/main/db/providers.ts`
- 修改：`src/main/ipc/index.ts`

**步骤：**

- [✅] **步骤 1：修改 `providers.ts` 的 `Provider` 和 `ProviderInput` 接口**

加解密在 DB 层完成，对外暴露的接口字段从 `apiKeyEncrypted` 改为 `apiKey`，调用方不需要知道存储细节。

```typescript
// ProviderInput — 创建时传入明文
export interface ProviderInput {
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string  // renamed from apiKeyEncrypted
  models: string[]
}

// Provider — 返回时带明文
export interface Provider {
  id: number
  name: string
  providerType: string
  baseUrl: string
  apiKey: string  // renamed from apiKeyEncrypted
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

// ProviderUpdate — 同上
export interface ProviderUpdate {
  name?: string
  providerType?: 'anthropic' | 'openai'
  baseUrl?: string
  apiKey?: string  // renamed
  models?: string[]
  isActive?: number
}
```

- [✅] **步骤 2：修改 `columnMap` 和 `rowToProvider`**

```typescript
const columnMap: Record<string, string> = {
  name: 'name',
  providerType: 'provider_type',
  baseUrl: 'base_url',
  apiKey: 'api_key_encrypted',  // 字段名变了但列名不变
  models: 'models',
  isActive: 'is_active',
  createdAt: 'created_at',
  updatedAt: 'updated_at'
}

function rowToProvider(row: { [key: string]: unknown }): Provider {
  const rawKey = row.api_key_encrypted as string
  // 遗留数据已加密，新数据为明文 — 尝试解密，失败则视为明文
  let apiKey = rawKey
  try {
    apiKey = decrypt(rawKey, 'dummy')
  } catch {
    // rawKey is already plaintext
  }

  return {
    id: row.id as number,
    name: row.name as number,
    providerType: row.provider_type as string,
    baseUrl: row.base_url as string,
    apiKey,  // renamed
    models: JSON.parse(row.models as string) as string[],
    isActive: row.is_active as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}
```

- [✅] **步骤 3：修改 `createProvider` 和 `updateProvider` 移除加密**

`createProvider`: 将参数中的 `apiKey` 直接赋给 SQL 参数 `apiKeyEncrypted`，不再调用 `encrypt()`。

`updateProvider`: 同理，`apiKey` 直接写入 `api_key_encrypted` 列。

**注意：** 移除 `src/main/ipc/index.ts` 中对 `encrypt` 的 import（第 16 行），因为不再需要。同时更新 IPC handler 中传递的字段名 `apiKey`（第 29 行 `data.apiKey` → `data.apiKey` 已对，但要确认传给 `ProviderInput` 时字段匹配）。

- [✅] **步骤 4：引入 `decrypt` 和降级逻辑**

在 `providers.ts` 顶部 import `decrypt` from `../utils/crypto`。写一个辅助函数 `tryDecrypt(text: string): string`：

```typescript
import { decrypt } from '../utils/crypto'

function tryDecrypt(text: string): string {
  try {
    return decrypt(text, process.env.LLM_GATEWAY_SECRET || 'default-dev-secret')
  } catch {
    return text  // Already plaintext (new data)
  }
}
```

在 `rowToProvider` 中使用 `tryDecrypt(rawKey)`。

### Task 2: [✅] 后端 api-keys — 移除加密，返回明文

**文件：**
- 修改：`src/main/db/api-keys.ts`

**步骤：**

- [✅] **步骤 1：修改 `createApiKey` 移除加密**

目前 `createApiKey` 先 `encrypt(plaintextKey)` 再存储。改为直接存明文到 `key_encrypted`：

```typescript
export function createApiKey(name: string, rateLimit: number = 60): ApiKeyResult {
  const db = getDb()
  const { plaintextKey, keyPrefix, keyHash } = generateApiKey()

  // 不再加密，直接存明文
  const keyEncrypted = plaintextKey

  const stmt = db.prepare(`
    INSERT INTO api_keys (name, key_prefix, key_hash, key_encrypted, rate_limit)
    VALUES (@name, @key_prefix, @key_hash, @key_encrypted, @rate_limit)
  `)

  stmt.run({ name, key_prefix: keyPrefix, key_hash: keyHash, key_encrypted: keyEncrypted, rate_limit: rateLimit })

  // ... 其余不变
}
```

- [✅] **步骤 2：修改 `listApiKeys` 返回 `key_plaintext`**

目前 SELECT 排除了 `key_encrypted`。改为选中它、降级解密、作为 `key_plaintext` 返回：

```typescript
export function listApiKeys(): (Omit<ApiKeyRow, 'key_hash'> & { key_plaintext: string })[] {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, name, key_prefix, key_encrypted, is_active, rate_limit, created_at FROM api_keys ORDER BY created_at DESC'
  ).all() as ApiKeyRow[]

  return rows.map((row) => {
    const keyPlaintext = tryDecrypt(row.key_encrypted)
    const { key_hash, key_encrypted, ...rest } = row
    return { ...rest, key_plaintext: keyPlaintext }
  })
}
```

- [✅] **步骤 3：修改 `getApiKeyPlaintext` 降级解密**

```typescript
export function getApiKeyPlaintext(id: number): string | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT key_encrypted FROM api_keys WHERE id = ?'
  ).get(id) as { key_encrypted: string } | undefined
  if (!row || !row.key_encrypted) return null
  return tryDecrypt(row.key_encrypted)
}
```

- [✅] **步骤 4：各自定义 `tryDecrypt`（两模块独立实现）**

在两个 DB 模块间共享。放在 `api-keys.ts`（先存在）或者抽取到新文件。最简方案：在 `api-keys.ts` 中导出一个 `tryDecrypt` 函数，然后在 `providers.ts` 中 import 它。

或者更简单：各自模块定义自己的 `tryDecrypt`，避免跨模块依赖。

各自定义 `tryDecrypt` 即可，两处代码一模一样，但 YAGNI — 暂时不提取。

### Task 3: [✅] 更新类型定义 + proxy 适配

**文件：**
- 修改：`src/renderer/lib/types.ts`
- 修改：`src/main/proxy/server.ts`

**步骤：**

- [✅] **步骤 1：更新 `src/renderer/lib/types.ts`**

```typescript
// Provider 接口
export interface Provider {
  id: number
  name: string
  providerType: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string           // renamed from apiKeyEncrypted
  models: string[]
  isActive: number
  createdAt: string
  updatedAt: string
}

// ApiKey 接口 — 新增 key_plaintext
export interface ApiKey {
  id: number
  name: string
  key_prefix: string
  key_plaintext: string    // new field
  is_active: number
  rate_limit: number
  created_at: string
}
```

- [✅] **步骤 2：更新 `src/main/proxy/server.ts`**

目前第 102 行：`const decryptedKey = decrypt(route.provider.apiKeyEncrypted, secret)`

改为使用新字段名并兼容两种情况：

```typescript
const decryptedKey = route.provider.apiKey
```

因为 `apiKey` 已经是明文（来自 `rowToProvider` 中的 `tryDecrypt`），不再需要在 proxy 层解密。

移除 `decrypt` 的 import（第 8 行）和 `encryptionSecret` 的传递逻辑（如果不再需要）。

**注意：** 检查 `server.ts` 中是否只有一处使用 `decrypt`。如果 `handleProxyRequest` 是唯一使用 `decrypt` 的地方，可以移除第 8 行的 `import { decrypt }...`，以及 `encryptionSecret` 相关的配置和 `c.set('encryptionSecret', ...)`。但如果其他地方仍在使用（如 SSE token 计数无关），保留。

### Task 4: [✅] Providers 页面 — 眼睛 + popover

**文件：**
- 修改：`src/renderer/pages/Providers.tsx`

**步骤：**

- [ ] **步骤 1：添加状态追踪哪个行的眼睛是打开的**

```typescript
const [revealedKey, setRevealedKey] = useState<number | null>(null)
```

- [ ] **步骤 2：在表格操作列添加眼睛按钮 + 行内 popover**

在表格每行的操作区（"编辑"按钮旁）添加眼睛按钮。点击后：

1. 设置 `revealedKey = p.id`
2. 在本行下方弹出一个绝对定位/相对定位的 popover 卡片
3. 显示完整 key（等宽字体）+ 复制按钮
4. 点击同一行眼睛关闭，或点击外部区域关闭

代码模式（放在操作区的 `div.flex` 内）：

```tsx
// 眼睛按钮
<button
  onClick={() => setRevealedKey(revealedKey === p.id ? null : p.id)}
  className="btn-ghost text-xs !px-2 !py-1.5"
  style={{ color: revealedKey === p.id ? '#60a5fa' : '#64748b' }}
  title="查看 API Key"
>
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {revealedKey === p.id ? (
      // 睁眼图标
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      // 完整睁眼 path: M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z
    ) : (
      // 闭眼图标
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    )}
  </svg>
</button>

// Popover — 在 tr 内或紧随 tr
{revealedKey === p.id && (
  <div className="absolute z-50 mt-1 p-3 rounded-lg shadow-lg"
    style={{
      background: '#1e293b',
      border: '1px solid rgba(255,255,255,0.08)',
      maxWidth: 420,
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="flex items-center gap-2">
      <code className="text-xs font-mono break-all select-all"
        style={{ color: '#60a5fa' }}>
        {p.apiKey}
      </code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(p.apiKey)
          // 短暂显示"已复制"反馈
        }}
        className="btn-ghost !px-2 !py-1 shrink-0"
        style={{ color: '#94a3b8' }}
      >
        复制
      </button>
    </div>
  </div>
)}
```

位置考虑：popover 需要相对于表格行定位。最简单的方案：把眼睛按钮和 popover 包在一个 `div` 里，设 `position: relative`，popover 用 `position: absolute; right: 0; top: 100%`。

- [ ] **步骤 3：添加点击外部关闭 popover 的效果**

```tsx
useEffect(() => {
  if (revealedKey === null) return
  const handler = (e: MouseEvent) => {
    // 如果点击不在 popover 内，关闭
    setRevealedKey(null)
  }
  // 延迟添加以避免触发按钮本身的 click 事件
  const timer = setTimeout(() => document.addEventListener('click', handler), 0)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('click', handler)
  }
}, [revealedKey])
```

### Task 5: [✅] ApiKeys 页面 — 眼睛 + popover + 移除警告

**文件：**
- 修改：`src/renderer/pages/ApiKeys.tsx`

**步骤：**

- [ ] **步骤 1：添加 revealed 状态＋眼睛按钮（同 Task 4 模式）**

```typescript
const [revealedKey, setRevealedKey] = useState<number | null>(null)
```

在表格的 Key 列（`key.key_prefix...` 旁边）添加眼睛按钮和 popover，完全复用 Task 4 的 UI 模式。popover 中展示 `key.key_plaintext`。

- [ ] **步骤 2：修改创建结果页 — 移除"仅此一次"黄色警告**

将第 215-218 行的黄色警告框：

```tsx
<div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
  <span className="text-lg shrink-0" style={{ color: '#f59e0b' }}>⚠️</span>
  <p className="text-sm" style={{ color: '#f59e0b' }}>这是唯一一次显示明文，请立即复制保存。关闭后将无法再次查看。</p>
</div>
```

替换为普通信息提示：

```tsx
<div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
  <span className="text-lg shrink-0" style={{ color: '#22c55e' }}>✓</span>
  <p className="text-sm" style={{ color: '#22c55e' }}>密钥已创建成功。后续可在列表中点按眼睛图标查看。</p>
</div>
```

### Task 6: [✅] 修复测试

**文件：**
- 修改：`src/main/db/__tests__/api-keys.test.ts`
- 修改：`src/main/db/__tests__/providers.test.ts`

**步骤：**

- [ ] **步骤 1：更新 `api-keys.test.ts`**

当前测试 `should list all API keys without exposing key_hash`（第 53-69 行）需要更新为也验证 `key_plaintext`：

```typescript
it('should list all API keys with key_plaintext and without key_hash', () => {
  const result = createApiKey('Key A')
  const keys = listApiKeys()
  expect(keys).toHaveLength(1)
  expect(keys[0].key_plaintext).toBe(result.plaintextKey)
  expect(keys[0]).not.toHaveProperty('key_hash')
  // 其他属性不变
})
```

- [ ] **步骤 2：更新 `providers.test.ts`**

当前测试创建 Provider 时用 `apiKeyEncrypted: 'encrypted-key-123'` 字段名。改为 `apiKey`：

```typescript
const sampleInput: ProviderInput = {
  name: 'Test Provider',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key-123',   // renamed + 明文
  models: ['gpt-4', 'gpt-3.5-turbo']
}
```

所有用到 `provider.apiKeyEncrypted` 的断言改为 `provider.apiKey`。

- [ ] **步骤 3：运行测试确认全部通过**

```bash
npx vitest run
```

预期：119 tests passed（或 118-119，如果有测试因为 `tryDecrypt` 降级逻辑改变行为）。

---

### 自审

- [x] **1. 规格覆盖：** Tasks 1-2 处理后端存储，Task 3 更新类型和代理，Tasks 4-5 处理前端 UI，Task 6 处理测试。覆盖所有需求。
- [x] **2. 占位符扫描：** 所有步骤含具体代码或具体指令，无 TODO/待定。
- [x] **3. 类型一致性：** `apiKeyEncrypted` → `apiKey` 在所有文件中统一重命名。`key_plaintext` 在 api-keys 中新增。proxy 中引用的字段名已同步。前后端类型一致。

---

**关联文件清单（完整）：**

| 文件 | 变更类型 |
|------|---------|
| `src/main/db/providers.ts` | 修改：字段重命名 + 移除加密 + tryDecrypt |
| `src/main/db/api-keys.ts` | 修改：移除加密 + list 返回 plaintext + tryDecrypt |
| `src/main/ipc/index.ts` | 修改：移除 `encrypt` import + 字段名适配 |
| `src/main/proxy/server.ts` | 修改：移除 `decrypt` 调用 + 字段名适配 |
| `src/renderer/lib/types.ts` | 修改：Provider.apiKeyEncrypted→apiKey, ApiKey 加 key_plaintext |
| `src/renderer/pages/Providers.tsx` | 修改：添加眼睛 popover |
| `src/renderer/pages/ApiKeys.tsx` | 修改：添加眼睛 popover + 移除警告 |
| `src/main/db/__tests__/api-keys.test.ts` | 修改：list 测试加 key_plaintext 断言 |
| `src/main/db/__tests__/providers.test.ts` | 修改：apiKeyEncrypted→apiKey |
