# StableOps Playground

[中文文档](./README.zh-CN.md)

This is a public example repository for StableOps sandbox integrations. It is not
published to npm. Clone it to run the examples or reuse the React source in your
application. The `@stableops/playground` name is retained for local workspace use.

`@stableops/playground` renders a self-contained `<Playground>` widget that walks
through the full lifecycle of a StableOps payment order **directly in the
browser**: create order → pay on-chain with a wallet → wait for `confirmed` →
wait for `finalized`. It calls [`@stableops/api-sdk`](https://www.npmjs.com/package/@stableops/api-sdk) for order
creation and polling, and [`@stableops/wallet-sdk`](https://www.npmjs.com/package/@stableops/wallet-sdk) to ask the
user's wallet to send the real testnet transfer. No server proxy is required.
The caller supplies an API key (via prop or the built-in input field).

## Requirements

- A **browser** runtime. When Auto-import is on and the chain is TRON, sandbox
  address derivation uses the Web Crypto API (`globalThis.crypto.subtle`) for
  the base58check SHA-256, available in all modern browsers. Other chains
  (EVM, Solana) don't touch Web Crypto.
- React 18 or 19 (peer dependency).
- A host that ships Tailwind CSS v4 and the shadcn design tokens
  (`--card`, `--muted`, `--primary`, …). The component renders with utility
  classes and reads those CSS variables for colors. Make sure Tailwind scans
  this package, e.g. in your global stylesheet:
  `@source './path/to/playground/src/**/*.{ts,tsx}';`
- A StableOps **sandbox** API key (see Security).

## Security

This widget is a client-side demo. It sends the API key you provide straight to
the StableOps API from the browser, so:

- **Use a sandbox key only.** Never embed a live key in browser code.
- The API key's environment is authoritative. The StableOps API resolves the
  organization and environment from the key, so a sandbox key always runs
  against sandbox.
- In production integrations, keep your API key on your backend and use
  `@stableops/wallet-sdk` on the frontend only for the wallet transfer.

## Run the examples

Use Node.js 22.12 or newer and pnpm 10.33.2.

```bash
git clone https://github.com/StableOps/stableops-playground.git
cd stableops-playground
pnpm install
pnpm dev
```

Open http://localhost:5173 and enter a sandbox API key. The example includes the
Solana and TRON dependencies. For WalletConnect, set `VITE_WALLETCONNECT_PROJECT_ID`
in a local `.env` file before starting the example. `VITE_STABLEOPS_API_URL` and
`VITE_CHECKOUT_URL` can override the default API and hosted checkout URLs.

Run `pnpm build:example` and `pnpm preview` to check the built example.
In the StableOps monorepo, run `pnpm --filter @stableops/playground dev` from the root.

## Usage

```tsx
import { Playground } from './src'
import '@stableops/wallet-ui/walletconnect-dialog.css'

export function Demo() {
  return (
    <Playground
      // Optional default key; users can also paste their own in the UI.
      apiKey={process.env.NEXT_PUBLIC_STABLEOPS_SANDBOX_KEY}
      baseUrl="https://api.stableops.dev"
      walletConnectProjectId={process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
      locale="en"
    />
  )
}
```

In a React Server Components host (e.g. Next.js App Router), render it from a
client component (a file with `"use client"`).

Import the WalletConnect stylesheet once in your host application. Tailwind
scanning alone does not load the dialog styles. Solana requires `@solana/web3.js`
and TRON WalletConnect requires `tronweb`. These are included in the example.

## Props

| Prop                     | Type           | Default                     | Description                                                                                         |
| ------------------------ | -------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| `apiKey`                 | `string`       | —                           | Default API key. The widget also exposes an input so users can paste/override their own.            |
| `baseUrl`                | `string`       | `https://api.stableops.dev` | StableOps API base URL. Must be reachable from the browser and allowed by the API's CORS.           |
| `walletConnectProjectId` | `string`       | —                           | Reown projectId used by the WalletConnect QR flow. The WalletConnect button is disabled without it. |
| `locale`                 | `'en' \| 'zh'` | `'en'`                      | UI language.                                                                                        |
| `className`              | `string`       | —                           | Extra classes for the root container.                                                               |

The widget also exposes an **Auto-import sandbox receiving address** checkbox in
its UI (on by default). When on, it imports a deterministic burner sandbox
address before creating the order, useful when your org has no addresses yet.
Turn it off to use only the addresses you manage in Dashboard → Addresses; if
the order then fails because the address pool is empty, the activity log shows
a hint pointing at the dashboard.

## How it works

1. **Create order**: `POST /v1/payment-orders` via `@stableops/api-sdk` with an
   `Idempotency-Key`. When the Auto-import checkbox is on (default), a
   deterministic burner sandbox address is imported first so the order can
   allocate one.
2. **Pay on-chain**: `@stableops/wallet-sdk` selects a payable instruction and
   asks the browser wallet to send the ERC-20 / SPL / TRC-20 transfer. For EVM,
   Solana, and TRON instructions, WalletConnect opens a wallet picker and QR
   panel. TRON WalletConnect requires `tronweb` and a wallet supporting
   `tron_signTransaction`. Injected TronLink / TronWeb wallets are also supported.
3. **Wait confirmed / finalized**: polls `GET /v1/payment-orders/:id` while the
   scanner and confirmations watcher advance the order.

The testnet catalog shown in the chain dropdown is bundled in the package
(`PlaygroundTestnets`); no playground-specific API endpoint is required.

## Other exports

`Checkout` creates a hosted checkout session and opens its payment page.
`Subscription` demonstrates plans, subscriptions, invoice payment, plan changes,
and end-user portal sessions. Both accept the same props as `Playground`, plus
`checkoutUrl` (default `https://pay.stableops.dev`). They are sandbox demos.

```tsx
import { Checkout, Subscription } from './src'
import '@stableops/wallet-ui/walletconnect-dialog.css'

<Checkout apiKey={sandboxKey} locale="en" />
<Subscription apiKey={sandboxKey} locale="en" />
```

`demoSandboxAddressForChain(chain, seed)` asynchronously returns a deterministic
test receiving address. `importSandboxAddress({ apiKey, baseUrl, merchantOrderId,
chains, fetchImpl? })` imports demo receiving addresses for the selected chains.
These addresses are only for test tokens. Use addresses you control for real funds.

## License

This repository is licensed under `Apache-2.0`. See [LICENSE](./LICENSE).
