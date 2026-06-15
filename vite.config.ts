import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 独立运行 playground 的 dev harness：`pnpm --filter @stableops/playground dev`。
// root 指向 example/（含 index.html）；组件从 ../src 源码直引，改动即热更新。
// Tailwind v4 用官方 @tailwindcss/vite 插件（比 PostCSS 路径更稳，能正确处理 @import "tailwindcss"）。
//
// 工作区依赖（api-sdk / wallet-sdk）产物是 CJS 且用 export * 桶文件，需显式：
//   - dev：optimizeDeps.include 让 esbuild 预打包并转出具名导出；
//   - build：commonjsOptions.include 让 commonjs 插件处理 packages/*/dist。
// 否则 Rollup/浏览器解析不到具名导出（Next 因 transpilePackages 不受影响）。
const workspaceDeps = ['@stableops/api-sdk', '@stableops/wallet-sdk']

export default defineConfig({
  root: 'example',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: workspaceDeps,
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages\/[^/]+\/dist/],
    },
  },
})
