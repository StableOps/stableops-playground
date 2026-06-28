'use client'

import { useCallback, useState, type ReactNode } from 'react'

import {
  WalletConnectDialog as SharedWalletConnectDialog,
  type WalletConnectDialogCopy,
  type WalletConnectDialogError,
} from '@stableops/wallet-ui'
import type { WalletConnectControllerState } from '@stableops/wallet-sdk'

import type { TranslationFunctions } from './i18n/i18n-types.js'
import type { PlaygroundWallet } from './wallets'

type WalletConnectLabels = TranslationFunctions['walletConnect']

export type { WalletConnectDialogError } from '@stableops/wallet-ui'

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

function walletConnectErrorMessage(labels: WalletConnectLabels, code: string): string | null {
  switch (code) {
    case 'walletconnect_dependency_missing':
      return labels.errors.dependencyMissing()
    case 'walletconnect_project_id_missing':
      return labels.errors.projectIdMissing()
    case 'walletconnect_init_failed':
      return labels.errors.initFailed()
    case 'walletconnect_connect_failed':
      return labels.errors.connectFailed()
    case 'walletconnect_no_authorized_chains':
      return labels.errors.noAuthorizedChains()
    case 'walletconnect_tron_unsupported':
      return labels.errors.tronUnsupported()
    case 'wallet_provider_mismatch':
      return labels.errors.providerMismatch()
    case 'wallet_provider_not_found':
      return labels.errors.providerNotFound()
    case 'wallet_tx_reverted':
      return labels.errors.txReverted()
    case 'token_contract_not_found':
      return labels.errors.tokenContractNotFound()
    case 'payment_instruction_not_found':
      return labels.errors.paymentInstructionNotFound()
    case 'unsupported_chain':
      return labels.errors.unsupportedChain()
    default:
      return null
  }
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
    paymentPrompt: (wallet) => labels.paymentPrompt({ wallet }),
    retryPayment: (wallet) => labels.retryPayment({ wallet }),
    retryingPayment: labels.retryingPayment(),
    refreshConnection: labels.refreshConnection(),
    copyUri: labels.copyUri(),
    copied: copiedLabel,
    or: labels.or(),
    connectFailed: labels.connectFailed(),
    errorMessage: (code) => walletConnectErrorMessage(labels, code),
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
      useShadowRoot={true}
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
