export function createConfirmationProgressGuard() {
  let progressed = false

  return {
    shouldIgnoreError(): boolean {
      return progressed
    },
    markProgressed(): void {
      progressed = true
    },
  }
}
