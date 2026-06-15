import { describe, expect, it } from 'vitest'

import { base58CheckEncode, base58Decode, base58Encode } from './base58'

const hexToBytes = (h: string) => Uint8Array.from(h.match(/.{2}/gu)!.map((x) => parseInt(x, 16)))

describe('base58', () => {
  it('base58check 编码已知 TRON 向量', async () => {
    expect(await base58CheckEncode(hexToBytes('41a614f803b6fd780986a42c78ec9c7f77e6ded13c'))).toBe(
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    )
  })

  it('解码 Nile USDT：25 字节，0x41 前缀，21 字节 payload', () => {
    const dec = base58Decode('TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf')
    expect(dec.length).toBe(25)
    expect(dec[0]).toBe(0x41)
  })

  it('32 字节 base58 编解码可逆', () => {
    const bytes = hexToBytes('00' + 'a1'.repeat(31))
    const back = base58Decode(base58Encode(bytes))
    expect(Buffer.from(back).toString('hex')).toBe(Buffer.from(bytes).toString('hex'))
  })
})
