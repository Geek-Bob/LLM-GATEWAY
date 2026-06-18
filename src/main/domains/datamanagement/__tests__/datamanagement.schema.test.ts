// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { clearDataSchema } from '../datamanagement.schema'
import type { ClearDataInputParsed } from '../datamanagement.schema'

describe('clearDataSchema', () => {
  describe('合法输入', () => {
    it('business=true operational=false 时接受', () => {
      const result = clearDataSchema.parse({ business: true, operational: false })
      expect(result).toEqual({ business: true, operational: false })
    })

    it('business=false operational=true 时接受', () => {
      const result = clearDataSchema.parse({ business: false, operational: true })
      expect(result).toEqual({ business: false, operational: true })
    })

    it('business=true operational=true 时接受', () => {
      const result = clearDataSchema.parse({ business: true, operational: true })
      expect(result).toEqual({ business: true, operational: true })
    })
  })

  describe('非法输入', () => {
    it('business=false operational=false 时拒绝（至少一个为 true）', () => {
      try {
        clearDataSchema.parse({ business: false, operational: false })
        throw new Error('应抛出 ZodError 但未抛出')
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        const issues = (e as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
        expect(issues).toBeDefined()
        expect(issues!.length).toBeGreaterThan(0)
        // refine 错误必须明确指向 business 或 operational 字段
        const touchedPaths = issues!.flatMap((i) => i.path)
        expect(touchedPaths).toContain('business')
        // 错误消息涉及"至少一个"
        const messages = issues!.map((i) => i.message).join(' ')
        expect(messages).toMatch(/至少一个/)
      }
    })

    it('business 为非 boolean（字符串 yes）时拒绝', () => {
      try {
        // 故意传入错误类型，绕过 TS 检查
        clearDataSchema.parse({ business: 'yes', operational: true } as unknown as { business: boolean; operational: boolean })
        throw new Error('应抛出 ZodError 但未抛出')
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        const issues = (e as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
        expect(issues).toBeDefined()
        const businessIssue = issues!.find((i) => i.path.includes('business'))
        expect(businessIssue).toBeDefined()
      }
    })

    it('空对象（缺字段）时拒绝', () => {
      try {
        clearDataSchema.parse({} as unknown as { business: boolean; operational: boolean })
        throw new Error('应抛出 ZodError 但未抛出')
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        const issues = (e as { issues?: Array<{ path: (string | number)[]; message: string }> }).issues
        expect(issues).toBeDefined()
        const touchedPaths = issues!.flatMap((i) => i.path)
        expect(touchedPaths).toContain('business')
        expect(touchedPaths).toContain('operational')
      }
    })
  })

  describe('导出类型', () => {
    it('ClearDataInputParsed 类型为 { business: boolean; operational: boolean }', () => {
      // 类型层面验证：运行时 no-op，仅靠 tsc 校验
      const value: ClearDataInputParsed = { business: true, operational: false }
      expect(value.business).toBe(true)
      expect(value.operational).toBe(false)
    })
  })
})
