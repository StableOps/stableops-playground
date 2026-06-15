// 自包含 base58 / base58check —— 浏览器安全：校验和走 Web Crypto（globalThis.crypto.subtle），
// 不依赖 node:crypto，因此可在浏览器里为 sandbox 订单确定性派生收款地址。
// 算法已对已知向量验证（见 base58.spec.ts）。
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits: number[] = []
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let out = '1'.repeat(zeros)
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]]
  return out
}

export function base58Decode(str: string): Uint8Array {
  let zeros = 0
  while (zeros < str.length && str[zeros] === '1') zeros++
  const bytes: number[] = []
  for (let i = zeros; i < str.length; i++) {
    let carry = ALPHABET.indexOf(str[i])
    if (carry < 0) throw new Error(`invalid base58 char: ${str[i]}`)
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  const out = new Uint8Array(zeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) out[zeros + bytes.length - 1 - i] = bytes[i]
  return out
}

// SHA-256：浏览器与 Node 18+ 均提供 globalThis.crypto.subtle.digest。
// 复制一份独占 ArrayBuffer 的视图，满足 BufferSource 类型（规避 Uint8Array<ArrayBufferLike> 的
// SharedArrayBuffer 联合在 TS 5.7+ 下不可赋值给 BufferSource 的问题）。
async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const input = new Uint8Array(bytes)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
  return new Uint8Array(digest)
}

// base58check：payload 末尾追加「双 SHA-256 前 4 字节」校验和后再 base58 编码。
// sha256 为异步，故本函数异步（TRON 地址生成走此路径）。
export async function base58CheckEncode(payload: Uint8Array): Promise<string> {
  const h1 = await sha256(payload)
  const h2 = await sha256(h1)
  const full = new Uint8Array(payload.length + 4)
  full.set(payload, 0)
  full.set(h2.subarray(0, 4), payload.length)
  return base58Encode(full)
}
