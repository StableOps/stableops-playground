'use client'

import { useCallback, useState, type ReactNode } from 'react'

import {
  WalletConnectDialog as SharedWalletConnectDialog,
  type WalletConnectDialogCopy,
} from '@stableops/wallet-ui'
import type { WalletConnectControllerState } from '@stableops/wallet-sdk'

import type { TranslationFunctions } from './i18n/i18n-types.js'
import type { PlaygroundWallet } from './wallets'

type WalletConnectLabels = TranslationFunctions['walletConnect']

export type WalletConnectDialogProps = {
  open: boolean
  labels: WalletConnectLabels
  copiedLabel: string
  projectId: string | undefined
  available: boolean
  wallets: PlaygroundWallet[]
  selectedWallet: PlaygroundWallet | null
  state: WalletConnectControllerState
  qrCode: string | null
  error: string | null
  themeColor?: string
  onSelectWallet: (wallet: PlaygroundWallet) => void
  walletLinkMode?: boolean
  onBack: () => void
  onClose: () => void
}

function toWalletConnectCopy(
  labels: WalletConnectLabels,
  copiedLabel: string,
): WalletConnectDialogCopy {
  return {
    heading: labels.heading(),
    back: labels.back(),
    close: labels.close(),
    qrAlt: labels.qrAlt(),
    payWith: (wallet) => labels.payWith({ wallet }),
    scanWithWallet: (wallet) => labels.scanWithWallet({ wallet }),
    scanAnyWallet: labels.scanAnyWallet(),
    openWallet: (wallet) => labels.openWallet({ wallet }),
    copyUri: labels.copyUri(),
    copied: copiedLabel,
    or: labels.or(),
    connectFailed: labels.connectFailed(),
  }
}

export function WalletConnectDialog({
  open,
  labels,
  copiedLabel,
  projectId,
  available,
  wallets,
  selectedWallet,
  state,
  qrCode,
  error,
  themeColor,
  onSelectWallet,
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
      // 剪贴板不可用时静默：二维码和深链仍可继续使用。
    }
  }, [])

  return (
    <SharedWalletConnectDialog
      open={open}
      copy={toWalletConnectCopy(labels, copiedLabel)}
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
      onSelectWallet={onSelectWallet}
      onBack={onBack}
      onClose={onClose}
      onCopyUri={(uri) => void onCopyUri(uri)}
    />
  )
}
