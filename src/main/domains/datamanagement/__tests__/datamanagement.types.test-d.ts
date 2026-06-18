/**
 * 数据管理类型契约测试（type-only）
 *
 * 靠 TypeScript 编译器在 type-check 阶段报错体现"失败"：
 * - expectTypeOf 的 toEqualTypeOf 在运行时是 no-op
 * - 后端 vitest 配置 include 仅匹配后端 .test.ts，不识别 .test-d.ts
 * - 本文件最终验收命令为 npx tsc -p tsconfig.node.json --noEmit
 *   （tsconfig.node.json 的 include 覆盖 src 下 main 目录全部文件）
 * - 同时附 satisfies 静态断言，双保险验证字段集合
 *
 * 目标：固定 ClearDataInput / ClearDataResult 的字段结构，
 * 防止后续任务误改字段导致跨进程契约破裂。
 */
import { describe, it, expectTypeOf } from 'vitest'
import type { ClearDataInput, ClearDataResult } from '../../../../shared/types'

describe('ClearDataInput type contract', () => {
  it('has exactly business: boolean and operational: boolean', () => {
    expectTypeOf<ClearDataInput>().toEqualTypeOf<{
      business: boolean
      operational: boolean
    }>()
  })

  it('business and operational are boolean (not object, not optional)', () => {
    expectTypeOf<ClearDataInput['business']>().toEqualTypeOf<boolean>()
    expectTypeOf<ClearDataInput['operational']>().toEqualTypeOf<boolean>()
  })
})

describe('ClearDataResult type contract', () => {
  it('business and operational are { cleared: boolean } objects', () => {
    expectTypeOf<ClearDataResult['business']>().toEqualTypeOf<{ cleared: boolean }>()
    expectTypeOf<ClearDataResult['operational']>().toEqualTypeOf<{ cleared: boolean }>()
  })

  it('business.cleared and operational.cleared are boolean', () => {
    expectTypeOf<ClearDataResult['business']['cleared']>().toEqualTypeOf<boolean>()
    expectTypeOf<ClearDataResult['operational']['cleared']>().toEqualTypeOf<boolean>()
  })
})

// 静态断言 + satisfies 双保险：固定字段集合，多余或缺失字段均触发 tsc 错误
const _input: ClearDataInput = { business: true, operational: false } satisfies ClearDataInput
const _result: ClearDataResult = {
  business: { cleared: true },
  operational: { cleared: false }
} satisfies ClearDataResult
void _input
void _result
