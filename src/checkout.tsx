'use client'

import { useMemo, useState } from 'react'
import { StableOps } from '@stableops/api-sdk'

import { Button, Input, Label, MultiSelect, Textarea, cn } from './ui'
import { Spinner } from './ui-bits'
import { importSandboxAddress } from './sandbox-address'
import { buildCheckoutSessionInput } from './checkout-session-input'

import { loadAllLocales } from './i18n/i18n-util.sync.js'
import { i18nObject } from './i18n/i18n-util.js'
import type { Locales } from './i18n/i18n-types.js'

loadAllLocales()

const acceptedAssetOptions = [
  { label: 'Base Sepolia · USDC', chain: 'base-sepolia', asset: 'USDC' },
  {
    label: 'Ethereum Sepolia · USDC',
    chain: 'ethereum-sepolia',
    asset: 'USDC',
  },
  {
    label: 'Arbitrum Sepolia · USDC',
    chain: 'arbitrum-sepolia',
    asset: 'USDC',
  },
  { label: 'Polygon Amoy · USDC', chain: 'polygon-amoy', asset: 'USDC' },
  {
    label: 'Optimism Sepolia · USDC',
    chain: 'optimism-sepolia',
    asset: 'USDC',
  },
  { label: 'BNB Chain Testnet · USDC', chain: 'bsc-testnet', asset: 'USDC' },
  { label: 'BNB Chain Testnet · USDT', chain: 'bsc-testnet', asset: 'USDT' },
  { label: 'Solana Devnet · USDC', chain: 'solana-devnet', asset: 'USDC' },
  { label: 'TRON Nile · USDT', chain: 'tron-nile', asset: 'USDT' },
] as const

function buildDefaultMerchantOrderId() {
  return `checkout_demo_${Date.now().toString(36)}`
}

function parseMetadata(
  input: string,
  objectErrorMessage: string,
): Record<string, unknown> | undefined {
  const trimmed = input.trim()
  if (!trimmed) return undefined
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(objectErrorMessage)
  }
  return parsed as Record<string, unknown>
}

export type CheckoutProps = {
  apiKey?: string
  locale?: 'en' | 'zh'
  baseUrl?: string
  checkoutUrl?: string
  walletConnectProjectId?: string
  className?: string
}

