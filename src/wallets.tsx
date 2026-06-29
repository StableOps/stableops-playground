'use client'

import type { ReactNode } from 'react'

import { WALLET_LOGOS } from '@stableops/wallet-ui'
import type { WalletConnectWalletOption } from '@stableops/wallet-sdk'

// 手机钱包弹窗的钱包目录：在 SDK 的 WalletConnectWalletOption（id / name / links / iconUrl）上，
// 给主流钱包挂官方 logo（iconUrl=内联 data URI，源自 wallet-ui 共享资源），
// 无官方图标的钱包可用内联 SVG / initials + 品牌底色兜底。
//
// 图标全部内联（data URI / inline SVG）：零运行时网络、库自包含，并与 apps/checkout 复用同一套渲染。
//
// links 用于移动端深链：原生 scheme（native）与 universal link 均遵循 WalletConnect 的
// `<prefix>wc?uri=<encodedUri>` 约定。把握不大的 universal 一律省略——二维码对所有钱包永远兜底。

export type PlaygroundWallet = WalletConnectWalletOption & {
  // WalletConnect 弹窗按当前订单链族过滤钱包，避免 Solana 订单展示 EVM-only 钱包。
  families: Array<'evm' | 'solana' | 'tron' | 'any'>
  // 无官方 logo（iconUrl）时的兜底：品牌底色块 + 内联标志。
  brand?: string
  Glyph?: () => ReactNode
  // 通用「任意钱包」入口（非具体钱包）：弹窗对其展示「用任意支持 WalletConnect 的钱包扫码」。
  anyWallet?: boolean
}

// 钱包目录：除末位 WalletConnect 兜底入口外，按全球市场份额（活跃用户量级）从高到低排序。
// 前若干个挂官方 logo + 移动端深链；TokenPocket（多链：EVM/Solana/TRON）与 TronLink（TRON 为主）
// 的 WC 原生深链 scheme 无可靠官方文档，故省略 links，仅以二维码兜底。
export const WALLETCONNECT_WALLETS: PlaygroundWallet[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    families: ['evm'],
    iconUrl: WALLET_LOGOS.metamask,
    links: {
      native: 'metamask://wc?uri=',
      universal: 'https://metamask.app.link/wc?uri=',
    },
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    families: ['evm', 'solana', 'tron'],
    iconUrl: WALLET_LOGOS.trust,
    links: {
      native: 'trust://wc?uri=',
      universal: 'https://link.trustwallet.com/wc?uri=',
    },
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    families: ['evm', 'solana'],
    iconUrl: WALLET_LOGOS.coinbase,
    links: {
      native: 'cbwallet://wc?uri=',
      universal: 'https://go.cb-w.com/wc?uri=',
    },
  },
  {
    id: 'okx',
    name: 'OKX Wallet',
    families: ['evm', 'solana', 'tron'],
    iconUrl: WALLET_LOGOS.okx,
    // OKX 的 universal link 非 wc 处理器，省略；保留原生 scheme。
    links: {
      native: 'okx://main/wc?uri=',
    },
  },
  {
    id: 'binance',
    name: 'Binance Wallet',
    families: ['evm', 'solana'],
    iconUrl: WALLET_LOGOS.binance,
    links: {
      native: 'bnc://app.binance.com/cedefi/wc?uri=',
      universal: 'https://app.binance.com/cedefi/wc?uri=',
    },
  },
  {
    id: 'tokenpocket',
    name: 'TokenPocket',
    families: ['evm', 'solana', 'tron'],
    brand: '#2980FE',
    iconUrl: WALLET_LOGOS.tokenpocket,
  },
  {
    id: 'tronlink',
    name: 'TronLink',
    families: ['tron'],
    brand: '#EF0027',
    iconUrl: WALLET_LOGOS.tronlink,
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    families: ['evm'],
    iconUrl: WALLET_LOGOS.rainbow,
    links: {
      native: 'rainbow://wc?uri=',
      universal: 'https://rnbwapp.com/wc?uri=',
    },
  },
  {
    id: 'zerion',
    name: 'Zerion',
    families: ['evm'],
    iconUrl: WALLET_LOGOS.zerion,
    links: {
      native: 'zerion://wc?uri=',
      universal: 'https://wallet.zerion.io/wc?uri=',
    },
  },
  {
    id: 'ledger',
    name: 'Ledger Live',
    families: ['evm'],
    iconUrl: WALLET_LOGOS.ledger,
    // Ledger Live 仅给原生 scheme。
    links: {
      native: 'ledgerlive://wc?uri=',
    },
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    families: ['any'],
    anyWallet: true,
    brand: '#3B99FC',
    iconUrl: WALLET_LOGOS.walletconnect,
    // 兜底入口：任意支持 WalletConnect 的钱包扫码即可，不走深链。
  },
]
