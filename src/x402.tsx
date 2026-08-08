'use client'

import { useState } from 'react'

import { Badge, Button, Input, Label, cn } from './ui'
import { CopyButton, Spinner } from './ui-bits'
import { i18nObject } from './i18n/i18n-util.js'
import { loadAllLocales } from './i18n/i18n-util.sync.js'
import type { Locales } from './i18n/i18n-types.js'
import { decodeX402PaymentRequired, formatX402Json } from './x402-resource-utils'

loadAllLocales()

export const DEFAULT_X402_RESOURCE_URL =
  '/api/x402/sandbox-resource'

export type X402ResourceProps = {
  // 展示给 Agent 使用的真实资源地址；浏览器请求可以通过 Web 端同源代理完成。
  resourceUrl?: string
  // 可选的浏览器请求地址。未提供时直接请求 resourceUrl。
  requestUrl?: string
  locale?: 'en' | 'zh'
  className?: string
}

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'done'
      statusCode: number
      body: string
      paymentRequired: string | null
      decodedPaymentRequired: unknown | null
    }
  | { status: 'error'; message: string }

export function X402Resource({
  resourceUrl: resourceUrlProp = DEFAULT_X402_RESOURCE_URL,
  requestUrl,
  locale: localeProp = 'en',
  className,
}: X402ResourceProps) {
  const locale: Locales = localeProp === 'zh' ? 'zh' : 'en'
  const text = i18nObject(locale).x402
  const [resourceUrl, setResourceUrl] = useState(resourceUrlProp)
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' })

  async function requestChallenge() {
    const displayUrl = resourceUrl.trim()
    const targetUrl = requestUrl?.trim() || displayUrl
    if (!displayUrl || !targetUrl) {
      setRequestState({ status: 'error', message: text.requestError() })
      return
    }

    setRequestState({ status: 'loading' })
    try {
      const response = await fetch(targetUrl, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      const body = await response.text()
      const paymentRequired = response.headers.get('payment-required')
      setRequestState({
        status: 'done',
        statusCode: response.status,
        body,
        paymentRequired,
        decodedPaymentRequired: paymentRequired
          ? decodeX402PaymentRequired(paymentRequired)
          : null,
      })
    } catch (error) {
      setRequestState({
        status: 'error',
        message: error instanceof Error ? error.message : text.requestError(),
      })
    }
  }

  return (
    <div className={cn('rounded-lg border bg-muted/20 p-4', className)}>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{text.title()}</h3>
        <p className="text-sm text-muted-foreground">{text.description()}</p>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="x402-resource-url">{text.resourceUrl()}</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id="x402-resource-url"
              value={resourceUrl}
              onChange={(event) => setResourceUrl(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              readOnly={Boolean(requestUrl)}
              className="pr-10 font-mono text-xs"
            />
            <CopyButton
              value={resourceUrl}
              copyLabel={text.copy()}
              copiedLabel={text.copied()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            />
          </div>
          <Button
            type="button"
            disabled={requestState.status === 'loading'}
            onClick={() => void requestChallenge()}>
            {requestState.status === 'loading' && <Spinner className="size-4" />}
            {requestState.status === 'loading' ? text.requesting() : text.request()}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{text.resourceUrlHint()}</p>
      </div>

      {requestState.status === 'error' ? (
        <div className="mt-4 whitespace-pre-line rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {requestState.message}
        </div>
      ) : null}

      {requestState.status === 'done' ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>{text.response()}</span>
            <Badge variant={requestState.statusCode === 402 ? 'secondary' : 'destructive'}>
              {requestState.statusCode}
            </Badge>
          </div>

          {requestState.paymentRequired ? (
            <DisplayBlock title={text.paymentRequired()} value={requestState.paymentRequired} />
          ) : (
            <p className="text-sm text-amber-700">{text.noHeader()}</p>
          )}

          {requestState.decodedPaymentRequired ? (
            <DisplayBlock
              title={text.decoded()}
              value={formatX402Json(requestState.decodedPaymentRequired)}
            />
          ) : null}

          <DisplayBlock title={text.body()} value={requestState.body || '—'} />
        </div>
      ) : null}

      <div className="mt-5 rounded-md border bg-background p-3">
        <p className="text-xs text-muted-foreground">{text.agentHint()}</p>
        <pre className="mt-3 overflow-x-auto text-xs leading-5">
          <code>{`const result = await agent.x402Fetch(${JSON.stringify(resourceUrl.trim())})`}</code>
        </pre>
      </div>
    </div>
  )
}

function DisplayBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-3 font-mono text-xs leading-5">
        {value}
      </pre>
    </div>
  )
}
