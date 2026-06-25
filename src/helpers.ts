import { StableOpsError } from '@stableops/api-sdk'
import type { PaymentOrderInstruction } from '@stableops/api-sdk'
import type { WalletPaymentInstruction, WalletProviderByChain } from '@stableops/wallet-sdk'

import { PlaygroundTestnets, type PlaygroundTestnet } from './testnets'

// 与 playground.tsx 同样的"非样式"常量集中点;轮询周期、默认 API base 等运行参数全在这里。
export const POLL_INTERVAL_MS = 5_000
export const DEFAULT_BASE_URL = 'https://api.stableops.dev'

// `{key}` 占位符替换:i18n 字典里的所有动态串都走这条。漏键时原样保留 `{key}`,便于排查。
export function tpl(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

// 用测试网目录把链 id 渲染成可读标签，找不到则回落到链 id 本身。
export function chainLabel(options: readonly PlaygroundTestnet[], chain: string): string {
  return options.find((option) => option.chain === chain)?.label ?? chain
}

// 用测试网目录里的 explorerUrl 基址，按链家族拼出交易详情页链接（各家族路径不同）。
// 思路同 apps/checkout 的 explorerTxUrl；但 playground 自包含、不依赖私有包 @stableops/shared,
// 因此直接复用 testnets.ts 里已声明的 explorerUrl。未知链优雅降级（返回 null,不渲染链接）。
export function explorerTxUrl(chain: string, txHash: string): string | null {
  const testnet = PlaygroundTestnets.find((option) => option.chain === chain)
  const base = testnet?.explorerUrl
  if (!base) return null
  if (testnet.family === 'solana') {
    // explorer.solana.com 用 /tx/，cluster 以 query 传入。
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
  }
  if (testnet.family === 'tron') {
    // tronscan 是单页应用，交易详情在 /#/transaction/。
    return `${base}/#/transaction/${txHash}`
  }
  // EVM 系区块浏览器统一 /tx/。
  return `${base}/tx/${txHash}`
}

export function toWalletInstruction(instruction: PaymentOrderInstruction): WalletPaymentInstruction {
  return {
    chain: instruction.chain as WalletPaymentInstruction['chain'],
    asset: instruction.asset as WalletPaymentInstruction['asset'],
    address: instruction.address,
  }
}

export function mergeWalletProviders(
  injected: WalletProviderByChain,
  explicit: WalletProviderByChain = {},
): WalletProviderByChain {
  const merged: WalletProviderByChain = { ...injected }
  for (const [chain, provider] of Object.entries(explicit)) {
    if (provider) merged[chain as WalletPaymentInstruction['chain']] = provider
  }
  return merged
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// EVM 链清单(与 wallet-sdk 内部 EVM_WALLET_CHAINS 一致;wallet-sdk 不导出该常量,在这里
// 维护一份本地副本即可——加链时两边同步即可,实际加链频率很低且会被 typecheck 兜住。
const PLAYGROUND_EVM_CHAINS = new Set<WalletPaymentInstruction['chain']>([
  'ethereum',
  'base',
  'base-sepolia',
  'arbitrum',
  'polygon',
  'optimism',
  'bsc',
  'bsc-testnet',
  'ethereum-sepolia',
  'arbitrum-sepolia',
  'polygon-amoy',
  'optimism-sepolia',
])

export function isEvmChainId(chain: WalletPaymentInstruction['chain']): boolean {
  return PLAYGROUND_EVM_CHAINS.has(chain)
}

// API 错误统一抽成一行：StableOpsError 带后端 message；其余回落到 Error.message / String。
export function errMessage(err: unknown): string {
  if (err instanceof StableOpsError) return err.message
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

// 钱包错误常见两类：Error 实例（带 message）和 EIP-1193 风格的 { code, message, data }。
// 直接 String(err) 会拍成 "[object Object]"，丢掉信息——按字段优先级抽出可读串。
export function formatWalletError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const obj = err as {
      message?: unknown
      reason?: unknown
      data?: { message?: unknown }
      code?: unknown
    }
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.reason === 'string' && obj.reason) return obj.reason
    if (obj.data && typeof obj.data.message === 'string' && obj.data.message)
      return obj.data.message
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}
