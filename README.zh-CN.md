# StableOps Playground

[查看英文说明](./README.md)

这是 StableOps 的公开示例仓库，用于演示沙盒接入，不发布到 npm。你可以克隆仓库运行示例，也可以复用其中的 React 源码。`@stableops/playground` 名称仅保留用于本地工作区引用。

`@stableops/playground` 提供可嵌入 React 应用的沙盒演练组件。`Playground` 演示创建订单、钱包付款和付款状态查询。`Checkout` 演示托管收银台付款，`Subscription` 演示商户订阅与账单操作。

这些组件直接在浏览器中调用 StableOps，只能使用沙盒 API 密钥。真实业务的 API 密钥应保留在后端，前端通过 `@stableops/wallet-sdk` 完成钱包转账。

## 运行示例

需要 Node.js 22.12 或更高版本，以及 pnpm 10.33.2。

```bash
git clone https://github.com/StableOps/stableops-playground.git
cd stableops-playground
pnpm install
pnpm dev
```

打开 http://localhost:5173，在界面中输入沙盒 API 密钥。示例已包含 Solana 和 TRON 所需依赖。启用 WalletConnect 时，在本地 `.env` 文件中设置 `VITE_WALLETCONNECT_PROJECT_ID`，然后启动示例。`VITE_STABLEOPS_API_URL` 和 `VITE_CHECKOUT_URL` 可分别覆盖默认 API 地址和托管收银台地址。

运行 `pnpm build:example` 和 `pnpm preview` 可以检查构建后的示例。在 StableOps 主仓库中，从根目录运行 `pnpm --filter @stableops/playground dev`。

## 复用组件

需要 React 18 或 19、现代浏览器，以及提供 Tailwind CSS v4 和 shadcn 设计变量的宿主应用。示例已提供这些样式，你也可以将组件源码复制到自己的应用中。

宿主应用需要引入一次 WalletConnect 样式文件，并让 Tailwind 扫描组件类名：

```css
@source './path/to/playground/src/**/*.{ts,tsx}';
```

Solana 付款需要 `@solana/web3.js`。TRON WalletConnect 付款需要 `tronweb` 和支持 `tron_signTransaction` 的钱包。EVM、Solana 和 TRON 均支持兼容的 WalletConnect 钱包，也可使用注入式钱包。

## 使用

```tsx
'use client'

import { Playground } from './src'
import '@stableops/wallet-ui/walletconnect-dialog.css'

export function Demo() {
  return (
    <Playground
      apiKey={process.env.NEXT_PUBLIC_STABLEOPS_SANDBOX_KEY}
      walletConnectProjectId={process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
      locale="zh"
    />
  )
}
```

在 Next.js App Router 等 React 服务端组件环境中，应从带有 `'use client'` 的客户端组件渲染。

## 参数

| 参数                     | 类型             | 默认值                      | 说明                                              |
| ------------------------ | ---------------- | --------------------------- | ------------------------------------------------- |
| `apiKey`                 | `string`         | 无                          | 默认沙盒 API 密钥，用户也可在界面中输入或替换     |
| `baseUrl`                | `string`         | `https://api.stableops.dev` | 浏览器可访问的 StableOps API 地址                 |
| `walletConnectProjectId` | `string`         | 无                          | Reown 项目编号，未提供时 WalletConnect 按钮不可用 |
| `locale`                 | `'en'` 或 `'zh'` | `'en'`                      | 界面语言                                          |
| `className`              | `string`         | 无                          | 根容器的额外样式类                                |

## 演练流程

1. 创建订单。默认开启「自动导入沙盒收款地址」，适合尚未添加收款地址的组织。关闭后使用你在控制台中维护的地址。
2. 选择付款网络与资产，通过钱包签名并广播测试网转账，也可手动转账。
3. 查询订单状态，依次观察 `detected`、`confirmed` 和 `finalized`。订单状态以 StableOps 返回的结果为准。

自动导入的演示地址仅用于测试代币。真实资金必须使用你控制的地址。

## 收银台与订阅组件

`Checkout` 创建托管收银台会话并打开付款页。`Subscription` 演示套餐、订阅、账单付款、套餐变更和用户门户会话。两者接受上面的全部参数，并额外支持 `checkoutUrl`，默认值为 `https://pay.stableops.dev`。

```tsx
import { Checkout, Subscription } from './src'
import '@stableops/wallet-ui/walletconnect-dialog.css'

export function OtherDemos({ sandboxKey }: { sandboxKey: string }) {
  return (
    <>
      <Checkout apiKey={sandboxKey} locale="zh" />
      <Subscription apiKey={sandboxKey} locale="zh" />
    </>
  )
}
```

## 地址辅助函数

`demoSandboxAddressForChain(chain, seed)` 异步返回确定性的测试收款地址。`importSandboxAddress({ apiKey, baseUrl, merchantOrderId, chains, fetchImpl? })` 为选中的链导入演示收款地址。

```ts
import { demoSandboxAddressForChain, importSandboxAddress } from './src'

const address = await demoSandboxAddressForChain('base-sepolia', 'demo-order-123')
await importSandboxAddress({
  apiKey: sandboxKey,
  baseUrl: 'https://api.stableops.dev',
  merchantOrderId: 'demo-order-123',
  chains: ['base-sepolia'],
})
```

这些函数只用于沙盒演示。前者返回地址，后者完成导入，不会发起付款。

## 许可证

本仓库使用 `Apache-2.0` 许可证，见 [LICENSE](./LICENSE)。
