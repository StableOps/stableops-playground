'use client'

import type { ReactNode } from 'react'

import type { WalletConnectWalletOption } from '@stableops/wallet-sdk'

import { WALLET_LOGOS } from './wallet-logos'

// WalletConnect 弹窗的钱包目录：在 SDK 的 WalletConnectWalletOption（id / name / links / iconUrl）上，
// 给主流钱包挂官方 logo（iconUrl=内联 data URI，源自 explorer-api.walletconnect.com，见 wallet-logos.ts），
// 无官方图标的钱包可用内联 SVG + 品牌底色兜底。
//
// 图标全部内联（data URI / inline SVG）：零运行时网络、库自包含，将来可原样搬到 apps/checkout。
//
// links 用于移动端深链：原生 scheme（native）与 universal link 均遵循 WalletConnect 的
// `<prefix>wc?uri=<encodedUri>` 约定。把握不大的 universal 一律省略——二维码对所有钱包永远兜底。

export type PlaygroundWallet = WalletConnectWalletOption & {
  // 无官方 logo（iconUrl）时的兜底：品牌底色块 + 内联标志。
  brand?: string
  Glyph?: () => ReactNode
}

// 主流 EVM 钱包目录。前若干个挂官方 logo + 移动端深链；末位 WalletConnect 作为「任意钱包扫码」
// 的兜底入口（无深链，只出二维码）。
export const WALLETCONNECT_WALLETS: PlaygroundWallet[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    iconUrl: WALLET_LOGOS.metamask,
    links: {
      native: 'metamask://wc?uri=',
      universal: 'https://metamask.app.link/wc?uri=',
    },
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    iconUrl: WALLET_LOGOS.trust,
    links: {
      native: 'trust://wc?uri=',
      universal: 'https://link.trustwallet.com/wc?uri=',
    },
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    iconUrl: WALLET_LOGOS.coinbase,
    links: {
      native: 'cbwallet://wc?uri=',
      universal: 'https://go.cb-w.com/wc?uri=',
    },
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    iconUrl: WALLET_LOGOS.rainbow,
    links: {
      native: 'rainbow://wc?uri=',
      universal: 'https://rnbwapp.com/wc?uri=',
    },
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    iconUrl: WALLET_LOGOS.okx,
    // OKX 的 universal link 非 wc 处理器，省略；保留原生 scheme。
    links: {
      native: 'okx://main/wc?uri=',
    },
  },
  {
    id: 'binance',
    name: 'Binance Wallet',
    iconUrl: WALLET_LOGOS.binance,
    links: {
      native: 'bnc://app.binance.com/cedefi/wc?uri=',
      universal: 'https://app.binance.com/cedefi/wc?uri=',
    },
  },
  {
    id: 'zerion',
    name: 'Zerion',
    iconUrl: WALLET_LOGOS.zerion,
    links: {
      native: 'zerion://wc?uri=',
      universal: 'https://wallet.zerion.io/wc?uri=',
    },
  },
  {
    id: 'ledger',
    name: 'Ledger Live',
    iconUrl: WALLET_LOGOS.ledger,
    // Ledger Live 仅给原生 scheme。
    links: {
      native: 'ledgerlive://wc?uri=',
    },
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    brand: '#3B99FC',
    iconUrl: WALLET_LOGOS.walletconnect,
    // 兜底入口：任意支持 WalletConnect 的钱包扫码即可，不走深链。
  },
]

// 渲染单个钱包图标：有官方 logo 用 <img>，否则品牌底色块 + 内联标志兜底。
export function WalletIcon({ wallet }: { wallet: PlaygroundWallet }): ReactNode {
  if (wallet.iconUrl) {
    return (
      <img
        src={wallet.iconUrl}
        alt={wallet.name}
        className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-black/5"
      />
    )
  }
  const Glyph = wallet.Glyph
  return (
    <span
      className="flex size-12 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5"
      style={{ background: wallet.brand }}>
      {Glyph ? <Glyph /> : null}
    </span>
  )
}
