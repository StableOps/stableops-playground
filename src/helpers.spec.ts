import { describe, expect, it } from 'vitest'

import {
  getUnauthorizedWalletConnectChains,
  getWalletConnectChainSelection,
  mergeWalletProviders,
} from './helpers'

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
