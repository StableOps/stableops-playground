import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('WalletConnectDialog shared UI adapter', () => {
  it('reuses the public wallet-ui dialog instead of copying modal markup', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('@stableops/wallet-ui')
    expect(source).toContain('SharedWalletConnectDialog')
    expect(source).not.toContain('@stableops/wallet-ui/walletconnect-dialog.css')
    expect(source).not.toContain('renderWalletIcon=')
    expect(source).not.toContain('WalletIcon')
    expect(source).not.toContain('PLACEHOLDER_QR_CODE')
  })

  it('relies on wallet-ui typography resets instead of shadow root isolation', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).not.toContain('useShadowRoot')
  })

  it('does not bundle wallet-ui CSS as a runtime dependency', () => {
    const dist = readFileSync(resolve(__dirname, '..', 'dist', 'walletconnect-dialog.js'), 'utf8')

    expect(dist).not.toContain('@stableops/wallet-ui/walletconnect-dialog.css')
  })

  it('reuses wallet-ui logos and default icon rendering', () => {
    const source = readFileSync(resolve(__dirname, 'wallets.tsx'), 'utf8')

    expect(source).toContain("import { WALLET_LOGOS } from '@stableops/wallet-ui'")
    expect(source).not.toContain("from './wallet-logos'")
    expect(source).not.toContain('export function WalletIcon')
  })

  it('使用 wallet-ui 内建文案，通过 locale prop 指定语言', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('locale={locale}')
    expect(source).not.toContain('function toWalletConnectCopy')
    expect(source).not.toContain('labels.payWith')
  })

  it('WalletConnect error code 由 wallet-ui 内建 errorMessage 处理', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')
    const playgroundSource = readFileSync(resolve(__dirname, 'playground.tsx'), 'utf8')

    expect(source).not.toContain('function walletConnectErrorMessage')
    expect(source).not.toContain("case 'walletconnect_connect_failed'")
    expect(playgroundSource).toContain('type WalletConnectDialogError')
    expect(playgroundSource).toContain('function toWalletConnectDialogError')
    expect(playgroundSource).toContain('setWalletConnectError(toWalletConnectDialogError(err))')
  })

  it('keeps playground copy feedback self-contained while using the shared dialog', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('navigator.clipboard.writeText(uri)')
    expect(source).toContain('copied={copied}')
    expect(source).toContain('onCopyUri={(uri) => void onCopyUri(uri)}')
  })

  it('passes only one optional theme color to the shared dialog', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('themeColor?: string')
    expect(source).toContain('themeColor={themeColor}')
    expect(source).not.toContain('themeColorStrong')
  })

  it('does not render explanatory hint text in the wallet picker', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).not.toContain('labels.hint()')
  })

  it('keeps WalletConnect modal open after connect until tx hash is returned', () => {
    const source = readFileSync(resolve(__dirname, 'playground.tsx'), 'utf8')
    const connectStart = source.indexOf('const connectWalletConnect = useCallback')
    const renderStart = source.indexOf('return (', connectStart)
    const connectSource = source.slice(connectStart, renderStart)

    expect(connectSource).not.toContain('setWalletConnectHidden(true)')
    expect(connectSource).toContain('const paid = await payWithWallet(controller.providers, selectedPayChain ?? undefined)')
    expect(connectSource).toContain('if (paid) setWalletConnectOpen(false)')
    expect(source).toContain('onRetryPayment={() => void retryWalletConnectPayment()}')
  })

  it('auto-refreshes failed WalletConnect connection QR codes three times before exposing manual refresh', () => {
    const source = readFileSync(resolve(__dirname, 'playground.tsx'), 'utf8')

    expect(source).toContain('const WALLETCONNECT_CONNECT_REFRESH_LIMIT = 3')
    expect(source).toContain('function isWalletConnectConnectFailed')
    expect(source).toContain('refreshCount < WALLETCONNECT_CONNECT_REFRESH_LIMIT')
    expect(source).toContain('await controller.disconnect().catch(() => undefined)')
    expect(source).toContain('setWalletConnectRefreshAvailable(true)')
    expect(source).toContain('connectionRefreshAvailable={walletConnectRefreshAvailable}')
    expect(source).toContain('onRefreshConnection={() => {')
  })
})