export function Checkout({
  apiKey: apiKeyProp = '',
  locale: localeProp = 'en',
  baseUrl = 'https://api.stableops.dev',
  checkoutUrl = 'https://pay.stableops.dev',
  walletConnectProjectId,
  className,
}: CheckoutProps) {
  const locale: Locales = localeProp === 'zh' ? 'zh' : 'en'
  const LL = i18nObject(locale)
  const copy = LL.checkout

  const [apiKey, setApiKey] = useState(apiKeyProp)
  const [merchantOrderId, setMerchantOrderId] = useState(buildDefaultMerchantOrderId)
  const [amount, setAmount] = useState('0.01')
  const [selectedChains, setSelectedChains] = useState<string[]>(['base-sepolia:USDC'])
  const [title, setTitle] = useState(
    localeProp === 'zh' ? 'StableOps Starter 套餐' : 'StableOps Starter Plan',
  )
  const [description, setDescription] = useState(
    localeProp === 'zh' ? '沙箱收银台测试' : 'Sandbox checkout test',
  )
  const [successUrl, setSuccessUrl] = useState('https://stableops.dev/docs/checkout?result=success')
  const [cancelUrl, setCancelUrl] = useState('https://stableops.dev/docs/checkout?result=canceled')
  const [metadata, setMetadata] = useState('{\n  "source": "docs_checkout"\n}')
  const [autoImportAddress, setAutoImportAddress] = useState(true)
  const [amountMode, setAmountMode] = useState<'exact' | 'auto'>('auto')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedAssets = useMemo(
    () =>
      selectedChains
        .map((composite) => {
          const [chain, asset] = composite.split(':')
          return acceptedAssetOptions.find(
            (option) => option.chain === chain && option.asset === asset,
          )
        })
        .filter((option): option is (typeof acceptedAssetOptions)[number] => Boolean(option))
        .map((option) => ({ chain: option.chain, asset: option.asset })),
    [selectedChains],
  )

  const chainSelectOptions = useMemo(
    () =>
      acceptedAssetOptions.map((option) => ({
        value: `${option.chain}:${option.asset}`,
        label: option.label,
      })),
    [],
  )

  async function createAndOpenCheckout() {
    setError(null)
    const trimmedKey = apiKey.trim()
    const trimmedMerchantOrderId = merchantOrderId.trim()
    if (!trimmedKey || !trimmedMerchantOrderId || !amount.trim()) {
      setError(copy.missingRequired())
      return
    }
    if (selectedAssets.length === 0) {
      setError(copy.missingChain())
      return
    }

    setBusy(true)
    try {
      if (autoImportAddress) {
        try {
          await importSandboxAddress({
            apiKey: trimmedKey,
            baseUrl,
            merchantOrderId: trimmedMerchantOrderId,
            chains: selectedAssets.map((asset) => asset.chain),
          })
        } catch {
          /* 地址自举失败不阻断 */
        }
      }
      const stableops = new StableOps({
        apiKey: trimmedKey,
        baseUrl,
      })
      const checkout = await stableops.checkoutSessions.create(
        buildCheckoutSessionInput({
          merchantOrderId: trimmedMerchantOrderId,
          amount: amount.trim(),
          amountMode,
          acceptedAssets: selectedAssets,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          successUrl: successUrl.trim() || undefined,
          cancelUrl: cancelUrl.trim() || undefined,
          walletConnectProjectId,
          metadata: parseMetadata(metadata, copy.metadataObjectError()),
        }),
        { idempotencyKey: trimmedMerchantOrderId },
      )
      if (!checkout.clientSecret) {
        throw new Error(copy.responseMissingSecret())
      }
      const allocatedChains = new Set(
        checkout.paymentOrder.paymentInstructions.map((pi) => pi.chain),
      )
      const droppedChains = selectedAssets
        .map((asset) => asset.chain)
        .filter((chain) => !allocatedChains.has(chain))
      if (droppedChains.length > 0) {
        // 不臆测原因（套餐 / 地址池），统一给中性提示，避免对付费套餐误报「仅付费套餐可用」。
        const sep = locale === 'zh' ? '、' : ', '
        setError(copy.droppedUnallocated({ chains: droppedChains.join(sep) }))
        return
      }
      const query = new URLSearchParams({
        client_secret: checkout.clientSecret,
        lang: locale,
      })
      window.location.assign(
        `${checkoutUrl}/c/${encodeURIComponent(checkout.id)}?${query.toString()}`,
      )
    } catch (err) {
      const base = err instanceof Error ? err.message : copy.unknownError()
      if (/no available address/i.test(base)) {
        const sep = locale === 'zh' ? '、' : ', '
        setError(copy.droppedUnallocated({ chains: selectedAssets.map((a) => a.chain).join(sep) }))
      } else {
        setError(autoImportAddress ? base : `${base}\n${copy.noAddressHint()}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('rounded-lg border bg-muted/20 p-4', className)}>
      <div className="space-y-2">
        <Label htmlFor="checkout-api-key">{copy.apiKey()}</Label>
        <Input
          id="checkout-api-key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={copy.apiKeyPlaceholder()}
          autoComplete="off"
          type="password"
          className="h-10 w-full bg-background font-mono"
        />
        <p className="text-xs text-muted-foreground">{LL.apiKey.hint()}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="checkout-merchant-order-id">{copy.merchantOrderId()}</Label>
          <Input
            id="checkout-merchant-order-id"
            value={merchantOrderId}
            onChange={(event) => setMerchantOrderId(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkout-amount">{copy.amount()}</Label>
          <Input
            id="checkout-amount"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkout-asset">{copy.chainAsset()}</Label>
          <MultiSelect
            id="checkout-asset"
            options={chainSelectOptions}
            value={selectedChains}
            onChange={setSelectedChains}
            placeholder={copy.chainPlaceholder()}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkout-amount-mode">{copy.amountMode()}</Label>
          <MultiSelect
            id="checkout-amount-mode"
            options={[
              { value: 'auto', label: copy.amountModeAuto() },
              { value: 'exact', label: copy.amountModeExact() },
            ]}
            value={[amountMode]}
            onChange={(next) => setAmountMode(next[next.length - 1] as 'exact' | 'auto')}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="checkout-title">{copy.title()}</Label>
          <Input
            id="checkout-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="checkout-description">{copy.description()}</Label>
          <Input
            id="checkout-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkout-success-url">{copy.successUrl()}</Label>
          <Input
            id="checkout-success-url"
            value={successUrl}
            onChange={(event) => setSuccessUrl(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkout-cancel-url">{copy.cancelUrl()}</Label>
          <Input
            id="checkout-cancel-url"
            value={cancelUrl}
            onChange={(event) => setCancelUrl(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="checkout-metadata">{copy.metadata()}</Label>
          <Textarea
            id="checkout-metadata"
            value={metadata}
            onChange={(event) => setMetadata(event.target.value)}
            spellCheck={false}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              checked={autoImportAddress}
              onChange={(event) => setAutoImportAddress(event.target.checked)}
              disabled={busy}
            />
            <span className="font-medium">{copy.autoImport()}</span>
          </label>
          <p className="pl-6 text-xs text-muted-foreground">{copy.autoImportHint()}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy || !apiKey}
          onClick={() => void createAndOpenCheckout()}>
          {busy && <Spinner className="size-4" />}
          {copy.create()}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setMerchantOrderId(buildDefaultMerchantOrderId())}>
          {copy.newOrderId()}
        </Button>
      </div>
      {error ? (
        <div className="mt-3 whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  )
}
