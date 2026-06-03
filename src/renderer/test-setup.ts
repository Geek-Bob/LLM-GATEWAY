/**
 * 测试环境初始化
 *
 * 导入 @testing-library/jest-dom 扩展 vitest 的 expect 匹配器，
 * 使 toBeInTheDocument()、toHaveClass() 等 DOM 断言方法可用。
 * 此文件通过 vite.config.ts 的 test.setupFiles 配置自动加载。
 */
import '@testing-library/jest-dom'
