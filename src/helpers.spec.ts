import { describe, expect, it } from 'vitest'

import {
  buildTronWalletAppUrl,
  buildTronWalletHandoffUrl,
  filterWalletConnectWallets,
  filterWalletLinkWallets,
  getPaymentCandidateChains,
  getUnauthorizedWalletConnectChains,
  getWalletConnectChainSelection,
  parseTronWalletHandoff,
  mergeWalletProviders,
} from './helpers'
import type { PlaygroundWallet } from './wallets'

const injectedProvider = { request: async () => 'injected' }
const walletConnectProvider = { request: async () => 'walletconnect' }

describe('mergeWalletProviders', () => {
  it('keeps injected providers and lets explicit providers override the same chain', () => {
    const merged = mergeWalletProviders(
      {
        'base-sepolia': injectedProvider,
        'polygon-amoy': injectedProvider,
      },
      {
        'base-sepolia': walletConnectProvider,
      },
    )

    expect(merged['base-sepolia']).toBe(walletConnectProvider)
    expect(merged['polygon-amoy']).toBe(injectedProvider)
  })

  it('ignores undefined explicit providers', () => {
    const merged = mergeWalletProviders(
      {
        'base-sepolia': injectedProvider,
      },
      {
        'base-sepolia': undefined,
      },
    )

    expect(merged['base-sepolia']).toBe(injectedProvider)
  })
})

describe('getUnauthorizedWalletConnectChains', () => {
  it('returns WalletConnect chains that are not exposed as authorized providers', () => {
    expect(
      getUnauthorizedWalletConnectChains(['base-sepolia', 'ethereum-sepolia', 'solana-devnet'], {
        'base-sepolia': walletConnectProvider,
        'solana-devnet': walletConnectProvider,
      }),
    ).toEqual(['ethereum-sepolia'])
  })
})

describe('getWalletConnectChainSelection', () => {
  it('splits EVM and Solana chains while excluding TRON WalletConnect payments', () => {
    expect(
      getWalletConnectChainSelection(['base-sepolia', 'solana-devnet', 'tron-nile', 'base']),
    ).toEqual({
      evmChains: ['base-sepolia', 'base'],
      solanaChains: ['solana-devnet'],
      supportedChains: ['base-sepolia', 'solana-devnet', 'base'],
    })
  })
})

describe('getPaymentCandidateChains', () => {
  const chains = ['base-sepolia', 'tron-nile', 'solana-devnet'] as const

  it('uses all order chains while payment network selection is automatic', () => {
    expect(getPaymentCandidateChains(chains, null)).toEqual([
      'base-sepolia',
      'tron-nile',
      'solana-devnet',
    ])
  })

  it('uses only the selected payment chain when one is selected', () => {
    expect(getPaymentCandidateChains(chains, 'tron-nile')).toEqual(['tron-nile'])
  })
})

describe('filterWalletConnectWallets', () => {
  const wallets: PlaygroundWallet[] = [
    { id: 'metamask', name: 'MetaMask', families: ['evm'] },
    { id: 'trust', name: 'Trust Wallet', families: ['evm', 'solana'] },
    { id: 'binance', name: 'Binance Wallet', families: ['evm', 'solana'] },
    { id: 'phantom', name: 'Phantom', families: ['solana'] },
    { id: 'tronlink', name: 'TronLink', families: ['tron'] },
    { id: 'tokenpocket', name: 'TokenPocket', families: ['tron'] },
    { id: 'okx-tron', name: 'OKX Wallet', families: ['tron'] },
    { id: 'walletconnect', name: 'WalletConnect', families: ['any'] },
  ]

  it('shows only Solana-capable wallets for Solana-only orders', () => {
    expect(filterWalletConnectWallets(wallets, ['solana-devnet']).map((wallet) => wallet.id)).toEqual(
      ['trust', 'binance', 'phantom', 'walletconnect'],
    )
  })

  it('shows EVM-capable wallets for EVM-only orders', () => {
    expect(filterWalletConnectWallets(wallets, ['base-sepolia']).map((wallet) => wallet.id)).toEqual(
      ['metamask', 'trust', 'binance', 'walletconnect'],
    )
  })
})

describe('filterWalletLinkWallets', () => {
  const wallets: PlaygroundWallet[] = [
    { id: 'metamask', name: 'MetaMask', families: ['evm'] },
    { id: 'tronlink', name: 'TronLink', families: ['tron'] },
    { id: 'tokenpocket', name: 'TokenPocket', families: ['tron'] },
    { id: 'trust-tron', name: 'Trust Wallet', families: ['tron'] },
    { id: 'okx-tron', name: 'OKX Wallet', families: ['tron'] },
  ]

  it('shows TRON app-browser wallets for TRON-only orders', () => {
    expect(filterWalletLinkWallets(wallets, ['tron-nile']).map((wallet) => wallet.id)).toEqual([
      'tronlink',
      'tokenpocket',
      'trust-tron',
      'okx-tron',
    ])
  })

  it('does not show app-browser wallets for EVM or Solana orders', () => {
    expect(filterWalletLinkWallets(wallets, ['base-sepolia', 'solana-devnet'])).toEqual([])
  })
})

describe('buildTronWalletAppUrl', () => {
  it('builds configured app-browser links with the current page URL encoded', () => {
    const currentUrl = 'https://stableops.dev/zh/docs/playground?order=abc&chain=tron-nile'

    expect(buildTronWalletAppUrl('tronlink', currentUrl)).toBe(
      `tronlinkoutside://pull.activity?param=${encodeURIComponent(
        JSON.stringify({ url: currentUrl, action: 'open' }),
      )}`,
    )
    expect(buildTronWalletAppUrl('tokenpocket', currentUrl)).toBe(
      `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url: currentUrl }))}`,
    )
    expect(buildTronWalletAppUrl('trust-tron', currentUrl)).toBe(
      `https://link.trustwallet.com/open_url?coin_id=195&url=${encodeURIComponent(currentUrl)}`,
    )
    expect(buildTronWalletAppUrl('okx-tron', currentUrl)).toBe(
      `okx://wallet/dapp/details?dappUrl=${encodeURIComponent(currentUrl)}`,
    )
    expect(buildTronWalletAppUrl('metamask', currentUrl)).toBeNull()
  })
})

describe('TRON wallet handoff URL', () => {
  it('encodes and parses the non-sensitive order payload in the URL hash', () => {
    const handoff = {
      id: 'po_123',
      merchantOrderId: 'playground_123',
      amount: '0.01',
      requestedAmount: '0.01',
      settlementAsset: 'USDT' as const,
      status: 'created' as const,
      expiresAt: '2026-01-01T00:00:00.000Z',
      metadata: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      acceptedAssets: [{ chain: 'tron-nile' as const, asset: 'USDT' as const }],
      paymentInstructions: [
        {
          chain: 'tron-nile' as const,
          asset: 'USDT' as const,
          address: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
        },
      ],
    }
    const url = buildTronWalletHandoffUrl('https://stableops.dev/zh/docs/playground?x=1#old', handoff)

    expect(url.startsWith('https://stableops.dev/zh/docs/playground?x=1#stableops-playground=')).toBe(
      true,
    )
    expect(parseTronWalletHandoff(url)).toEqual(handoff)
  })

  it('returns null for missing or invalid handoff payloads', () => {
    expect(parseTronWalletHandoff('https://stableops.dev/zh/docs/playground')).toBeNull()
    expect(
      parseTronWalletHandoff('https://stableops.dev/zh/docs/playground#stableops-playground=bad'),
    ).toBeNull()
  })
})
