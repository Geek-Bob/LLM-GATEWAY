import { describe, it, expect } from 'vitest'
import { compareVersions, isNewerVersion } from '../version'

describe('compareVersions', () => {
  it('相同版本返回 0', () => {
    expect(compareVersions('1.0.4', '1.0.4')).toBe(0)
  })

  it('a 更新返回正数', () => {
    expect(compareVersions('1.0.5', '1.0.4')).toBeGreaterThan(0)
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0)
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0)
  })

  it('a 更旧返回负数', () => {
    expect(compareVersions('1.0.3', '1.0.4')).toBeLessThan(0)
    expect(compareVersions('1.0.4', '1.1.0')).toBeLessThan(0)
  })

  it('位数不等时按缺失段为 0 处理', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0)
  })

  it('忽略预发布后缀（仅比较主版本段）', () => {
    expect(compareVersions('1.0.4-beta', '1.0.4')).toBe(0)
    expect(compareVersions('1.0.5-rc.1', '1.0.4')).toBeGreaterThan(0)
  })
})

describe('isNewerVersion', () => {
  it('远程更新返回 true', () => {
    expect(isNewerVersion('1.0.5', '1.0.4')).toBe(true)
  })

  it('远程相同返回 false', () => {
    expect(isNewerVersion('1.0.4', '1.0.4')).toBe(false)
  })

  it('远程更旧返回 false（防止降级提示）', () => {
    expect(isNewerVersion('1.0.3', '1.0.4')).toBe(false)
  })
})
