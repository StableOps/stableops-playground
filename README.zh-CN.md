# StableOps Playground

可嵌入的 StableOps 支付流程 React playground。

[English](./README.md)

`@stableops/playground` 提供一个自包含的 `<Playground>` 组件，**直接在浏览器里**
走完一笔 StableOps 支付单的完整生命周期：创建订单 → 钱包链上支付 → 等待
`confirmed` → 等待 `finalized`。它用 [`@stableops/api-sdk`](https://www.npmjs.com/package/@stableops/api-sdk) 建单与轮询，
用 [`@stableops/wallet-sdk`](https://www.npmjs.com/package/@stableops/wallet-sdk) 唤起用户钱包发送真实测试网转账。
无需服务端代理 —— 调用方通过 prop 或组件内置输入框提供 API key。

## 运行要求

- **浏览器**运行时。当「自动导入」开启且选用 TRON 链时，sandbox 地址派生会用
  Web Crypto（`globalThis.crypto.subtle`）做 base58check 的 SHA-256；现代浏览器均原生支持。
  其他链（EVM、Solana）不会用到 Web Crypto。
- React 18 或 19（peer 依赖）。
- 宿主需提供 Tailwind CSS v4 与 shadcn 设计变量（`--card`、`--muted`、`--primary` 等）——
  组件用工具类渲染并读取这些 CSS 变量配色。请确保 Tailwind 扫描到本包，例如在全局样式里：
  `@source '../node_modules/@stableops/playground/dist/**/*.js';`
- 一个 StableOps **sandbox** API key（见「安全」）。

## 安全

本组件是客户端 demo，会把你提供的 API key 直接从浏览器发往 StableOps API，因此：

- **只使用 sandbox key。** 切勿在浏览器代码中嵌入生产 key。
- API key 的环境是权威值 —— StableOps API 按 key 解析组织与环境，所以 sandbox key
  始终运行在 sandbox。
- 在生产集成里，请把 API key 放在后端，前端只用 `@stableops/wallet-sdk` 完成钱包转账。

## 安装

```bash
pnpm add @stableops/playground @stableops/api-sdk @stableops/wallet-sdk react react-dom
```

## 使用

```tsx
import { Playground } from '@stableops/playground'

export function Demo() {
  return (
    <Playground
      // 可选默认 key；用户也可在 UI 里粘贴自己的 key。
      apiKey={process.env.NEXT_PUBLIC_STABLEOPS_SANDBOX_KEY}
      baseUrl="https://api.stableops.dev"
      locale="zh"
    />
  )
}
```

在 React Server Components 宿主（如 Next.js App Router）中，请从 client 组件
（带 `"use client"` 的文件）渲染它。

## Props

| Prop               | 类型                  | 默认值                      | 说明                                                            |
| ------------------ | --------------------- | --------------------------- | --------------------------------------------------------------- |
| `apiKey`           | `string`              | —                           | 默认 API key。组件同时提供输入框，用户可粘贴/覆盖自己的 key。   |
| `baseUrl`          | `string`              | `https://api.stableops.dev` | StableOps API base URL，需浏览器可达且在 API 的 CORS 白名单内。 |
| `locale`           | `'en' \| 'zh'`        | `'en'`                      | 界面语言。                                                      |
| `className`        | `string`              | —                           | 根容器额外类名。                                                |

组件 UI 内还提供一个 **「自动导入 sandbox 收款地址」** 勾选框（默认开启）：开启时
会在建单前导入一个确定性 burner sandbox 地址——适合 org 还没任何地址的场景。关闭后
只使用你在 Dashboard → 收款地址 中维护的地址；若此时地址池为空导致建单失败，活动
日志会给出指向 dashboard 的提示。

## 工作原理

1. **建单** —— 经 `@stableops/api-sdk` 调 `POST /v1/payment-orders`（带 `Idempotency-Key`）。
   勾选「自动导入 sandbox 收款地址」（默认开启）时会先导入一个确定性 burner sandbox 地址，
   供订单分配。
2. **链上支付** —— `@stableops/wallet-sdk` 选出可支付指令并唤起浏览器钱包发送
   ERC-20 / SPL / TRC-20 转账。
3. **等待 confirmed / finalized** —— 轮询 `GET /v1/payment-orders/:id`，由 scanner 与
   confirmations watcher 推进订单。

链下拉框展示的测试网目录内置于本包（`PlaygroundTestnets`），无需任何 playground 专用 API 端点。

## 独立运行 playground

包内自带 Vite dev harness，无需嵌入其他应用即可单独运行：

```bash
pnpm dev
```

页面来自 `example/`（默认 http://localhost:5173）。用 `VITE_STABLEOPS_API_URL`
指向不同 API（默认 `http://localhost:3001`），然后在界面里粘贴 sandbox API key。

## 许可

本包基于 `Apache-2.0` 许可。见 [LICENSE](./LICENSE)。
