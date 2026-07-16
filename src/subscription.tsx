'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  StableOps,
  type EndUserInvoice,
  type EndUserSubscription,
  type MerchantInvoiceCheckoutSession,
  type MerchantPlan,
} from '@stableops/api-sdk'

import { Button, Input, Label, MultiSelect } from './ui'
import { Spinner } from './ui-bits'
import { importSandboxAddress } from './sandbox-address'
import { formatLocalClock, formatLocalTime } from './time'
import {
  buildDemoMerchantUserId,
  buildInvoiceAddressSeed,
  demoSubscriptionPlans,
  findOpenInvoice,
  selectedSubscriptionAssets,
  selectedSubscriptionChains,
  subscriptionChainOptions,
  subscriptionGroupKey,
} from './subscription-helpers'
import { loadAllLocales } from './i18n/i18n-util.sync.js'
import { i18nObject } from './i18n/i18n-util.js'
import type { Locales } from './i18n/i18n-types.js'

loadAllLocales()

const PAYMENT_POLL_INTERVAL_MS = 5_000
const PAYMENT_POLL_MAX_ATTEMPTS = 60

export type SubscriptionProps = {
  apiKey?: string
  locale?: 'en' | 'zh'
  baseUrl?: string
  checkoutUrl?: string
  walletConnectProjectId?: string
  className?: string
}

type LogEntry = string

type PlanState = {
  starter?: MerchantPlan
  pro?: MerchantPlan
}

type MerchantActionKey = 'plans' | 'user' | null
type UserActionKey =
  | 'subscription'
  | 'portal'
  | 'checkout'
  | 'payment'
  | 'upgrade'
  | 'downgrade'
  | 'reset'
  | null

const userActionLogLabels: Record<
  Exclude<UserActionKey, null>,
  { start: string; failed: string }
> = {
  subscription: { start: 'creating subscription', failed: 'subscription failed' },
  portal: { start: 'creating portal session', failed: 'portal session failed' },
  checkout: { start: 'creating checkout session', failed: 'checkout session failed' },
  payment: { start: 'checking payment status', failed: 'payment status check failed' },
  upgrade: { start: 'requesting upgrade', failed: 'upgrade failed' },
  downgrade: { start: 'requesting downgrade', failed: 'downgrade failed' },
  reset: { start: 'resetting user', failed: 'reset failed' },
}

type DemoUserState = {
  id: string
  merchantUserId: string
  portalToken: string
  subscriptionId: string
  subscription: EndUserSubscription | null
  openInvoice: EndUserInvoice | null
  checkoutUrl: string | null
  busy: UserActionKey
  polling: boolean
  error: string | null
  log: LogEntry[]
}

