import { describe, expect, it } from 'vitest'

import { createConfirmationProgressGuard } from './wallet-confirmation-guard'

describe('createConfirmationProgressGuard', () => {
  it('在订单已推进后忽略异步 confirmation 错误', () => {
    const guard = createConfirmationProgressGuard()

    expect(guard.shouldIgnoreError()).toBe(false)

    guard.markProgressed()

    expect(guard.shouldIgnoreError()).toBe(true)
  })
})
