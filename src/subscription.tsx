'use client'

import { useMemo, useState } from 'react'
import { StableOps, type EndUserInvoice, type MerchantPlan } from '@stableops/api-sdk'

import { Button, Input, Label, MultiSelect, cn } from './ui'
import { Spinner } from './ui-bits'
import { importSandboxAddress } from './sandbox-address'
import {
  buildDemoMerchantUserId,
  buildInvoiceAddressSeed,
  clearSubscriptionState,
  demoSubscriptionPlans,
  findOpenInvoice,
  persistSubscriptionState,
  readSubscriptionState,
  selectedSubscriptionChains,
  subscriptionChainOptions,
  subscriptionGroupKey,
} from './subscription-helpers'
import { loadAllLocales } from './i18n/i18n-util.sync.js'
import { i18nObject } from './i18n/i18n-util.js'
import type { Locales } from './i18n/i18n-types.js'

loadAllLocales()

export type SubscriptionProps = {
  apiKey?: string
  locale?: 'en' | 'zh'
  baseUrl?: string
  checkoutUrl?: string
  walletConnectProjectId?: string
  className?: string
}

type Snapshot = {
  label: string
  value: unknown
}

type PlanState = {
  starter?: MerchantPlan
  pro?: MerchantPlan
}

type ActionKey = 'plans' | 'subscription' | 'portal' | 'checkout' | 'payment' | 'upgrade' | null

