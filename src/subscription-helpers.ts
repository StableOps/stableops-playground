import type { ChainId, EndUserInvoice } from '@stableops/api-sdk'

import { PlaygroundTestnets } from './testnets'

export const subscriptionGroupKey = 'stableops_docs_demo'

export const subscriptionChainOptions = PlaygroundTestnets.filter(
  (option) => option.asset === 'USDC',
).map((option) => ({
  label: option.label.replace(' (testnet)', ''),
  chain: option.chain,
  asset: option.asset,
})) as readonly {
  label: string
  chain: ChainId
  asset: 'USDC'
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
    amount: '0.02',
    asset: 'USDC',
    interval: 'month',
    intervalCount: 1,
  },
] as const

export type SubscriptionResumeState = {
  portalToken: string
  subscriptionId: string
  invoiceId: string
}

const storageKey = 'stableops.subscriptionDemo.state'

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

export function persistSubscriptionState(storage: Storage, state: SubscriptionResumeState) {
  storage.setItem(storageKey, JSON.stringify(state))
}

export function readSubscriptionState(storage: Storage): SubscriptionResumeState | null {
  const raw = storage.getItem(storageKey)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SubscriptionResumeState>
    if (!parsed.portalToken || !parsed.subscriptionId || !parsed.invoiceId) return null
    return {
      portalToken: parsed.portalToken,
      subscriptionId: parsed.subscriptionId,
      invoiceId: parsed.invoiceId,
    }
  } catch {
    return null
  }
}

export function clearSubscriptionState(storage: Storage) {
  storage.removeItem(storageKey)
}

export function selectedSubscriptionChains(values: readonly string[]): ChainId[] {
  return values
    .map((value) => subscriptionChainOptions.find((option) => option.chain === value)?.chain)
    .filter((chain): chain is ChainId => Boolean(chain))
}
