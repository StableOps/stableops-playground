import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'subscription.tsx'), 'utf8')

describe('subscription playground UI', () => {
  it('keeps merchant controls separate from per-user subscription boxes', () => {
    expect(source).toContain('merchantActions')
    expect(source).toContain('type DemoUserState')
    expect(source).toContain('users.map((user)')
    expect(source).toContain('copy.addUser()')
  })

  it('renders plain text logs inside each user box', () => {
    expect(source).toContain('type LogEntry = string')
    expect(source).toContain('user.log.join')
    expect(source).toContain("new Date().toISOString().slice(11, 19)")
    expect(source).toContain('`${at}  ${label}')
  })

  it('keeps logs to main steps without detailed payload summaries', () => {
    expect(source).toContain('function pushUserLog(userId: string, label: string)')
    expect(source).not.toContain('formatLogValue')
    expect(source).not.toContain('function appendSubscriptionLines')
    expect(source).not.toContain('function appendInvoiceLines')
    expect(source).not.toContain('function compactRecord')
    expect(source).not.toContain('JSON.stringify(value, null, 2)')
  })

  it('logs user action start and failure states in each user activity log', () => {
    expect(source).toContain('const userActionLogLabels')
    expect(source).toContain("start: 'creating subscription'")
    expect(source).toContain("start: 'creating portal session'")
    expect(source).toContain("pushUserLog(user.id, `${logLabel.failed}: ${message}`)")
  })

  it('polls checkout payment status for up to five minutes', () => {
    expect(source).toContain('PAYMENT_POLL_MAX_ATTEMPTS = 60')
    expect(source).toContain('PAYMENT_POLL_INTERVAL_MS = 5_000')
    expect(source).toContain('startPaymentPolling')
    expect(source).toContain('payment status polled')
    expect(source).not.toContain("pushUserLog(user.id, 'payment status polled',")
  })

  it('gates merchant and user actions by their prerequisites', () => {
    expect(source).toContain('const hasApiKey =')
    expect(source).toContain('const hasPlans =')
    expect(source).toContain('const canAddUser = hasApiKey && hasPlans')
    expect(source).toContain('createSubscriptionDisabled')
    expect(source).toContain('createPortalDisabled')
    expect(source).toContain('checkoutDisabled')
    expect(source).toContain('paymentDisabled')
    expect(source).toContain('upgradeDisabled')
    expect(source).toContain('downgradeDisabled')
  })

  it('labels chain selection as chain and asset multi-select', () => {
    expect(source).toContain('copy.chainAssets()')
    expect(source).not.toContain('copy.chains()')
  })

  it('uses plan data for plan labels and hides summaries before plans exist', () => {
    expect(source).toContain('copy.upgradeTo({ plan:')
    expect(source).toContain('copy.downgradeTo({ plan:')
    expect(source).toContain('formatPlanSummary(')
    expect(source).toContain('{starterPlan && proPlan ? (')
    expect(source).not.toContain('copy.starterPlan()')
    expect(source).not.toContain('copy.proPlan()')
  })

  it('disables completed subscription actions without blocking later steps', () => {
    expect(source).toContain('const subscriptionReady =')
    expect(source).toContain('const createSubscriptionDisabled =')
    expect(source).toContain('!subscriptionReady || Boolean(user.subscriptionId)')
    expect(source).toContain('const portalReady = subscriptionReady && Boolean(user.subscriptionId)')
    expect(source).toContain('const createPortalDisabled =')
    expect(source).toContain('!portalReady || Boolean(user.portalToken)')
    expect(source).toContain('variant="secondary"')
  })

  it('does not render restore controls for the new-tab checkout flow', () => {
    expect(source).not.toContain('readSubscriptionState')
    expect(source).not.toContain('restore')
    expect(source).not.toContain('copy.restore()')
  })

  it('shows subscription details instead of only the subscription id', () => {
    expect(source).toContain('formatSubscriptionSummary(')
    expect(source).toContain('planNameById')
    expect(source).toContain('subscription.status')
    expect(source).toContain('subscription.pendingPlanId')
    expect(source).toContain('subscription.currentPeriodEnd')
  })

  it('shows invoice details instead of only the invoice id', () => {
    expect(source).toContain('formatInvoiceSummary(user.openInvoice)')
    expect(source).toContain('invoice.kind')
    expect(source).toContain('invoice.amount')
    expect(source).toContain('invoice.asset')
    expect(source).toContain('invoice.dueAt')
    expect(source).toContain('invoice.paymentOrderId')
  })
})