export function Subscription({
  apiKey: apiKeyProp = '',
  locale: localeProp = 'en',
  baseUrl = 'https://api.stableops.dev',
  checkoutUrl = 'https://pay.stableops.dev',
  walletConnectProjectId,
  className,
}: SubscriptionProps) {
  const locale: Locales = localeProp === 'zh' ? 'zh' : 'en'
  const copy = i18nObject(locale).subscription
  const [apiKey, setApiKey] = useState(apiKeyProp)
  const [merchantUserId, setMerchantUserId] = useState(buildDemoMerchantUserId)
  const [selectedChains, setSelectedChains] = useState<string[]>(['base-sepolia'])
  const [plans, setPlans] = useState<PlanState>({})
  const [portalToken, setPortalToken] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [openInvoice, setOpenInvoice] = useState<EndUserInvoice | null>(null)
  const [busy, setBusy] = useState<ActionKey>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  const chainOptions = useMemo(
    () => subscriptionChainOptions.map((option) => ({ value: option.chain, label: option.label })),
    [],
  )
  const chains = useMemo(() => selectedSubscriptionChains(selectedChains), [selectedChains])

  function client() {
    return new StableOps({ apiKey: apiKey.trim(), baseUrl, checkoutBaseUrl: checkoutUrl })
  }

  function push(message: string, value?: unknown) {
    setLog((prev) => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 8))
    if (value !== undefined) {
      setSnapshot({ label: message, value })
    }
  }

  async function run<T>(key: Exclude<ActionKey, null>, action: () => Promise<T>) {
    setError(null)
    if (!apiKey.trim()) {
      setError(copy.missingKey())
      return null
    }
    if (chains.length === 0) {
      setError(copy.missingChain())
      return null
    }
    setBusy(key)
    try {
      return await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.unknownError())
      return null
    } finally {
      setBusy(null)
    }
  }

  async function preparePlans() {
    await run('plans', async () => {
      const stableops = client()
      const existing = await stableops.merchantSubscriptions.plans.list({
        groupKey: subscriptionGroupKey,
        includeInactive: true,
      })
      const next: PlanState = {}

      for (const planInput of demoSubscriptionPlans) {
        const found = existing.find((plan) => plan.code === planInput.code)
        const plan = found
          ? await stableops.merchantSubscriptions.plans.update(found.id, planInput, {
              idempotencyKey: `plan_${planInput.code}`,
            })
          : await stableops.merchantSubscriptions.plans.create(planInput, {
              idempotencyKey: `plan_${planInput.code}`,
            })

        if (plan.code === 'demo_starter') next.starter = plan
        if (plan.code === 'demo_pro') next.pro = plan
      }

      setPlans(next)
      await stableops.merchantSubscriptions.settings.update(
        { acceptedChains: chains, paymentAmountMode: 'auto' },
        { idempotencyKey: `settings_${merchantUserId}` },
      )
      push('plans ready', next)
    })
  }

  async function createSubscription() {
    await run('subscription', async () => {
      if (!plans.starter) throw new Error('starter plan is not ready')
      const result = await client().merchantSubscriptions.subscriptions.create(
        { planId: plans.starter.id, merchantUserId },
        { idempotencyKey: `sub_${merchantUserId}` },
      )
      setSubscriptionId(result.subscription.id)
      setOpenInvoice(result.invoice)
      push('subscription created', result)
    })
  }

  async function createPortal() {
    await run('portal', async () => {
      const session = await client().merchantSubscriptions.portalSessions.create(
        { merchantUserId },
        { idempotencyKey: `portal_${merchantUserId}` },
      )
      setPortalToken(session.portalToken)
      if (subscriptionId && openInvoice?.id) {
        persistSubscriptionState(window.sessionStorage, {
          portalToken: session.portalToken,
          subscriptionId,
          invoiceId: openInvoice.id,
        })
      }
      push('portal session created', session)
    })
  }

  async function refreshOpenInvoice(token = portalToken) {
    if (!token) return null
    const portal = client().portal(token)
    const invoices = await portal.invoices.list({
      status: 'open',
      subscriptionId: subscriptionId || undefined,
    })
    const invoice = findOpenInvoice(invoices)
    setOpenInvoice(invoice)
    return invoice
  }

  async function openCheckout() {
    await run('checkout', async () => {
      if (!portalToken) throw new Error('portal session is not ready')
      const invoice = openInvoice ?? (await refreshOpenInvoice())
      if (!invoice) throw new Error(copy.noOpenInvoice())

      await importSandboxAddress({
        apiKey: apiKey.trim(),
        baseUrl,
        merchantOrderId: buildInvoiceAddressSeed(merchantUserId, invoice.id),
        chains,
      })

      const currentUrl = new URL(window.location.href)
      currentUrl.search = ''

      const session = await client().portal(portalToken).invoices.checkoutSession(invoice.id, {
        successUrl: `${currentUrl.toString()}?result=success`,
        cancelUrl: `${currentUrl.toString()}?result=canceled`,
        walletConnectProjectId,
      })

      persistSubscriptionState(window.sessionStorage, {
        portalToken,
        subscriptionId,
        invoiceId: invoice.id,
      })
      push('checkout session created', session)

      const opened = window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer')
      if (!opened) {
        setError(copy.popupBlocked())
        window.location.assign(session.checkoutUrl)
      }
    })
  }

  async function checkPayment() {
    await run('payment', async () => {
      const invoice = openInvoice ?? (await refreshOpenInvoice())
      if (!invoice) throw new Error(copy.noOpenInvoice())
      if (!portalToken) throw new Error('portal session is not ready')

      const portal = client().portal(portalToken)
      const status = await portal.invoices.paymentStatus(invoice.id)
      const subscription = await portal.subscription.get()
      setOpenInvoice(status.status === 'open' ? invoice : null)
      push('payment status checked', { status, subscription })
    })
  }

  async function upgrade() {
    await run('upgrade', async () => {
      if (!plans.pro) throw new Error('pro plan is not ready')
      if (!portalToken) throw new Error('portal session is not ready')

      const result = await client().portal(portalToken).subscription.changePlan({
        planId: plans.pro.id,
      })
      setOpenInvoice(result.invoice)
      push('upgrade requested', result)
    })
  }

  function restore() {
    const restored = readSubscriptionState(window.sessionStorage)
    if (!restored) return
    setPortalToken(restored.portalToken)
    setSubscriptionId(restored.subscriptionId)
    push('state restored', restored)
  }

  function reset() {
    clearSubscriptionState(window.sessionStorage)
    setMerchantUserId(buildDemoMerchantUserId())
    setPlans({})
    setPortalToken('')
    setSubscriptionId('')
    setOpenInvoice(null)
    setLog([])
    setSnapshot(null)
    setError(null)
  }

  const actions = [
    { key: 'plans' as const, label: copy.createPlans(), onClick: preparePlans },
    { key: 'subscription' as const, label: copy.createSubscription(), onClick: createSubscription },
    { key: 'portal' as const, label: copy.createPortal(), onClick: createPortal },
    { key: 'checkout' as const, label: copy.payInvoice(), onClick: openCheckout },
    { key: 'payment' as const, label: copy.waitPaid(), onClick: checkPayment },
    { key: 'upgrade' as const, label: copy.upgrade(), onClick: upgrade },
  ]

  return (
    <div className={cn('rounded-lg border bg-muted/20 p-4', className)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="subscription-api-key">{copy.apiKey()}</Label>
          <Input
            id="subscription-api-key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={copy.apiKeyPlaceholder()}
            autoComplete="off"
            type="password"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subscription-user-id">{copy.merchantUserId()}</Label>
          <Input
            id="subscription-user-id"
            value={merchantUserId}
            onChange={(event) => setMerchantUserId(event.target.value)}
            autoComplete="off"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subscription-chains">{copy.chains()}</Label>
          <MultiSelect
            id="subscription-chains"
            options={chainOptions}
            value={selectedChains}
            onChange={setSelectedChains}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.key}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void action.onClick()}>
            {busy === action.key ? <Spinner className="size-4" /> : null}
            {action.label}
          </Button>
        ))}
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={restore}>
          {copy.restore()}
        </Button>
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={reset}>
          {copy.reset()}
        </Button>
      </div>

      {error ? (
        <div className="mt-3 whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{copy.starterPlan()}</div>
          <div className="mt-2 text-xs text-muted-foreground">{plans.starter?.id ?? '—'}</div>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{copy.proPlan()}</div>
          <div className="mt-2 text-xs text-muted-foreground">{plans.pro?.id ?? '—'}</div>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{copy.currentSubscription()}</div>
          <div className="mt-2 text-xs text-muted-foreground">{subscriptionId || '—'}</div>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{copy.openInvoice()}</div>
          <div className="mt-2 text-xs text-muted-foreground">{openInvoice?.id ?? '—'}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{copy.log()}</div>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs">
            {log.join('\n')}
          </pre>
        </div>
        <div className="rounded-md border bg-background p-3">
          <div className="text-sm font-medium">{snapshot?.label ?? copy.response()}</div>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs">
            {snapshot ? JSON.stringify(snapshot.value, null, 2) : '{}'}
          </pre>
        </div>
      </div>
    </div>
  )
}
