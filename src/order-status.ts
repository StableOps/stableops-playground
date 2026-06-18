const detectedStatuses = new Set(['detected', 'confirmed', 'finalized'])
const confirmedStatuses = new Set(['confirmed', 'finalized'])
const finalizedStatuses = new Set(['finalized'])
const failedTerminalStatuses = new Set(['reverted', 'expired', 'canceled'])

export type WaitTarget = 'detected' | 'confirmed' | 'finalized'

export function isAcceptedOrderStatus(target: WaitTarget, status: string): boolean {
  const accepted =
    target === 'detected'
      ? detectedStatuses
      : target === 'confirmed'
        ? confirmedStatuses
        : finalizedStatuses

  return accepted.has(status)
}

export function isFailedTerminalOrderStatus(status: string): boolean {
  return failedTerminalStatuses.has(status)
}
