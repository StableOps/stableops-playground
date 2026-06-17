import type { ChainId } from '@stableops/api-sdk'

import { base58CheckEncode, base58Encode } from './base58'
import { isSolanaChain, isTronChain } from './chains'

// playground 在浏览器为 sandbox 订单确定性派生 burner 收款地址，并按需导入到调用方 org。
// 新建的 org 地址池为空，否则建单会因 allocateForOrder 找不到地址而失败；用 SINGLE 模式 +
// 每个订单独立地址，使 inbound 事件可按地址唯一匹配（避免 SHARED 共享地址金额错配）。
//
// 地址按 (chain, merchantOrderId) 确定性生成、import skipDuplicates → 幂等：同一订单重试不会
// 重复导入。生成的地址无人持有（测试网资金等于销毁），仅供 scanner 按地址唯一匹配入金。

// 由种子（chain:merchantOrderId）确定性生成一个演示 sandbox 地址（0x + 40 hex）。
// 先用 FNV-1a 把整个种子折进哈希（确保订单号等末尾差异也参与），再迭代扩展填满 40 个 hex。
export function demoSandboxAddress(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  let hex = ''
  while (hex.length < 40) {
    h ^= h >>> 13
    h = Math.imul(h, 0x01000193) >>> 0
    hex += (h >>> 0).toString(16).padStart(8, '0')
  }
  return `0x${hex.slice(0, 40)}`
}

// 由种子确定性派生 byteLen 个字节（FNV-1a 折种子，再迭代扩展）。
// 与 demoSandboxAddress 的扩展序列一致：取 20 字节并 hex 化即等于其 0x 地址主体。
function deterministicBytes(seed: string, byteLen: number): Uint8Array {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const out = new Uint8Array(byteLen)
  let idx = 0
  while (idx < byteLen) {
    h ^= h >>> 13
    h = Math.imul(h, 0x01000193) >>> 0
    out[idx++] = (h >>> 24) & 0xff
    if (idx < byteLen) out[idx++] = (h >>> 16) & 0xff
    if (idx < byteLen) out[idx++] = (h >>> 8) & 0xff
    if (idx < byteLen) out[idx++] = h & 0xff
  }
  return out
}

// 按 chain 家族生成 demo 收款地址：EVM 0x、TRON base58check(0x41+20B)、Solana base58(32B)。
// TRON 走 base58check（异步 sha256），故整体异步。
export async function demoSandboxAddressForChain(chain: ChainId, seed: string): Promise<string> {
  if (isTronChain(chain)) {
    const payload = new Uint8Array(21)
    payload[0] = 0x41
    payload.set(deterministicBytes(seed, 20), 1)
    return base58CheckEncode(payload)
  }
  if (isSolanaChain(chain)) {
    return base58Encode(deterministicBytes(seed, 32))
  }
  return demoSandboxAddress(seed)
}

export type ImportSandboxAddressInput = {
  apiKey: string
  baseUrl: string
  merchantOrderId: string
  chains: string[]
  fetchImpl?: typeof fetch
}

// 为本 sandbox 订单导入确定性 burner 收款地址。直连 POST /v1/addresses/import（Bearer API Key），
// SINGLE 模式 + 每单独立地址；import 幂等（skipDuplicates）。失败不在此抛出由调用方处理——
// 已配置地址池的 org 走此 best-effort 后，真正的错误（若有）会在随后的建单处暴露。
export async function importSandboxAddress(input: ImportSandboxAddressInput): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch
  const base = input.baseUrl.replace(/\/+$/u, '')
  for (const chain of Array.from(new Set(input.chains))) {
    const address = await demoSandboxAddressForChain(
      chain as ChainId,
      `${chain}:${input.merchantOrderId}`,
    )
    await fetchImpl(`${base}/v1/addresses/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        addresses: [{ chain, address, label: `playground-${input.merchantOrderId}` }],
        mode: 'single',
      }),
    })
  }
}
