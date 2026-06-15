import type { ChainId } from '@stableops/api-sdk'

// 自包含的链家族判定，避免公开包依赖私有包 @stableops/shared。
// ChainId / Asset 类型复用公开的 @stableops/api-sdk（与建单入参同源，不会漂移）。
export type ChainFamily = 'evm' | 'solana' | 'tron'

const SOLANA_CHAINS = new Set<ChainId>(['solana', 'solana-devnet'])
const TRON_CHAINS = new Set<ChainId>(['tron', 'tron-nile'])

export function isSolanaChain(chain: ChainId): boolean {
  return SOLANA_CHAINS.has(chain)
}

export function isTronChain(chain: ChainId): boolean {
  return TRON_CHAINS.has(chain)
}
