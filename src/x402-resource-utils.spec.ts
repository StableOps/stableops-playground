import { describe, expect, it } from 'vitest'

import { decodeX402PaymentRequired, formatX402Json } from './x402-resource-utils'

describe('x402 resource helpers', () => {
  it('解码 base64url 编码的 PAYMENT-REQUIRED 内容', () => {
    const payload = { x402Version: 2, accepts: [{ amount: '1000' }] }
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')

    expect(decodeX402PaymentRequired(encoded)).toEqual(payload)
  })

  it('格式化 JSON 以便在面板中阅读', () => {
    expect(formatX402Json({ amount: '1000' })).toBe('{\n  "amount": "1000"\n}')
    expect(formatX402Json('raw header')).toBe('raw header')
  })

  it('对非法响应头返回空值', () => {
    expect(decodeX402PaymentRequired('not-json')).toBeNull()
  })
})
