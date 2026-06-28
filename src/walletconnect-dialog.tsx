'use client'

import { useCallback, useState, type ReactNode } from 'react'

import {
  WalletConnectDialog as SharedWalletConnectDialog,
  type WalletConnectDialogError,
  type WalletConnectLocale,
} from '@stableops/wallet-ui'
import type { WalletConnectControllerState } from '@stableops/wallet-sdk'

import type { PlaygroundWallet } from './wallets'

export type { WalletConnectDialogError } from '@stableops/wallet-ui'

export type WalletConnectDialogProps = {
  open: boolean
  locale: WalletConnectLocale
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
      locale={locale}
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
