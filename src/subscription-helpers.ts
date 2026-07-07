import type { Asset, ChainId, EndUserInvoice } from '@stableops/api-sdk'

import { PlaygroundTestnets } from './testnets'

export const subscriptionGroupKey = 'stableops_docs_demo'

export const subscriptionChainOptions = PlaygroundTestnets.map((option) => ({
  value: `${option.chain}:${option.asset}`,
  label: option.label.replace(' (testnet)', ''),
  chain: option.chain,
  asset: option.asset,
})) as readonly {
  value: string
  label: string
  chain: ChainId
  asset: Asset
}[]

export const demoSubscriptionPlans = [
  {
    code: 'demo_starter',
    name: 'Starter',
    groupKey: subscriptionGroupKey,
    amount: '0.01',
    asset: 'USDC',
    interval: 'month',
    intervalCount: 1,
  },
  {
    code: 'demo_pro',
    name: 'Pro',
    groupKey: subscriptionGroupKey,
    amount: '0.1',
    asset: 'USDC',
    interval: 'month',
    intervalCount: 1,
  },
] as const

export function buildDemoMerchantUserId(now = Date.now()) {
  return `demo_user_${now.toString(36)}`
}

export function findOpenInvoice<T extends Pick<EndUserInvoice, 'status'> & { id: string }>(
  invoices: readonly T[],
): T | null {
  return invoices.find((invoice) => invoice.status === 'open') ?? null
}

export function buildInvoiceAddressSeed(merchantUserId: string, invoiceId: string) {
  return `sub_${merchantUserId}_inv_${invoiceId}`
}

export function selectedSubscriptionChains(values: readonly string[]): ChainId[] {
  return Array.from(
    new Set(
      values
        .map((value) => subscriptionChainOptions.find((option) => option.value === value)?.chain)
        .filter((chain): chain is ChainId => Boolean(chain)),
    ),
  )
}
