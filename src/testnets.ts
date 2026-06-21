import type { Asset, ChainId } from '@stableops/api-sdk'

import type { ChainFamily } from './chains'

// playground 下拉框的测试网目录（UI 元数据：链 / 资产 / 家族 / 标签 / 水龙头 / 浏览器）。
// 自包含，不依赖私有包 @stableops/shared；链/资产类型复用公开的 @stableops/api-sdk。
export type PlaygroundTestnet = {
  chain: ChainId
  asset: Asset
  family: ChainFamily
  label: string
  faucetUrl: string
  explorerUrl?: string
  // 轮询到 detected / confirmed / finalized 的预算上限（毫秒）。固定值对各链都不合理——
  // confirm/finalize 按后端确认深度推导：≈ 确认深度(confirmedAfter / finalizedAfter) × 该链出块时间
  // + scanner 拉取节奏(pollIntervalMs) + 确认 watcher 节奏(finalityIntervalMs) + 余量。
  // detected 近实时（scanner 默认扫到链头），只需覆盖 poll 节奏与 RPC 日志索引滞后的少量余量。
  // 取值偏宽松以容忍测试网 RPC/出块抖动；深度来源见
  // apps/api/src/chain-providers/chain-provider-registry.service.ts 的 DEFAULT_CONFIGS。
  detectTimeoutMs: number
  confirmTimeoutMs: number
  finalizeTimeoutMs: number
}

export const PlaygroundTestnets: readonly PlaygroundTestnet[] = [
  {
    // ~2s 出块；confirmedAfter 2 / finalizedAfter 12。
    chain: 'base-sepolia',
    asset: 'USDC',
    family: 'evm',
    label: 'Base Sepolia · USDC (testnet)',
    faucetUrl: 'https://faucet.circle.com',
    explorerUrl: 'https://sepolia.basescan.org',
    detectTimeoutMs: 60_000,
    confirmTimeoutMs: 90_000,
    finalizeTimeoutMs: 150_000,
  },
  {
    // ~12s 出块；confirmedAfter 3 / finalizedAfter 32 —— 全场最慢，finalize 需数分钟。
    chain: 'ethereum-sepolia',
    asset: 'USDC',
    family: 'evm',
    label: 'Ethereum Sepolia · USDC (testnet)',
    faucetUrl: 'https://faucet.circle.com',
    explorerUrl: 'https://sepolia.etherscan.io',
    detectTimeoutMs: 90_000,
    confirmTimeoutMs: 150_000,
    finalizeTimeoutMs: 600_000,
  },
  {
    // 出块极快(亚秒)；confirmedAfter 1 / finalizedAfter 20，主要受 watcher 节奏限制。
    chain: 'arbitrum-sepolia',
    asset: 'USDC',
    family: 'evm',
    label: 'Arbitrum Sepolia · USDC (testnet)',
    faucetUrl: 'https://faucet.circle.com',
    explorerUrl: 'https://sepolia.arbiscan.io',
    detectTimeoutMs: 60_000,
    confirmTimeoutMs: 90_000,
    finalizeTimeoutMs: 120_000,
  },
  {
    // ~2s 出块；confirmedAfter 10 / finalizedAfter 64 —— confirm 也偏慢。
    chain: 'polygon-amoy',
    asset: 'USDC',
    family: 'evm',
    label: 'Polygon Amoy · USDC (testnet)',
    faucetUrl: 'https://faucet.circle.com',
    explorerUrl: 'https://amoy.polygonscan.com',
    detectTimeoutMs: 60_000,
    confirmTimeoutMs: 120_000,
    finalizeTimeoutMs: 300_000,
  },
  {
    // ~2s 出块；confirmedAfter 2 / finalizedAfter 12，与 Base Sepolia 几乎一致。
    chain: 'optimism-sepolia',
    asset: 'USDC',
    family: 'evm',
    label: 'Optimism Sepolia · USDC (testnet)',
    faucetUrl: 'https://faucet.circle.com',
    explorerUrl: 'https://sepolia-optimism.etherscan.io',
    detectTimeoutMs: 60_000,
    confirmTimeoutMs: 90_000,
    finalizeTimeoutMs: 150_000,
  },
  {
    // 亚秒 slot；confirmedAfter 1 / finalizedAfter 32，整体很快。
    chain: 'solana-devnet',
    asset: 'USDC',
    family: 'solana',
    label: 'Solana Devnet · USDC (testnet)',
    faucetUrl: 'https://faucet.circle.com',
    explorerUrl: 'https://explorer.solana.com/?cluster=devnet',
    detectTimeoutMs: 60_000,
    confirmTimeoutMs: 90_000,
    finalizeTimeoutMs: 120_000,
  },
  {
    // ~3s 出块；confirmedAfter 1 / finalizedAfter 19。
    chain: 'tron-nile',
    asset: 'USDT',
    family: 'tron',
    label: 'TRON Nile · USDT (testnet)',
    faucetUrl: 'https://nileex.io/join/getJoinPage',
    explorerUrl: 'https://nile.tronscan.org',
    detectTimeoutMs: 60_000,
    confirmTimeoutMs: 90_000,
    finalizeTimeoutMs: 180_000,
  },
] as const
