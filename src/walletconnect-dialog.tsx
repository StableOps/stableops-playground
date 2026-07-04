'use client'

import { useCallback, useState, type ReactNode } from 'react'

import {
  WalletConnectDialog as SharedWalletConnectDialog,
  type WalletConnectDialogError,
  type WalletConnectDialogMessageOverrides,
} from '@stableops/wallet-ui'
import type { WalletConnectControllerState } from '@stableops/wallet-sdk'

import type { PlaygroundWallet } from './wallets'

export type { WalletConnectDialogError } from '@stableops/wallet-ui'

const zhMessageOverrides: WalletConnectDialogMessageOverrides = {
  heading: '用手机钱包支付',
  back: '返回',
  close: '关闭',
  qrAlt: '支付二维码',
  payWith: '用 {wallet} 支付',
  scanWithWallet: '用手机上的 {wallet} 扫码',
  scanAnyWallet: '用任意支持 WalletConnect 的钱包扫码',
  openWallet: '打开 {wallet}',
  paymentPrompt:
    '已连接 {wallet}，请在钱包 App 内确认交易；如果没有弹出支付界面，可再次触发支付。',
  retryPayment: '再次打开支付',
  retryingPayment: '正在打开支付…',
  refreshConnection: '刷新二维码',
  copyUri: '复制链接',
  copied: '已复制',
  or: '或',
  connectFailed: '连接失败',
  errors: {
    dependencyMissing: '当前环境未加载 WalletConnect 依赖，请刷新后重试。',
    projectIdMissing: '未配置 WalletConnect projectId，无法打开手机钱包支付。',
    initFailed: 'WalletConnect 初始化失败，请检查网络后重试。',
    connectFailed: '连接超时，请刷新二维码再重试',
    noAuthorizedChains: '钱包没有授权订单需要的网络，请返回重连并勾选对应网络。',
    tronUnsupported: '当前钱包暂不支持 WalletConnect TRON 支付。',
    providerMismatch: '钱包返回的网络和订单网络不一致，请切换到正确网络后重试。',
    providerNotFound: '未找到可用于本订单网络的钱包授权，请返回重连并授权网络。',
    txReverted: '链上交易发生回滚，请重新付款或联系商户。',
    tokenContractNotFound: '当前网络缺少默认代币合约配置，请检查测试网配置。',
    paymentInstructionNotFound: '当前订单没有可用的链上支付指令。',
    unsupportedChain: '钱包 SDK 暂不支持当前支付网络。',
  },
}

export type WalletConnectDialogProps = {
  open: boolean
  locale: 'en' | 'zh'
  projectId: string | undefined
  available: boolean
  wallets: PlaygroundWallet[]
  selectedWallet: PlaygroundWallet | null
  state: WalletConnectControllerState
  qrCode: string | null
  error: WalletConnectDialogError | null
  themeColor?: string
  paymentPending?: boolean
  connectionRefreshAvailable?: boolean
  onSelectWallet: (wallet: PlaygroundWallet) => void
  onRetryPayment?: () => void
  onRefreshConnection?: () => void
  walletLinkMode?: boolean
  onBack: () => void
  onClose: () => void
}

export function WalletConnectDialog({
  open,
  locale,
  projectId,
  available,
  wallets,
  selectedWallet,
  state,
  qrCode,
  error,
  themeColor,
  paymentPending = false,
  connectionRefreshAvailable = false,
  onSelectWallet,
  onRetryPayment,
  onRefreshConnection,
  walletLinkMode = false,
  onBack,
  onClose,
}: WalletConnectDialogProps): ReactNode {
  const [copied, setCopied] = useState(false)
  const onCopyUri = useCallback(async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard write failure is non-critical
    }
  }, [])

  return (
    <SharedWalletConnectDialog
      open={open}
      messageOverrides={locale === 'zh' ? zhMessageOverrides : undefined}
      projectId={projectId}
      available={available}
      wallets={wallets}
      selectedWallet={selectedWallet}
      state={state}
      qrCode={qrCode}
      error={error}
      walletLinkMode={walletLinkMode}
      themeColor={themeColor}
      copied={copied}
      paymentPending={paymentPending}
      connectionRefreshAvailable={connectionRefreshAvailable}
      onSelectWallet={onSelectWallet}
      onRetryPayment={onRetryPayment}
      onRefreshConnection={onRefreshConnection}
      onBack={onBack}
      onClose={onClose}
      onCopyUri={(uri) => void onCopyUri(uri)}
    />
  )
}
