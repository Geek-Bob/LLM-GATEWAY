import { describe, it, expect } from 'vitest'
import { applyMigrators, type ConfigMigrator } from '../config-migration'

interface SampleConfig {
  newA: string
  newB: number
}

describe('applyMigrators', () => {
  it('空 migrator 数组应返回 {}', () => {
    const result = applyMigrators<SampleConfig>({ oldA: 'x' }, [])
    expect(result).toEqual({})
  })

  it('单个 migrator 应应用其结果', () => {
    const m: ConfigMigrator<SampleConfig> = (raw) => {
      if (typeof raw !== 'object' || raw === null) return {}
      const r = raw as Record<string, unknown>
      if (typeof r.oldA === 'string') return { newA: r.oldA }
      return {}
    }
    const result = applyMigrators<SampleConfig>({ oldA: 'hello' }, [m])
    expect(result).toEqual({ newA: 'hello' })
  })

  it('多个 migrator 后者覆盖前者', () => {
    const m1: ConfigMigrator<SampleConfig> = () => ({ newA: 'first' })
    const m2: ConfigMigrator<SampleConfig> = () => ({ newA: 'second' })
    const result = applyMigrators<SampleConfig>({}, [m1, m2])
    expect(result).toEqual({ newA: 'second' })
  })

  it('多个 migrator 不冲突字段应合并', () => {
    const m1: ConfigMigrator<SampleConfig> = () => ({ newA: 'a' })
    const m2: ConfigMigrator<SampleConfig> = () => ({ newB: 42 })
    const result = applyMigrators<SampleConfig>({}, [m1, m2])
    expect(result).toEqual({ newA: 'a', newB: 42 })
  })

  it('raw 为 null 时应返回 {}', () => {
    const m: ConfigMigrator<SampleConfig> = () => ({ newA: 'x' })
    const result = applyMigrators<SampleConfig>(null, [m])
    expect(result).toEqual({})
  })

  it('raw 为 undefined 时应返回 {}', () => {
    const m: ConfigMigrator<SampleConfig> = () => ({ newA: 'x' })
    const result = applyMigrators<SampleConfig>(undefined, [m])
    expect(result).toEqual({})
  })

  it('raw 为字符串时应返回 {}', () => {
    const m: ConfigMigrator<SampleConfig> = () => ({ newA: 'x' })
    const result = applyMigrators<SampleConfig>('not an object', [m])
    expect(result).toEqual({})
  })

  it('raw 为数字时应返回 {}', () => {
    const m: ConfigMigrator<SampleConfig> = () => ({ newA: 'x' })
    const result = applyMigrators<SampleConfig>(42, [m])
    expect(result).toEqual({})
  })
})
