/**
 * 共享类型契约测试（type-only）—— Task 0：思考参数透传 Layer 0
 *
 * 靠 TypeScript 编译器在 type-check 阶段报错体现"失败"：
 * - expectTypeOf 的 toEqualTypeOf 在运行时是 no-op，靠 tsc/vitest typecheck 报错体现
 * - 前端 vitest 已启用 typecheck 模式覆盖 .test-d 文件（src/shared 不在 exclude）
 * - 最终验收命令 npx tsc -b --noEmit（前后端项目引用都覆盖 src/shared）
 * - 同时附 satisfies 静态断言，双保险验证字段集合与可选性
 * 注意：块注释内禁止出现 glob 的斜杠星号序列，否则会被当成注释结束符。
 *
 * 目标：固定 ThinkingType / ReasoningEffort 字面量集合 + ConversationEntity 两个新可选字段，
 * 防止后续任务误改导致跨进程契约破裂。
 */
import { describe, it, expectTypeOf } from 'vitest'
import type { ConversationEntity, ReasoningEffort, ThinkingType } from './types'

describe('ThinkingType type contract', () => {
  it('含且仅含 disabled | enabled | adaptive 三个字面量', () => {
    expectTypeOf<ThinkingType>().toEqualTypeOf<'disabled' | 'enabled' | 'adaptive'>()
  })
})

describe('ReasoningEffort type contract', () => {
  it('含且仅含 minimal | low | medium | high | xhigh | max 六个字面量', () => {
    expectTypeOf<ReasoningEffort>().toEqualTypeOf<
      'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
    >()
  })
})

describe('ConversationEntity 扩展字段契约', () => {
  it('thinkingType 为可选字段，类型 ThinkingType | undefined', () => {
    expectTypeOf<ConversationEntity['thinkingType']>().toEqualTypeOf<ThinkingType | undefined>()
  })

  it('reasoningEffort 为可选字段，类型 ReasoningEffort | undefined', () => {
    expectTypeOf<ConversationEntity['reasoningEffort']>().toEqualTypeOf<ReasoningEffort | undefined>()
  })

  it('保留现有字段不破坏向后兼容', () => {
    expectTypeOf<ConversationEntity['id']>().toEqualTypeOf<number>()
    expectTypeOf<ConversationEntity['title']>().toEqualTypeOf<string>()
    expectTypeOf<ConversationEntity['providerId']>().toEqualTypeOf<number | null>()
    expectTypeOf<ConversationEntity['model']>().toEqualTypeOf<string>()
    expectTypeOf<ConversationEntity['apiKeyId']>().toEqualTypeOf<number | null>()
    expectTypeOf<ConversationEntity['createdAt']>().toEqualTypeOf<string>()
    expectTypeOf<ConversationEntity['updatedAt']>().toEqualTypeOf<string>()
  })
})

// satisfies 双保险：验证可选性（旧对话省略新字段合法）+ 新对话含新字段合法
const _legacy: ConversationEntity = {
  id: 1,
  title: '旧对话',
  providerId: null,
  model: 'gpt-4',
  apiKeyId: null,
  createdAt: '2026-06-19T00:00:00Z',
  updatedAt: '2026-06-19T00:00:00Z',
} satisfies ConversationEntity

const _withThinking: ConversationEntity = {
  id: 2,
  title: '思考对话',
  providerId: 1,
  model: 'kimi-k2.7-code',
  apiKeyId: 1,
  createdAt: '2026-06-19T00:00:00Z',
  updatedAt: '2026-06-19T00:00:00Z',
  thinkingType: 'adaptive',
  reasoningEffort: 'high',
} satisfies ConversationEntity

void _legacy
void _withThinking
