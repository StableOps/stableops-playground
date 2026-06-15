import { defineConfig } from 'vitest/config'

// 独立的 vitest 配置：避免 vitest 误用 example 的 vite.config.ts（其 root 指向 example/，
// 会导致找不到 src 下的单测）。这里把测试根固定在包目录、只收 src 下的 *.spec.ts。
export default defineConfig({
  test: {
    root: '.',
    include: ['src/**/*.spec.ts'],
  },
})