function createDemoUser(): DemoUserState {
  const merchantUserId = buildDemoMerchantUserId()
  return {
    id: `${merchantUserId}_${Math.random().toString(36).slice(2, 8)}`,
    merchantUserId,
    portalToken: '',
    subscriptionId: '',
    subscription: null,
    openInvoice: null,
    checkoutUrl: null,
    busy: null,
    polling: false,
    error: null,
    log: [],
  }
}

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
  const [selectedChains, setSelectedChains] = useState<string[]>(['base-sepolia:USDC'])
  const [autoImportAddress, setAutoImportAddress] = useState(true)
  const [amountMode, setAmountMode] = useState<'exact' | 'auto'>('auto')
  const [plans, setPlans] = useState<PlanState>({})
  const [merchantBusy, setMerchantBusy] = useState<MerchantActionKey>(null)
  const [merchantError, setMerchantError] = useState<string | null>(null)
  const [users, setUsers] = useState<DemoUserState[]>([])

  const chainOptions = useMemo(
    () => subscriptionChainOptions.map((option) => ({ value: option.value, label: option.label })),
    [],
  )
  const chains = useMemo(() => selectedSubscriptionChains(selectedChains), [selectedChains])
  const acceptedAssets = useMemo(() => selectedSubscriptionAssets(selectedChains), [selectedChains])
  const starterPlan = plans.starter
  const proPlan = plans.pro
  const planNameById = useMemo(() => {
    const entries = [starterPlan, proPlan]
      .filter((plan): plan is MerchantPlan => Boolean(plan))
      .map((plan) => [plan.id, plan.name] as const)
    return new Map(entries)
  }, [starterPlan, proPlan])
  const hasApiKey = apiKey.trim().length > 0
  const hasPlans = Boolean(starterPlan && proPlan)
  const canAddUser = hasApiKey && hasPlans

  function client() {
    return new StableOps({ apiKey: apiKey.trim(), baseUrl, checkoutBaseUrl: checkoutUrl })
  }

  function updateUser(id: string, updater: (user: DemoUserState) => DemoUserState) {
    setUsers((prev) => prev.map((user) => (user.id === id ? updater(user) : user)))
  }

  function pushUserLog(userId: string, label: string) {
    const at = formatLocalClock(new Date())
    const line = `${at}  ${label}`
    updateUser(userId, (user) => ({ ...user, log: [...user.log, line].slice(-12) }))
  }

  function validateSharedInput() {
    if (!apiKey.trim()) return copy.missingKey()
    if (chains.length === 0) return copy.missingChain()
    return null
  }

  async function runMerchant<T>(key: Exclude<MerchantActionKey, null>, action: () => Promise<T>) {
    setMerchantError(null)
    const validationError = validateSharedInput()
    if (validationError) {
      setMerchantError(validationError)
      return null
    }
    setMerchantBusy(key)
    try {
      return await action()
    } catch (err) {
      setMerchantError(err instanceof Error ? err.message : copy.unknownError())
      return null
    } finally {
      setMerchantBusy(null)
    }
  }

  async function runUser<T>(
    user: DemoUserState,
    key: Exclude<UserActionKey, null>,
    action: () => Promise<T>,
  ) {
    const logLabel = userActionLogLabels[key]
    updateUser(user.id, (current) => ({ ...current, busy: key, error: null }))
    pushUserLog(user.id, logLabel.start)
    const validationError = validateSharedInput()
    if (validationError) {
      updateUser(user.id, (current) => ({ ...current, busy: null, error: validationError }))
      pushUserLog(user.id, `${logLabel.failed}: ${validationError}`)
      return null
    }
    try {
      return await action()
    } catch (err) {
      const message = err instanceof Error ? err.message : copy.unknownError()
      updateUser(user.id, (current) => ({
        ...current,
        error: message,
      }))
      pushUserLog(user.id, `${logLabel.failed}: ${message}`)
      return null
    } finally {
      updateUser(user.id, (current) => ({ ...current, busy: null }))
    }
  }

  async function preparePlans() {
    await runMerchant('plans', async () => {
      const stableops = client()
      const existing = await stableops.merchantSubscriptions.plans.list({
        groupKey: subscriptionGroupKey,
        includeInactive: true,
      })
      const next: PlanState = {}

      for (const planInput of demoSubscriptionPlans) {
        const found = existing.find((plan) => plan.code === planInput.code)
        const plan =
          found ??
          (await stableops.merchantSubscriptions.plans.create(planInput, {
            idempotencyKey: `plan_${planInput.code}`,
          }))

        if (plan.code === 'demo_starter') next.starter = plan
        if (plan.code === 'demo_pro') next.pro = plan
      }

      setPlans(next)
    })
  }

  function addUser() {
    setMerchantError(null)
    setUsers((prev) => [createDemoUser(), ...prev])
  }

  function updateMerchantUserId(userId: string, merchantUserId: string) {
    updateUser(userId, (user) => ({
      ...user,
      merchantUserId,
      portalToken: '',
      subscriptionId: '',
      subscription: null,
      openInvoice: null,
      error: null,
      log: [],
    }))
  }

  async function createSubscription(user: DemoUserState) {
    await runUser(user, 'subscription', async () => {
      if (!plans.starter) throw new Error(copy.starterPlanNotReady())
      const result = await client().merchantSubscriptions.subscriptions.create(
        { planId: plans.starter.id, merchantUserId: user.merchantUserId },
        { idempotencyKey: `sub_${user.merchantUserId}` },
      )
      updateUser(user.id, (current) => ({
        ...current,
        subscriptionId: result.subscription.id,
        subscription: result.subscription,
        openInvoice: result.invoice,
      }))
      pushUserLog(user.id, 'subscription created')
    })
  }

  async function createPortal(user: DemoUserState) {
    await runUser(user, 'portal', async () => {
      const session = await client().merchantSubscriptions.portalSessions.create(
        { merchantUserId: user.merchantUserId },
        { idempotencyKey: `portal_${user.merchantUserId}` },
      )
      updateUser(user.id, (current) => ({ ...current, portalToken: session.portalToken }))
      pushUserLog(user.id, 'portal session created')
    })
  }

  async function refreshOpenInvoice(user: DemoUserState, token = user.portalToken) {
    if (!token) return null
    const portal = client().portal(token)
    const invoices = await portal.invoices.list({
      status: 'open',
      subscriptionId: user.subscriptionId || undefined,
    })
    const invoice = findOpenInvoice(invoices)
    updateUser(user.id, (current) => ({ ...current, openInvoice: invoice }))
    return invoice
  }

  async function openCheckout(user: DemoUserState) {
    await runUser(user, 'checkout', async () => {
      if (!user.portalToken) throw new Error(copy.portalSessionNotReady())
      const invoice = user.openInvoice ?? (await refreshOpenInvoice(user))
      if (!invoice) throw new Error(copy.noOpenInvoice())

      if (autoImportAddress) {
        try {
          await importSandboxAddress({
            apiKey: apiKey.trim(),
            baseUrl,
            merchantOrderId: buildInvoiceAddressSeed(user.merchantUserId, invoice.id),
            chains,
          })
        } catch {
          /* 地址自举失败不阻断，checkout 建单会返回准确错误。 */
        }
      }

      const currentUrl = new URL(window.location.href)
      currentUrl.search = ''

      let session: MerchantInvoiceCheckoutSession
      try {
        session = await client()
          .portal(user.portalToken)
          .invoices.checkoutSession(invoice.id, {
            acceptedAssets,
            amountMode,
            successUrl: `${currentUrl.toString()}?result=success`,
            cancelUrl: `${currentUrl.toString()}?result=canceled`,
            walletConnectProjectId,
          })
      } catch (err) {
        const message = err instanceof Error ? err.message : copy.unknownError()
        if (!autoImportAddress && /no available address/i.test(message)) {
          throw new Error(`${message}\n${copy.noAddressHint()}`)
        }
        throw err
      }

      pushUserLog(user.id, 'checkout session created')

      window.open(session.checkoutUrl, '_blank', 'noopener,noreferrer')
      updateUser(user.id, (current) => ({ ...current, checkoutUrl: session.checkoutUrl }))
      void startPaymentPolling(user, invoice.id)
    })
  }

  async function readPaymentStatus(user: DemoUserState, invoiceId?: string) {
    const invoice = invoiceId
      ? ({ id: invoiceId, status: 'open' } as EndUserInvoice)
      : (user.openInvoice ?? (await refreshOpenInvoice(user)))
    if (!invoice) throw new Error(copy.noOpenInvoice())
    if (!user.portalToken) throw new Error(copy.portalSessionNotReady())

    const portal = client().portal(user.portalToken)
    const status = await portal.invoices.paymentStatus(invoice.id)
    const subscription = await portal.subscription.get()
    updateUser(user.id, (current) => ({
      ...current,
      subscription,
      subscriptionId: subscription.id,
      openInvoice: status.status === 'open' ? invoice : null,
    }))
    return { status, subscription }
  }

  async function checkPayment(user: DemoUserState) {
    await runUser(user, 'payment', async () => {
      const result = await readPaymentStatus(user)
      pushUserLog(user.id, `payment status checked: ${result.status.status}`)
    })
  }

  async function startPaymentPolling(user: DemoUserState, invoiceId: string) {
    if (user.polling) return
    updateUser(user.id, (current) => ({ ...current, polling: true }))
    pushUserLog(user.id, 'payment polling started')
    try {
      for (let attempt = 1; attempt <= PAYMENT_POLL_MAX_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, PAYMENT_POLL_INTERVAL_MS))
        const result = await readPaymentStatus(user, invoiceId)
        pushUserLog(user.id, `payment status polled: ${result.status.status}`)
        if (result.status.status !== 'open') return
      }
      pushUserLog(user.id, 'payment polling stopped: timeout')
    } catch (err) {
      updateUser(user.id, (current) => ({
        ...current,
        error: err instanceof Error ? err.message : copy.unknownError(),
      }))
    } finally {
      updateUser(user.id, (current) => ({ ...current, polling: false }))
    }
  }

  async function changePlan(
    user: DemoUserState,
    key: Extract<UserActionKey, 'upgrade' | 'downgrade'>,
    targetPlan: MerchantPlan | undefined,
  ) {
    await runUser(user, key, async () => {
      if (!targetPlan) throw new Error(copy.targetPlanNotReady())
      if (!user.portalToken) throw new Error(copy.portalSessionNotReady())

      const result = await client().portal(user.portalToken).subscription.changePlan({
        planId: targetPlan.id,
      })
      updateUser(user.id, (current) => ({
        ...current,
        subscription: result.subscription,
        subscriptionId: result.subscription.id,
        openInvoice: result.invoice,
      }))
      pushUserLog(user.id, `${key} requested`)
    })
  }

  function resetUser(userId: string) {
    updateUser(userId, () => createDemoUser())
  }

  const merchantActions = [
    {
      key: 'plans' as const,
      label: copy.createPlans(),
      onClick: preparePlans,
      disabled: !hasApiKey,
    },
    {
      key: 'user' as const,
      label: copy.addUser(),
      onClick: addUser,
      disabled: !canAddUser,
    },
  ]

  return (
    <div className={className}>
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="subscription-chains">{copy.chainAssets()}</Label>
              <MultiSelect
                id="subscription-chains"
                options={chainOptions}
                value={selectedChains}
                onChange={setSelectedChains}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscription-amount-mode">{copy.amountMode()}</Label>
              <MultiSelect
                id="subscription-amount-mode"
                options={[
                  { value: 'auto', label: copy.amountModeAuto() },
                  { value: 'exact', label: copy.amountModeExact() },
                ]}
                value={[amountMode]}
                onChange={(next) => {
                  const selected = next[next.length - 1]
                  if (selected === 'auto' || selected === 'exact') setAmountMode(selected)
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoImportAddress}
                onChange={(event) => setAutoImportAddress(event.target.checked)}
              />
              <span className="font-medium">{copy.autoImport()}</span>
            </label>
            <p className="pl-6 text-xs text-muted-foreground">{copy.autoImportHint()}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {merchantActions.map((action) => (
            <MerchantActionButton key={action.key} action={action} busy={merchantBusy} />
          ))}
        </div>
        {merchantError ? (
          <div className="mt-3 whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {merchantError}
          </div>
        ) : null}
        {starterPlan && proPlan ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SummaryTile label={starterPlan.name} value={formatPlanSummary(starterPlan)} />
            <SummaryTile label={proPlan.name} value={formatPlanSummary(proPlan)} />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {users.map((user) => (
          <div key={user.id}>
            <div className="rounded-md border bg-muted/20 p-3">
              {(() => {
                const subscriptionReady =
                  hasApiKey && hasPlans && Boolean(user.merchantUserId.trim())
                const createSubscriptionDisabled =
                  !subscriptionReady || Boolean(user.subscriptionId)
                const portalReady = subscriptionReady && Boolean(user.subscriptionId)
                const createPortalDisabled = !portalReady || Boolean(user.portalToken)
                const checkoutReady = portalReady && Boolean(user.portalToken)
                const checkoutDisabled = !checkoutReady || !user.openInvoice
                const paymentDisabled = !checkoutReady || !user.openInvoice
                const pendingPlanId = user.subscription?.pendingPlanId
                const activePlanId = pendingPlanId ?? user.subscription?.planId
                const upgradeDisabled =
                  !checkoutReady ||
                  Boolean(user.openInvoice) ||
                  Boolean(pendingPlanId) ||
                  !proPlan ||
                  activePlanId === proPlan.id
                const downgradeDisabled =
                  !checkoutReady ||
                  Boolean(user.openInvoice) ||
                  Boolean(pendingPlanId) ||
                  !starterPlan ||
                  activePlanId === starterPlan.id

                return (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`subscription-user-id-${user.id}`}>
                        {copy.merchantUserId()}
                      </Label>
                      <Input
                        id={`subscription-user-id-${user.id}`}
                        value={user.merchantUserId}
                        onChange={(event) => updateMerchantUserId(user.id, event.target.value)}
                        autoComplete="off"
                        className="font-mono"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <SummaryTile
                        label={copy.currentSubscription()}
                        value={formatSubscriptionSummary(user.subscription, planNameById)}
                      />
                      <SummaryTile
                        label={copy.openInvoice()}
                        value={formatInvoiceSummary(user.openInvoice)}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <UserActionButton
                        action={{
                          key: 'subscription',
                          label: copy.createSubscription(),
                          onClick: () => createSubscription(user),
                        }}
                        busy={user.busy}
                        disabled={createSubscriptionDisabled}
                      />
                      <UserActionButton
                        variant="secondary"
                        action={{
                          key: 'portal',
                          label: copy.createPortal(),
                          onClick: () => createPortal(user),
                        }}
                        busy={user.busy}
                        disabled={createPortalDisabled}
                      />
                      <UserActionButton
                        variant="secondary"
                        action={{
                          key: 'checkout',
                          label: copy.payInvoice(),
                          onClick: () => openCheckout(user),
                        }}
                        busy={user.busy}
                        disabled={checkoutDisabled}
                      />
                      <UserActionButton
                        variant="secondary"
                        action={{
                          key: 'payment',
                          label: copy.waitPaid(),
                          onClick: () => checkPayment(user),
                        }}
                        busy={user.busy}
                        disabled={paymentDisabled}
                      />
                      <UserActionButton
                        variant="secondary"
                        action={{
                          key: 'upgrade',
                          label: proPlan
                            ? copy.upgradeTo({ plan: proPlan.name })
                            : copy.changePlan(),
                          onClick: () => changePlan(user, 'upgrade', proPlan),
                        }}
                        busy={user.busy}
                        disabled={upgradeDisabled}
                      />
                      <UserActionButton
                        variant="secondary"
                        action={{
                          key: 'downgrade',
                          label: starterPlan
                            ? copy.downgradeTo({ plan: starterPlan.name })
                            : copy.changePlan(),
                          onClick: () => changePlan(user, 'downgrade', starterPlan),
                        }}
                        busy={user.busy}
                        disabled={downgradeDisabled}
                      />
                      <UserActionButton
                        action={{
                          key: 'reset',
                          label: copy.reset(),
                          onClick: () => resetUser(user.id),
                        }}
                        busy={user.busy}
                        variant="ghost"
                      />
                    </div>

                    {user.error ? (
                      <div className="mt-3 whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                        {user.error}
                      </div>
                    ) : null}
                  </>
                )
              })()}
            </div>
            <div className="mt-4 border rounded-lg bg-background/50 p-3.5">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Activity log</div>
              <AutoScrollPre className="max-h-40 overflow-auto font-mono text-xs leading-relaxed">
                {user.log.length === 0 ? '(empty)' : user.log.join('\n')}
              </AutoScrollPre>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AutoScrollPre({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  })
  return (
    <pre ref={ref} className={className}>
      {children}
    </pre>
  )
}

function formatPlanSummary(plan: MerchantPlan) {
  const asset = demoSubscriptionPlans.find((input) => input.code === plan.code)?.asset ?? 'USDC'
  const interval =
    plan.intervalCount === 1
      ? plan.interval.replace('_', ' ')
      : `${plan.intervalCount} ${plan.interval.replace('_', ' ')}`
  return `${plan.amount} ${asset} / ${interval} · ${plan.id}`
}

function formatSubscriptionSummary(
  subscription: EndUserSubscription | null,
  planNameById: ReadonlyMap<string, string>,
) {
  if (!subscription) return '-'
  const currentPlan = planNameById.get(subscription.planId) ?? subscription.planId
  const pendingPlan = subscription.pendingPlanId
    ? (planNameById.get(subscription.pendingPlanId) ?? subscription.pendingPlanId)
    : '-'

  return [
    `id: ${subscription.id}`,
    `status: ${subscription.status}`,
    `plan: ${currentPlan}`,
    `pending: ${pendingPlan}`,
    `period end: ${formatDateTime(subscription.currentPeriodEnd)}`,
  ].join('\n')
}

function formatInvoiceSummary(invoice: EndUserInvoice | null) {
  if (!invoice) return '-'
  const amount = invoice.asset ? `${invoice.amount} ${invoice.asset}` : invoice.amount

  return [
    `id: ${invoice.id}`,
    `status: ${invoice.status}`,
    `kind: ${invoice.kind}`,
    `amount: ${amount}`,
    `due: ${formatDateTime(invoice.dueAt)}`,
    `payment order: ${invoice.paymentOrderId ?? '-'}`,
  ].join('\n')
}

function formatDateTime(value: string) {
  return formatLocalTime(value)
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/10 p-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">
        {value}
      </div>
    </div>
  )
}

function MerchantActionButton({
  action,
  busy,
}: {
  action: {
    key: Exclude<MerchantActionKey, null>
    label: string
    onClick: () => void | Promise<void>
    disabled?: boolean
  }
  busy: MerchantActionKey
}) {
  return (
    <Button
      type="button"
      size="sm"
      disabled={Boolean(busy) || action.disabled}
      onClick={() => void action.onClick()}>
      {busy === action.key ? <Spinner className="size-4" /> : null}
      {action.label}
    </Button>
  )
}

function UserActionButton({
  action,
  busy,
  variant,
  disabled,
}: {
  action: { key: Exclude<UserActionKey, null>; label: string; onClick: () => void | Promise<void> }
  busy: UserActionKey
  variant?: 'outline' | 'secondary' | 'ghost'
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={Boolean(busy) || disabled}
      onClick={() => void action.onClick()}>
      {busy === action.key ? <Spinner className="size-4" /> : null}
      {action.label}
    </Button>
  )
}
