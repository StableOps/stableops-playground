import { describe, expect, it } from 'vitest'

import { mergeWalletProviders } from './helpers'

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
