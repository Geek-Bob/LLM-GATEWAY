import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/main/**/*.test.ts'],
    exclude: ['out/**', 'node_modules/**', 'references/**']
  }
})
