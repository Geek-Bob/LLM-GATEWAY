import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { updateConfigPartialSchema } from '../update.schema'

describe('updateConfigPartialSchema', () => {
  describe('合法输入', () => {
    it('应接受空对象（所有字段可选）', () => {
      expect(updateConfigPartialSchema.parse({})).toEqual({})
    })

    it('应接受仅 isAutoCheckEnabled 字段', () => {
      const input = { isAutoCheckEnabled: true }
      expect(updateConfigPartialSchema.parse(input)).toEqual(input)
    })

    it('应接受仅 checkInterval 字段（正整数毫秒）', () => {
      const input = { checkInterval: 4 * 60 * 60 * 1000 }
      expect(updateConfigPartialSchema.parse(input)).toEqual(input)
    })

    it('应接受仅 isPrereleaseAllowed 字段', () => {
      const input = { isPrereleaseAllowed: false }
      expect(updateConfigPartialSchema.parse(input)).toEqual(input)
    })

    it('应接受 skipVersion 为字符串', () => {
      const input = { skipVersion: 'v1.2.3' }
      expect(updateConfigPartialSchema.parse(input)).toEqual(input)
    })

    it('应接受 skipVersion 为 null（清空已跳过版本）', () => {
      const input = { skipVersion: null }
      expect(updateConfigPartialSchema.parse(input)).toEqual(input)
    })

    it('应接受所有字段同时存在', () => {
      const input = {
        isAutoCheckEnabled: true,
        checkInterval: 3600000,
        isPrereleaseAllowed: true,
        skipVersion: 'v2.0.0',
      }
      expect(updateConfigPartialSchema.parse(input)).toEqual(input)
    })
  })

  describe('非法输入', () => {
    it('应拒绝 isAutoCheckEnabled 为字符串', () => {
      expect(() => updateConfigPartialSchema.parse({ isAutoCheckEnabled: 'yes' })).toThrow(ZodError)
    })

    it('应拒绝 isAutoCheckEnabled 为数字', () => {
      expect(() => updateConfigPartialSchema.parse({ isAutoCheckEnabled: 1 })).toThrow(ZodError)
    })

    it('应拒绝 checkInterval 为负数', () => {
      expect(() => updateConfigPartialSchema.parse({ checkInterval: -100 })).toThrow(ZodError)
    })

    it('应拒绝 checkInterval 为 0（必须为正整数）', () => {
      expect(() => updateConfigPartialSchema.parse({ checkInterval: 0 })).toThrow(ZodError)
    })

    it('应拒绝 checkInterval 为浮点数', () => {
      expect(() => updateConfigPartialSchema.parse({ checkInterval: 1.5 })).toThrow(ZodError)
    })

    it('应拒绝 checkInterval 为字符串', () => {
      expect(() => updateConfigPartialSchema.parse({ checkInterval: '3600' })).toThrow(ZodError)
    })

    it('应拒绝 isPrereleaseAllowed 为字符串', () => {
      expect(() => updateConfigPartialSchema.parse({ isPrereleaseAllowed: 'true' })).toThrow(ZodError)
    })

    it('应拒绝 skipVersion 为数字', () => {
      expect(() => updateConfigPartialSchema.parse({ skipVersion: 123 })).toThrow(ZodError)
    })

    it('应拒绝未知字段（strict 模式）', () => {
      expect(() => updateConfigPartialSchema.parse({ unknownField: 'value' })).toThrow(ZodError)
    })

    it('应拒绝旧字段名 autoCheck（已迁移为 isAutoCheckEnabled）', () => {
      expect(() => updateConfigPartialSchema.parse({ autoCheck: true })).toThrow(ZodError)
    })

    it('应拒绝 null 输入', () => {
      expect(() => updateConfigPartialSchema.parse(null)).toThrow(ZodError)
    })

    it('应拒绝非对象输入', () => {
      expect(() => updateConfigPartialSchema.parse('config')).toThrow(ZodError)
    })
  })
})
