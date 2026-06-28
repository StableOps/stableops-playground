import type { BaseTranslation } from '../i18n-types.js'

const en = {
  steps: {
    create: '1. Create payment order',
    pay: '2. Pay with wallet on-chain',
    waitDetected: '3. Wait detected',
    waitConfirmed: '4. Wait confirmed',
    waitFinalized: '5. Wait finalized',
  },
  actions: {
    creating: 'Creating…',
    createOrder: '1. Create order',
    paying: 'Open browser wallet…',
    pay: '2. Browser wallet',
    confirmManual: "2. I've sent it manually",
    polling: 'Polling…',
    waitDetected: '3. Wait detected',
    waitConfirmed: '4. Wait confirmed',
    waitFinalized: '5. Wait finalized',
    reset: 'Reset',
  },
  walletConnect: {
    button: '2. Mobile wallet',
    chainNotAuthorized:
      'Your wallet did not authorize {chains}. Go back and reconnect, then select the requested network in your wallet.',
  },
  manual: {
    heading: 'Or transfer manually',
    sendTo: 'Send {amount} {asset} on {chain} to:',
    copy: 'Copy',
    copied: 'Copied',
    hint: 'Send from any wallet or exchange, then click "I\'ve sent it manually" — the scanner detects the inbound transfer the same way.',
    done: 'manual transfer confirmed',
  },
  apiKey: {
    label: 'API Key',
    placeholder: 'Paste your sandbox API key (sk_sandbox_…)',
    hint: 'Use a sandbox key. It stays in your browser and is sent directly to the API. In production, call the API from your backend, not the browser.',
  },
  amountMode: {
    label: 'Amount mode',
    exact: 'EXACT',
    auto: 'AUTO',
    hint: 'Exact = use the exact amount you enter; Auto = system adjusts amount within a tiny range to avoid address conflicts on shared addresses.',
  },
  autoImport: {
    label: 'Auto-import sandbox receiving address',
    hint: 'When on, a deterministic burner sandbox address is imported for this order before creating it — useful when your org has no addresses yet. Turn it off if you want to use only the addresses you manage yourself.',
  },
  noAddress: {
    hint: 'tip: if this failed because your org has no receiving address, enable Auto-import above or create one in Dashboard → Addresses.',
  },
  network: {
    auto: 'Auto',
  },
  sep: ', ',
  chains: {
    label: 'Chains (multi-select)',
    placeholder: 'Select chains…',
  },
  faucet: {
    prefix:
      'Real wallet transaction on the selected testnet(s) — do not use mainnet funds. Get test funds: ',
  },
  dropped: {
    nonEvmOnly: 'TRON and Solana are only available on paid plans. Please select EVM chains.',
    nonEvmMix: 'The following chains are only available on paid plans. Please deselect: {chains}',
    fallback: 'Enable Auto-import or configure receiving addresses in the Dashboard.',
  },
  status: {
    missingKey: 'enter an API key first',
    polling: 'polling {target}… (up to {seconds}s)',
    orderStatus: 'order={status}',
    timeout: 'timeout waiting for {target}; scanner may still be catching up',
    walletProviderNotFound: 'wallet provider not found',
    waitingWallet: 'waiting for wallet confirmation…',
    txHash: 'tx {hash}',
    viewTx: 'View on block explorer ↗',
    terminalStatus: 'order reached {status} before {target}',
    walletReverted: 'transaction reverted on chain; no tokens were moved',
  },
  log: {
    missingKey: 'create failed: API key is required',
    createFailed: 'create failed: {error}',
    orderCreated: 'order {id} created ({status})',
    refreshFailed: 'refresh failed: {error}',
    orderStatus: 'order status: {status}',
    walletSent: 'wallet payment sent: {hash}',
    walletFailed: 'wallet payment failed: {message}',
    walletReverted: 'transaction reverted: {hash}',
    providerNotFound: 'wallet provider not found for {chain}',
    waitTimedOut: 'wait {target} timed out; try again later',
    waitTerminalStatus: 'wait {target} stopped: order status is {status}',
    manualConfirmed: 'manual transfer confirmed; polling for on-chain detection',
  },
  footer:
    'This playground calls <code>@stableops/api-sdk</code> directly from your browser with the API key you provide. Step 2 calls <code>@stableops/wallet-sdk</code> to ask the browser wallet to send a real testnet transaction — or you can skip the wallet, transfer to the shown address from any wallet/exchange, and click "I\'ve sent it manually". Orders advance to detected / confirmed / finalized via the scanner and confirmations watcher. In sandbox (testnet), if your org has no receiving address yet, one is auto-created for this order. Use a sandbox key only — never paste a live key into a browser. <a href="https://gitlab.com/StableOps/stableops-playground" target="_blank" rel="noreferrer" class="underline underline-offset-2">View source on GitLab</a>.',
  checkout: {
    apiKey: 'API Key',
    apiKeyPlaceholder: 'Paste your sandbox API key (sk_sandbox_…)',
    apiKeyHint:
      'For docs testing only. The key stays in this browser. Create Checkout Sessions on your backend in production.',
    merchantOrderId: 'Merchant order ID',
    amount: 'Amount',
    chainAsset: 'Chains and assets (multi-select)',
    chainPlaceholder: 'Select one or more chains…',
    amountMode: 'Amount mode',
    amountModeExact: 'EXACT',
    amountModeAuto: 'AUTO',
    title: 'Checkout title',
    description: 'Checkout description',
    successUrl: 'Success URL',
    cancelUrl: 'Cancel URL',
    metadata: 'Order metadata',
    autoImport: 'Auto-import sandbox receiving address',
    autoImportHint:
      'When on, a deterministic burner sandbox address is imported for this order before the session is created. Useful when your org has no addresses yet. Turn it off to use only the addresses you manage yourself.',
    noAddressHint:
      'tip: if this failed because your org has no receiving address, enable Auto-import above or create one in Dashboard → Addresses.',
    droppedNonEvmOnly:
      'TRON and Solana are only available on paid plans. Please select EVM chains.',
    droppedNonEvmMix:
      'The following chains are only available on paid plans. Please deselect: {chains}',
    droppedFallback: 'Enable Auto-import or configure receiving addresses in the Dashboard.',
    create: 'Create and open Checkout',
    newOrderId: 'New merchant order ID',
    missingRequired: 'Enter a sandbox API key, merchant order ID, and amount.',
    missingChain: 'Select at least one chain.',
    metadataObjectError: 'metadata must be a JSON object',
    responseMissingSecret: 'checkout session response is missing client_secret',
    unknownError: 'unknown error',
  },
} satisfies BaseTranslation

export default en
