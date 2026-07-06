import { describe, expect, it } from 'vitest'

import {
  buildDemoMerchantUserId,
  buildInvoiceAddressSeed,
  demoSubscriptionPlans,
  findOpenInvoice,
  persistSubscriptionState,
  readSubscriptionState,
  subscriptionChainOptions,
} from './subscription-helpers'

describe('subscription playground helpers', () => {
  it('uses USDC-only testnet options', () => {
    expect(subscriptionChainOptions.every((option) => option.asset === 'USDC')).toBe(true)
    expect(subscriptionChainOptions.map((option) => option.chain)).not.toContain('tron-nile')
  })

  it('defines starter and pro demo plans in one group', () => {
    expect(demoSubscriptionPlans).toMatchObject([
      { code: 'demo_starter', groupKey: 'stableops_docs_demo', amount: '0.01' },
      { code: 'demo_pro', groupKey: 'stableops_docs_demo', amount: '0.02' },
    ])
  })

  it('finds open invoices and builds invoice-specific address seeds', () => {
    expect(
      findOpenInvoice([
        { id: 'inv_paid', status: 'paid' },
        { id: 'inv_open', status: 'open' },
      ]),
    ).toMatchObject({ id: 'inv_open' })
    expect(buildInvoiceAddressSeed('user_1', 'inv_1')).toBe('sub_user_1_inv_inv_1')
  })

  it('persists resumable browser state', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    } as Storage

    persistSubscriptionState(storage, {
      portalToken: 'eps_token',
      subscriptionId: 'sub_1',
      invoiceId: 'inv_1',
    })

    expect(readSubscriptionState(storage)).toEqual({
      portalToken: 'eps_token',
      subscriptionId: 'sub_1',
      invoiceId: 'inv_1',
    })
  })

  it('builds deterministic demo merchant user ids from timestamps', () => {
    expect(buildDemoMerchantUserId(1_783_260_000_000)).toBe('demo_user_mr7uym80')
  })
})
