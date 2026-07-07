import { describe, expect, it } from 'vitest'

import {
  buildDemoMerchantUserId,
  buildInvoiceAddressSeed,
  demoSubscriptionPlans,
  findOpenInvoice,
  subscriptionChainOptions,
} from './subscription-helpers'
import { PlaygroundTestnets } from './testnets'

describe('subscription playground helpers', () => {
  it('uses every configured testnet chain and asset option', () => {
    expect(subscriptionChainOptions).toHaveLength(PlaygroundTestnets.length)
    expect(subscriptionChainOptions.map((option) => `${option.chain}:${option.asset}`)).toEqual(
      PlaygroundTestnets.map((option) => `${option.chain}:${option.asset}`),
    )
    expect(subscriptionChainOptions.map((option) => option.chain)).toContain('tron-nile')
    expect(subscriptionChainOptions.map((option) => option.asset)).toContain('USDT')
  })

  it('defines starter and pro demo plans in one group', () => {
    expect(demoSubscriptionPlans).toMatchObject([
      { code: 'demo_starter', groupKey: 'stableops_docs_demo', amount: '0.01' },
      { code: 'demo_pro', groupKey: 'stableops_docs_demo', amount: '0.1' },
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

  it('builds deterministic demo merchant user ids from timestamps', () => {
    expect(buildDemoMerchantUserId(1_783_260_000_000)).toBe('demo_user_mr7uym80')
  })
})
