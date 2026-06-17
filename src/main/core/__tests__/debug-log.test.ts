import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'path'

// 可变的 packaged 标志，驱动 dev/正式包分支；mock 工厂闭包捕获引用
let mockIsPackaged = false

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => 'E:/code/llm-gateway'),
    getPath: vi.fn(() => 'C:/Programs/llm-gateway/llm-gateway.exe'),
    // isPackaged 不能用 vi.fn（electron 类型为 boolean），用 getter 读外部变量
    get isPackaged() {
      return mockIsPackaged
    },
  },
}))

beforeEach(() => {
  // 每个用例前重置为 dev 默认值，隔离用例间状态泄漏
  mockIsPackaged = false
})

describe('debug-log 路径助手', () => {
  it('dev 模式返回项目根目录', async () => {
    const { getDebugLogDir } = await import('../debug-log')
    expect(getDebugLogDir()).toBe('E:/code/llm-gateway')
  })

  it('dev 模式拼接文件名到项目根', async () => {
    const { getDebugLogPath } = await import('../debug-log')
    // path.join 在 win32 下用反斜杠，故用平台无关断言
    expect(getDebugLogPath('update.log')).toBe(path.join('E:/code/llm-gateway', 'update.log'))
    expect(getDebugLogPath('proxy-debug.log')).toBe(path.join('E:/code/llm-gateway', 'proxy-debug.log'))
  })

  it('正式包返回安装目录下的 logs/', async () => {
    mockIsPackaged = true

    const { getDebugLogDir, getDebugLogPath } = await import('../debug-log')
    const expectedDir = path.join('C:/Programs/llm-gateway', 'logs')
    expect(getDebugLogDir()).toBe(expectedDir)
    expect(getDebugLogPath('auth-debug.log')).toBe(path.join(expectedDir, 'auth-debug.log'))
  })
})
