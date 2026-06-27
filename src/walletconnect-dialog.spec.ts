import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('WalletConnectDialog responsive modal classes', () => {
  it('uses a bottom sheet on small screens and a centered modal on larger screens', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('items-end')
    expect(source).toContain('sm:items-center')
    expect(source).toContain('rounded-t-2xl')
    expect(source).toContain('sm:rounded-2xl')
    expect(source).toContain('walletconnect-backdrop-in')
    expect(source).toContain('walletconnect-sheet-in')
  })

  it('keeps the QR page layout stable while the QR code is loading', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('PLACEHOLDER_QR_CODE')
    expect(source).toContain('alt=""')
    expect(source).toContain('backdrop-blur')
    expect(source).toContain("state.status === 'uri_ready' ? state.uri : null")
    expect(source).toContain('pointer-events-none cursor-not-allowed opacity-50')
    expect(source).toContain('aria-disabled={walletHref ? false : true}')
    expect(source).toContain('disabled={!readyUri}')
  })

  it('uses the QR page for direct wallet app links too', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).toContain('walletLinkMode && readyUri')
    expect(source).toContain('? readyUri')
    expect(source).toContain("state.status === 'uri_ready'")
    expect(source).toContain('disabled={!readyUri}')
  })

  it('does not render explanatory hint text in the wallet picker', () => {
    const source = readFileSync(resolve(__dirname, 'walletconnect-dialog.tsx'), 'utf8')

    expect(source).not.toContain('labels.hint()')
  })
})
