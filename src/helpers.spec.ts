import { describe, expect, it } from 'vitest'

import {
  filterWalletConnectWallets,
  getPaymentCandidateChains,
  getUnauthorizedWalletConnectChains,
  getWalletConnectChainSelection,
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
  it('splits EVM, Solana and TRON chains for WalletConnect', () => {
    expect(
      getWalletConnectChainSelection(['base-sepolia', 'solana-devnet', 'tron-nile', 'base']),
    ).toEqual({
      evmChains: ['base-sepolia', 'base'],
      solanaChains: ['solana-devnet'],
      tronChains: ['tron-nile'],
      supportedChains: ['base-sepolia', 'solana-devnet', 'tron-nile', 'base'],
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
    { id: 'tronlink', name: 'TronLink', families: ['tron'] },
    { id: 'tokenpocket', name: 'TokenPocket', families: ['tron'] },
    { id: 'okx-tron', name: 'OKX Wallet', families: ['tron'] },
    { id: 'walletconnect', name: 'WalletConnect', families: ['any'] },
  ]

  it('shows only Solana-capable wallets for Solana-only orders', () => {
    expect(filterWalletConnectWallets(wallets, ['solana-devnet']).map((wallet) => wallet.id)).toEqual(
      ['trust', 'binance', 'walletconnect'],
    )
  })

  it('shows EVM-capable wallets for EVM-only orders', () => {
    expect(filterWalletConnectWallets(wallets, ['base-sepolia']).map((wallet) => wallet.id)).toEqual(
      ['metamask', 'trust', 'binance', 'walletconnect'],
    )
  })

  it('shows TRON-capable wallets for TRON orders (TRON now goes through WalletConnect)', () => {
    expect(filterWalletConnectWallets(wallets, ['tron-nile']).map((wallet) => wallet.id)).toEqual([
      'tronlink',
      'tokenpocket',
      'okx-tron',
      'walletconnect',
    ])
  })
})
