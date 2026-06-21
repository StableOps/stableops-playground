import { describe, expect, it } from 'vitest'

import { isSolanaChain, isTronChain } from './chains'
import { PlaygroundTestnets } from './testnets'

describe('PlaygroundTestnets 目录', () => {
  it('含 8 条，字段合法且 family 与链家族判定一致', () => {
    expect(PlaygroundTestnets).toHaveLength(8)
    for (const t of PlaygroundTestnets) {
      expect(['USDC', 'USDT']).toContain(t.asset)
      expect(['evm', 'solana', 'tron']).toContain(t.family)
      expect(isSolanaChain(t.chain)).toBe(t.family === 'solana')
      expect(isTronChain(t.chain)).toBe(t.family === 'tron')
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.faucetUrl.startsWith('http')).toBe(true)
    }
  })

  it('包含 base-sepolia 作为兜底项', () => {
    expect(PlaygroundTestnets.some((t) => t.chain === 'base-sepolia')).toBe(true)
  })
})
