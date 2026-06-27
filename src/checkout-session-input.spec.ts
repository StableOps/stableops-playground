import { describe, expect, it } from 'vitest'

import { buildCheckoutSessionInput } from './checkout-session-input'

describe('buildCheckoutSessionInput', () => {
  const base = {
    merchantOrderId: 'checkout_demo_1',
    amount: '0.01',
    amountMode: 'auto' as const,
    acceptedAssets: [{ chain: 'base-sepolia' as const, asset: 'USDC' as const }],
    expiresAt: '2026-12-31T00:00:00.000Z',
    title: 'Starter',
    description: 'Sandbox checkout',
    successUrl: 'https://merchant.test/success',
    cancelUrl: 'https://merchant.test/cancel',
    metadata: { source: 'docs_checkout' },
  }

  it('includes walletConnectProjectId when provided', () => {
    expect(
      buildCheckoutSessionInput({
        ...base,
        walletConnectProjectId: 'wc_project_123',
      }),
    ).toMatchObject({
      walletConnectProjectId: 'wc_project_123',
    })
  })

  it('omits walletConnectProjectId when blank', () => {
    expect(
      buildCheckoutSessionInput({
        ...base,
        walletConnectProjectId: '   ',
      }),
    ).not.toHaveProperty('walletConnectProjectId')
  })
})
