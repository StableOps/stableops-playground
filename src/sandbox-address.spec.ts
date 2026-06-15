import { describe, expect, it } from 'vitest'

import { base58Decode } from './base58'
import { demoSandboxAddress, demoSandboxAddressForChain } from './sandbox-address'

describe('demoSandboxAddress', () => {
  it('生成合法的 0x + 40 hex 地址', () => {
    expect(demoSandboxAddress('base-sepolia:demo_1')).toMatch(/^0x[0-9a-f]{40}$/)
  })

  it('同种子确定性（import 幂等）', () => {
    expect(demoSandboxAddress('base-sepolia:demo_1')).toBe(demoSandboxAddress('base-sepolia:demo_1'))
  })

  it('不同订单生成不同地址（每单独立地址，避免共享错配）', () => {
    const a = demoSandboxAddress('base-sepolia:demo_1')
    const b = demoSandboxAddress('base-sepolia:demo_2')
    const c = demoSandboxAddress('base-sepolia:demo_3')
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe('demoSandboxAddressForChain', () => {
  it('EVM 链与 demoSandboxAddress 一致（0x+40hex）', async () => {
    const seed = 'base-sepolia:demo_x'
    expect(await demoSandboxAddressForChain('base-sepolia', seed)).toBe(demoSandboxAddress(seed))
    expect(await demoSandboxAddressForChain('ethereum-sepolia', 'ethereum-sepolia:demo_x')).toMatch(
      /^0x[0-9a-f]{40}$/u,
    )
  })

  it('TRON Nile 生成合法 T 地址（base58check 解码 25 字节、0x41 前缀）', async () => {
    const addr = await demoSandboxAddressForChain('tron-nile', 'tron-nile:demo_x')
    expect(addr.startsWith('T')).toBe(true)
    const dec = base58Decode(addr)
    expect(dec.length).toBe(25)
    expect(dec[0]).toBe(0x41)
  })

  it('Solana devnet 生成 32 字节 base58 pubkey', async () => {
    const addr = await demoSandboxAddressForChain('solana-devnet', 'solana-devnet:demo_x')
    expect(base58Decode(addr).length).toBe(32)
  })

  it('同种子确定（幂等）', async () => {
    expect(await demoSandboxAddressForChain('tron-nile', 's')).toBe(
      await demoSandboxAddressForChain('tron-nile', 's'),
    )
  })
})
