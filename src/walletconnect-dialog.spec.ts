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

  it('adapts typesafe-i18n labels to the public copy contract', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('function toWalletConnectCopy')
    expect(source).toContain('labels.payWith({ wallet })')
    expect(source).toContain('labels.scanWithWallet({ wallet })')
    expect(source).toContain('labels.openWallet({ wallet })')
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
})
