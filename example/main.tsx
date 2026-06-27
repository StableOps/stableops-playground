/// <reference types="vite/client" />
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Playground, Checkout } from '../src'
import './styles.css'
import '@stableops/wallet-ui/walletconnect-dialog.css'

// 独立运行入口（dev harness）：默认指向本地 API（先跑 `pnpm --filter @stableops/api dev`），
// 可用环境变量 VITE_STABLEOPS_API_URL 覆盖。打开页面后在组件里粘贴 sandbox API key 即可。
const baseUrl = import.meta.env.VITE_STABLEOPS_API_URL ?? 'https://api.stableops.dev'
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
const checkoutUrl = import.meta.env.VITE_CHECKOUT_URL ?? 'https://pay.stableops.dev'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found')

type Tab = 'playground' | 'checkout'

function App() {
  // 切换 Playground 语言（en / zh）
  const [locale, setLocale] = useState<'en' | 'zh'>('en')
  const [tab, setTab] = useState<Tab>('playground')

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">StableOps Playground</h1>
          <p className="text-sm text-muted-foreground">
            Standalone dev harness — paste a sandbox API key and run the full payment flow against{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{baseUrl}</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLocale((prev) => (prev === 'en' ? 'zh' : 'en'))}
          className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
          {locale === 'en' ? '中文' : 'English'}
        </button>
      </header>

      <nav className="mb-6 flex gap-1 rounded-lg border bg-muted/30 p-1">
        <button
          type="button"
          onClick={() => setTab('playground')}
          className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'playground'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          {locale === 'zh' ? '支付 Playground' : 'Payment Playground'}
        </button>
        <button
          type="button"
          onClick={() => setTab('checkout')}
          className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'checkout'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          {locale === 'zh' ? '收银台 Demo' : 'Checkout Demo'}
        </button>
      </nav>

      {tab === 'playground' ? (
        <Playground
          baseUrl={baseUrl}
          locale={locale}
          walletConnectProjectId={walletConnectProjectId}
        />
      ) : (
        <Checkout
          baseUrl={baseUrl}
          locale={locale}
          checkoutUrl={checkoutUrl}
          walletConnectProjectId={walletConnectProjectId}
        />
      )}
    </main>
  )
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
