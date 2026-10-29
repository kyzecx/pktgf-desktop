import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@engine': resolve('src/engine'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    // 导出帧渲染是 950×540 × N 的 CPU 活，共享 runner 上 5s 默认超时会偶发失败
    testTimeout: 30_000,
  },
})
