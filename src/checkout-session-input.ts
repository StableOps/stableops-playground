import type { AcceptedAssetInput, CreateCheckoutSessionInput } from '@stableops/api-sdk'

export type BuildCheckoutSessionInputParams = {
  merchantOrderId: string
  amount: string
  amountMode: 'exact' | 'auto'
  acceptedAssets: AcceptedAssetInput[]
  expiresAt: string
  title?: string
  description?: string
  successUrl?: string
  cancelUrl?: string
  walletConnectProjectId?: string
  metadata?: Record<string, unknown>
}

export function buildCheckoutSessionInput({
  merchantOrderId,
  amount,
  amountMode,
  acceptedAssets,
  expiresAt,
  title,
  description,
  successUrl,
  cancelUrl,
  walletConnectProjectId,
  metadata,
}: BuildCheckoutSessionInputParams): CreateCheckoutSessionInput {
  const trimmedWalletConnectProjectId = walletConnectProjectId?.trim()
  return {
    merchantOrderId,
    amount,
    amountMode,
    acceptedAssets,
    expiresAt,
    title,
    description,
    successUrl,
    cancelUrl,
    ...(trimmedWalletConnectProjectId
      ? { walletConnectProjectId: trimmedWalletConnectProjectId }
      : {}),
    metadata,
  }
}
