/**
 * Window.electronAPI 类型契约测试（type-only）
 *
 * 这是 type-level 测试，依赖 vitest 的 typecheck 模式与 tsc --noEmit 验证：
 * - `expectTypeOf().toEqualTypeOf<T>()` 在运行时是 no-op，靠 TS 编译器在
 *   type-check 阶段报错来体现"失败"
 * - 仓库实际验收命令为 `npx tsc -p tsconfig.web.json --noEmit`
 *
 * 本文件的目标：固定 `Window.electronAPI.agents.readConfigFile` 的签名，
 * 防止后续误删类型声明导致 `lib/queries/agents.ts` 触发 TS2339。
 */
import { describe, it, expectTypeOf } from 'vitest'

describe('Window.electronAPI.agents 类型契约', () => {
  it('readConfigFile 必须存在且签名为 (agentId: number) => Promise<string>', () => {
    expectTypeOf<Window['electronAPI']['agents']['readConfigFile']>()
      .toEqualTypeOf<(agentId: number) => Promise<string>>()
  })
})
