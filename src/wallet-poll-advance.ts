import type { PaymentOrderDetail } from '@stableops/api-sdk'

import { isAcceptedOrderStatus, isFailedTerminalOrderStatus } from './order-status'

export type WalletPollSignal = {
  kind: 'progressed' | 'terminal'
  status: string
}

export type WalletPollResolution = WalletPollSignal | { kind: 'stale' }

export function walletPollSignalForStatus(status: string): WalletPollSignal | null {
  if (isAcceptedOrderStatus('detected', status)) return { kind: 'progressed', status }
  if (isFailedTerminalOrderStatus(status)) return { kind: 'terminal', status }
  return null
}

export async function resolveWalletPollSignal(input: {
  orderId: string
  signal: WalletPollSignal
  generation: number
  currentGeneration: () => number
  refreshOrder: (id: string) => Promise<PaymentOrderDetail | null>
}): Promise<WalletPollResolution> {
  const fresh = await input.refreshOrder(input.orderId)
  if (input.generation !== input.currentGeneration()) return { kind: 'stale' }

  return fresh ? (walletPollSignalForStatus(fresh.status) ?? input.signal) : input.signal
}
