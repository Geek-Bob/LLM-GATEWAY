import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/test-setup.ts'],
    exclude: ['out/**', 'node_modules/**', 'references/**', 'src/main/**'],
    // 启用 typecheck 模式以执行 .test-d.ts 类型契约测试（Task 1.5 防回归）
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.{ts,tsx}']
    }
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src/renderer') }
  }
})
