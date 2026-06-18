import { describe, expect, it } from 'vitest'

import { isAcceptedOrderStatus, isFailedTerminalOrderStatus } from './order-status'

describe('playground order status waiting', () => {
  it('treats reverted as a terminal failure while waiting for confirmed', () => {
    expect(isAcceptedOrderStatus('confirmed', 'reverted')).toBe(false)
    expect(isFailedTerminalOrderStatus('reverted')).toBe(true)
  })
})
