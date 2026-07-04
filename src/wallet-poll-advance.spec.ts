import type { PaymentOrderDetail } from '@stableops/api-sdk'
import { describe, expect, it, vi } from 'vitest'

import {
  resolveWalletPollSignal,
  walletPaymentPreflightForStatus,
  walletPollSignalForStatus,
} from './wallet-poll-advance'

describe('wallet poll advance', () => {
  it('classifies only detected/confirmed/finalized as progressed signals', () => {
    expect(walletPollSignalForStatus('created')).toBeNull()
    expect(walletPollSignalForStatus('detected')).toEqual({ kind: 'progressed', status: 'detected' })
    expect(walletPollSignalForStatus('confirmed')).toEqual({
      kind: 'progressed',
      status: 'confirmed',
    })
    expect(walletPollSignalForStatus('finalized')).toEqual({
      kind: 'progressed',
      status: 'finalized',
    })
  })

  it('classifies failed terminal statuses separately from progressed payment', () => {
    expect(walletPollSignalForStatus('expired')).toEqual({ kind: 'terminal', status: 'expired' })
    expect(walletPollSignalForStatus('canceled')).toEqual({ kind: 'terminal', status: 'canceled' })
    expect(walletPollSignalForStatus('reverted')).toEqual({ kind: 'terminal', status: 'reverted' })
  })

  it('drops a poll signal when refresh resolves after the generation changed', async () => {
    let generation = 1
    const refreshOrder = vi.fn(async () => {
      generation = 2
      return { status: 'detected' } as PaymentOrderDetail
    })

    await expect(
      resolveWalletPollSignal({
        orderId: 'po_1',
        signal: { kind: 'progressed', status: 'detected' },
        generation: 1,
        currentGeneration: () => generation,
        refreshOrder,
      }),
    ).resolves.toEqual({ kind: 'stale' })
  })

  it('keeps the original poll signal when refresh does not repeat an actionable status', async () => {
    const refreshOrder = vi.fn(async () => ({ status: 'created' }) as PaymentOrderDetail)

    await expect(
      resolveWalletPollSignal({
        orderId: 'po_1',
        signal: { kind: 'progressed', status: 'detected' },
        generation: 1,
        currentGeneration: () => 1,
        refreshOrder,
      }),
    ).resolves.toEqual({ kind: 'progressed', status: 'detected' })
  })
})

describe('walletPaymentPreflightForStatus', () => {
  it('allows wallet payment only while the order is still created', () => {
    expect(walletPaymentPreflightForStatus('created')).toEqual({ kind: 'payable' })
  })

  it('stops wallet payment when the order has already reached a failed terminal status', () => {
    expect(walletPaymentPreflightForStatus('canceled')).toEqual({
      kind: 'terminal',
      status: 'canceled',
    })
  })

  it('treats already detected orders as progressed instead of opening the wallet again', () => {
    expect(walletPaymentPreflightForStatus('detected')).toEqual({
      kind: 'progressed',
      status: 'detected',
    })
  })

  it('blocks unknown statuses instead of opening the wallet from stale UI state', () => {
    expect(walletPaymentPreflightForStatus('paused')).toEqual({ kind: 'blocked', status: 'paused' })
  })
})
