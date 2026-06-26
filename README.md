# StableOps Playground

[![npm version](https://img.shields.io/npm/v/@stableops/playground)](https://www.npmjs.com/package/@stableops/playground) [![npm downloads](https://img.shields.io/npm/dm/@stableops/playground)](https://www.npmjs.com/package/@stableops/playground) [![License](https://img.shields.io/npm/l/@stableops/playground)](./LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org) [![Node](https://img.shields.io/badge/Node-%3E%3D18-339933)](https://nodejs.org)

[中文文档](./README.zh-CN.md)

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
  `@source '../node_modules/@stableops/playground/dist/**/*.js';`
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

## Installation

```bash
pnpm add @stableops/playground @stableops/api-sdk @stableops/wallet-sdk react react-dom
```

## Usage

```tsx
import { Playground } from '@stableops/playground'

export function Demo() {
  return (
    <Playground
      // Optional default key; users can also paste their own in the UI.
      apiKey={process.env.NEXT_PUBLIC_STABLEOPS_SANDBOX_KEY}
      baseUrl="https://api.stableops.dev"
      locale="en"
    />
  )
}
```

In a React Server Components host (e.g. Next.js App Router), render it from a
client component (a file with `"use client"`).

## Props

| Prop        | Type           | Default                     | Description                                                                               |
| ----------- | -------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `apiKey`    | `string`       | —                           | Default API key. The widget also exposes an input so users can paste/override their own.  |
| `baseUrl`   | `string`       | `https://api.stableops.dev` | StableOps API base URL. Must be reachable from the browser and allowed by the API's CORS. |
| `locale`    | `'en' \| 'zh'` | `'en'`                      | UI language.                                                                              |
| `className` | `string`       | —                           | Extra classes for the root container.                                                     |

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
   asks the browser wallet to send the ERC-20 / SPL / TRC-20 transfer.
3. **Wait confirmed / finalized**: polls `GET /v1/payment-orders/:id` while the
   scanner and confirmations watcher advance the order.

The testnet catalog shown in the chain dropdown is bundled in the package
(`PlaygroundTestnets`); no playground-specific API endpoint is required.

## Run the standalone playground

This package ships a Vite dev harness so you can run the widget on its own,
without embedding it in another app:

```bash
pnpm dev
```

It serves the page from `example/` (default http://localhost:5173). Point it at a
different API with `VITE_STABLEOPS_API_URL` (defaults to `https://api.stableops.dev`),
then paste a sandbox API key in the UI.

## License

This package is licensed under `Apache-2.0`. See [LICENSE](./LICENSE).
