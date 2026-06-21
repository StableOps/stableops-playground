'use client'

import { StableOps, StableOpsError } from '@stableops/api-sdk'
import type { PaymentOrder, PaymentOrderInstruction } from '@stableops/api-sdk'
import { PlaygroundTestnets, type PlaygroundTestnet } from './testnets'
import {
  isAcceptedOrderStatus,
  isFailedTerminalOrderStatus,
  type WaitTarget,
} from './order-status'
import {
  getInjectedWalletProviders,
  selectWalletPaymentInstruction,
  sendWalletPayment,
  setWalletSdkDebug,
  type WalletPaymentInstruction,
} from '@stableops/wallet-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge, Button, cn, Input, Label, MultiSelect } from './ui'
import { importSandboxAddress } from './sandbox-address'

// 独立、可嵌入的 StableOps playground：在浏览器里走一遍「建单 → 钱包链上支付 → 确认 → 终局」。
// 直接用 @stableops/api-sdk + 调用方提供的 API Key 调真实 API（建单 / 查单 / 地址导入），
// 第 2 步用 @stableops/wallet-sdk 让浏览器钱包发真实测试网交易；后续状态由 scanner /
// confirmations watcher 自动推进，按钮只负责轮询。
//
// 注意：API Key 的环境由 key 本身决定（API 端按 key 解析 org/env），请使用 sandbox key。

export type PlaygroundProps = {
  // 默认 API Key；同时界面提供输入框，用户可粘贴 / 覆盖自己的 sandbox key。
  apiKey?: string
  // StableOps API base，浏览器需可达。默认公网 API。
  baseUrl?: string
  locale?: 'en' | 'zh'
  className?: string
}

// 是否自动导入 sandbox 地址改为内部开关（UI 控制），不再作为对外 prop——
// 嵌入方常常不知道该不该开；放在 UI 里让用户当面选，且关闭时给出失败兜底提示。

type DemoChain = string

type Step = {
  label: string
  status: 'idle' | 'pending' | 'done' | 'error'
  detail?: string
  // 可选的跳转链接（如第 2 步支付成功后的区块浏览器交易页）。
  link?: { href: string; label: string }
}

const POLL_INTERVAL_MS = 5_000
const DEFAULT_BASE_URL = 'https://api.stableops.dev'

type Locale = 'en' | 'zh'

// 组件内自包含的 i18n 字典，不依赖任何 provider（playground 常嵌在 MDX 等无 i18n 上下文处）。
const messages = {
  en: {
    steps: {
      create: '1. Create payment order',
      pay: '2. Pay with wallet on-chain',
      waitDetected: '3. Wait detected',
      waitConfirmed: '4. Wait confirmed',
      waitFinalized: '5. Wait finalized',
    },
    actions: {
      creating: 'Creating…',
      createOrder: '1. Create order',
      paying: 'Open wallet…',
      pay: '2. Pay with wallet',
      confirmManual: "2. I've sent it manually",
      polling: 'Polling…',
      waitDetected: '3. Wait detected',
      waitConfirmed: '4. Wait confirmed',
      waitFinalized: '5. Wait finalized',
      reset: 'Reset',
    },
    manual: {
      heading: 'Or transfer manually',
      sendTo: 'Send {amount} {asset} on {chain} to:',
      copy: 'Copy',
      copied: 'Copied',
      hint: 'Send from any wallet or exchange, then click "I\'ve sent it manually" — the scanner detects the inbound transfer the same way.',
      done: 'manual transfer confirmed',
    },
    apiKey: {
      label: 'API Key',
      placeholder: 'Paste your sandbox API key (sk_sandbox_…)',
      hint: 'Use a sandbox key. It stays in your browser and is sent directly to the API.',
    },
    autoImport: {
      label: 'Auto-import sandbox receiving address',
      hint: 'When on, a deterministic burner sandbox address is imported for this order before creating it — useful when your org has no addresses yet. Turn it off if you want to use only the addresses you manage yourself.',
    },
    noAddress: {
      // 关掉 auto-import 时给的固定提示（出现在开关下方）。
      banner:
        'Auto-import is off. Make sure your sandbox org has at least one receiving address — manage them in',
      dashboardLink: 'Dashboard → Addresses',
      // 建单失败 + auto-import 关 时追加到日志里的兜底提示。
      hint: 'tip: if this failed because your org has no receiving address, enable Auto-import above or create one in Dashboard → Addresses.',
    },
    dropped: {
      nonEvmOnly:
        'TRON and Solana are only available on paid plans. Please select EVM chains.',
      nonEvmMix:
        'The following chains are only available on paid plans. Please deselect: {chains}',
      fallback:
        'Enable Auto-import or configure receiving addresses in the Dashboard.',
    },
    status: {
      missingKey: 'enter an API key first',
      polling: 'polling {target}… (up to {seconds}s)',
      orderStatus: 'order={status}',
      timeout: 'timeout waiting for {target}; scanner may still be catching up',
      walletProviderNotFound: 'wallet provider not found',
      waitingWallet: 'waiting for wallet confirmation…',
      txHash: 'tx {hash}',
      viewTx: 'View on block explorer ↗',
      terminalStatus: 'order reached {status} before {target}',
    },
    log: {
      missingKey: 'create failed: API key is required',
      createFailed: 'create failed: {error}',
      orderCreated: 'order {id} created ({status})',
      refreshFailed: 'refresh failed: {error}',
      orderStatus: 'order status: {status}',
      walletSent: 'wallet payment sent: {hash}',
      walletFailed: 'wallet payment failed: {message}',
      providerNotFound: 'wallet provider not found for {chain}',
      waitTimedOut: 'wait {target} timed out; try again later',
      waitTerminalStatus: 'wait {target} stopped: order status is {status}',
      manualConfirmed:
        'manual transfer confirmed; polling for on-chain detection',
    },
    footer:
      'This playground calls <code>@stableops/api-sdk</code> directly from your browser with the API key you provide. Step 2 calls <code>@stableops/wallet-sdk</code> to ask the browser wallet to send a real testnet transaction — or you can skip the wallet, transfer to the shown address from any wallet/exchange, and click "I\'ve sent it manually". Orders advance to detected / confirmed / finalized via the scanner and confirmations watcher. In sandbox (testnet), if your org has no receiving address yet, one is auto-created for this order. Use a sandbox key only — never paste a live key into a browser. <a href="https://gitlab.com/StableOps/stableops-playground" target="_blank" rel="noreferrer" class="underline underline-offset-2">View source on GitLab</a>.',
  },
  zh: {
    steps: {
      create: '1. 创建支付单',
      pay: '2. 用钱包发起链上支付',
      waitDetected: '3. 等待 detected',
      waitConfirmed: '4. 等待 confirmed',
      waitFinalized: '5. 等待 finalized',
    },
    actions: {
      creating: '创建中…',
      createOrder: '1. 创建支付单',
      paying: '打开钱包…',
      pay: '2. 用钱包支付',
      confirmManual: '2. 我已手动转账',
      polling: '轮询中…',
      waitDetected: '3. 等待 detected',
      waitConfirmed: '4. 等待 confirmed',
      waitFinalized: '5. 等待 finalized',
      reset: '重置',
    },
    manual: {
      heading: '或手动转账',
      sendTo: '在 {chain} 上向以下地址转账 {amount} {asset}：',
      copy: '复制',
      copied: '已复制',
      hint: '从任意钱包或交易所转账后，点击「我已手动转账」，scanner 会以同样方式检测到这笔入金。',
      done: '已确认手动转账',
    },
    apiKey: {
      label: 'API Key',
      placeholder: '粘贴你的 sandbox API key（sk_sandbox_…）',
      hint: '请使用 sandbox key；它只保存在你的浏览器并直接发送给 API。',
    },
    autoImport: {
      label: '自动导入 sandbox 收款地址',
      hint: '开启时会在建单前为本订单导入一个确定性 burner 地址，适合 org 还没有任何收款地址的场景。如果你只想使用自己管理的地址，请关闭。',
    },
    noAddress: {
      banner: '已关闭自动导入。请确保你的 sandbox org 至少有一个收款地址——可在',
      dashboardLink: 'Dashboard → 收款地址',
      hint: '提示：如果建单失败是因为 org 没有收款地址，请打开上方的「自动导入」，或前往 Dashboard → 收款地址 新建。',
    },
    dropped: {
      nonEvmOnly: 'TRON 和 Solana 只有付费套餐才可用，请选择 EVM 链。',
      nonEvmMix: '以下链仅付费套餐可用，请取消选择：{chains}',
      fallback: '请开启「自动导入」或前往控制台配置收款地址。',
    },
    status: {
      missingKey: '请先填写 API key',
      polling: '正在轮询 {target}…（最多 {seconds}s）',
      orderStatus: 'order={status}',
      timeout: '等待 {target} 超时；scanner 可能仍在追赶中',
      walletProviderNotFound: '未找到钱包 provider',
      waitingWallet: '等待钱包确认…',
      txHash: 'tx {hash}',
      viewTx: '在区块浏览器查看 ↗',
      terminalStatus: '订单在到达 {target} 前已进入 {status}',
    },
    log: {
      missingKey: 'create failed: 需要先填写 API key',
      createFailed: 'create failed: {error}',
      orderCreated: 'order {id} created ({status})',
      refreshFailed: 'refresh failed: {error}',
      orderStatus: 'order status: {status}',
      walletSent: 'wallet payment sent: {hash}',
      walletFailed: 'wallet payment failed: {message}',
      providerNotFound: 'wallet provider not found for {chain}',
      waitTimedOut: 'wait {target} timed out; try again later',
      waitTerminalStatus: 'wait {target} stopped: order status is {status}',
      manualConfirmed: '已确认手动转账；开始等待链上检测',
    },
    footer:
      '本 playground 直接在浏览器里用你提供的 API Key 调 <code>@stableops/api-sdk</code>；第 2 步调用 <code>@stableops/wallet-sdk</code> 让浏览器钱包发送真实测试网交易；也可以不走钱包，从任意钱包/交易所向显示的地址转账后点击「我已手动转账」。订单进入 detected / confirmed / finalized 依赖 scanner 与 confirmations watcher。在 sandbox 下，若你的 org 还没有收款地址，会自动为本订单创建一个随机地址。请仅使用 sandbox key，切勿在浏览器中粘贴生产 key。<a href="https://gitlab.com/StableOps/stableops-playground" target="_blank" rel="noreferrer" class="underline underline-offset-2">在 GitLab 查看源码</a>。',
  },
} satisfies Record<Locale, Record<string, unknown>>

function tpl(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export function Playground({
  apiKey: apiKeyProp,
  baseUrl = DEFAULT_BASE_URL,
  locale: localeProp = 'en',
  className,
}: PlaygroundProps) {
  const locale: Locale = localeProp === 'zh' ? 'zh' : 'en'
  const msg = messages[locale]

  const [apiKey, setApiKey] = useState(apiKeyProp ?? '')
  const trimmedKey = apiKey.trim()

  // 单一 API 客户端：随 key / 端点变化重建；无 key 时为 null，动作禁用。
  const client = useMemo(
    () =>
      trimmedKey
        ? new StableOps({
            apiKey: trimmedKey,
            baseUrl,
          })
        : null,
    [trimmedKey, baseUrl],
  )

  // 下拉框直接用包内的测试网目录（自包含），不依赖任何 playground 专用端点。
  const chainOptions = PlaygroundTestnets

  const initialSteps: Step[] = useMemo(
    () => [
      { label: msg.steps.create, status: 'idle' as const },
      { label: msg.steps.pay, status: 'idle' as const },
      { label: msg.steps.waitDetected, status: 'idle' as const },
      { label: msg.steps.waitConfirmed, status: 'idle' as const },
      { label: msg.steps.waitFinalized, status: 'idle' as const },
    ],
    [msg],
  )

  const [amount, setAmount] = useState('0.01')
  // 多选链：建单时每个选中链生成一条 acceptedAssets / 一个收款地址，订单返回多条
  // paymentInstructions，用户用任意一条链支付即可。
  const [chains, setChains] = useState<DemoChain[]>(['base-sepolia:USDC'])
  // 自动导入 sandbox 收款地址：默认开启；关闭时改用 org 已有地址，并在 UI / 失败日志里提示如何补救。
  const [autoImportAddress, setAutoImportAddress] = useState(true)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [steps, setSteps] = useState<Step[]>(initialSteps)
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState<null | string>(null)

  // 选中的测试网（按选择顺序）；为空时回落到目录首项，避免 Math.max(...[]) / 取 asset 出错。
  const selectedOptions: PlaygroundTestnet[] = useMemo(() => {
    const picked = chains
      .map((composite) => {
        const [chain, asset] = composite.split(':')
        return chainOptions.find(
          (option) => option.chain === chain && option.asset === asset,
        )
      })
      .filter((option): option is PlaygroundTestnet => Boolean(option))
    return picked.length > 0 ? picked : [chainOptions[0]]
  }, [chains, chainOptions])
  // 第一条选中链作为「主」链：决定 settlementAsset 与文案展示。
  const primaryOption = selectedOptions[0]
  // 选中链可能混用资产（多数 USDC，TRON 为 USDT），金额标签去重展示。
  const assetLabel = useMemo(
    () => Array.from(new Set(selectedOptions.map((o) => o.asset))).join(' / '),
    [selectedOptions],
  )

  const append = useCallback((line: string) => {
    setLog((prev) => [
      ...prev,
      `${new Date().toISOString().slice(11, 19)}  ${line}`,
    ])
  }, [])

  // playground 默认开启 wallet-sdk 调试日志：挂载即打开，钱包支付全过程在控制台输出 [wallet-sdk] …，
  // 便于排查支付失败。这是个面向开发者的演练场，默认开 debug 比藏开关更有用。
  useEffect(() => {
    setWalletSdkDebug(true)
  }, [])

  const updateStep = useCallback((index: number, patch: Partial<Step>) => {
    setSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    )
  }, [])

  const reset = useCallback(() => {
    setOrder(null)
    setSteps(initialSteps)
    setLog([])
    setBusy(null)
  }, [initialSteps])

  const refreshOrder = useCallback(
    async (id: string) => {
      if (!client) return null
      try {
        const fresh = await client.paymentOrders.retrieve(id)
        setOrder(fresh)
        return fresh
      } catch (err) {
        append(tpl(msg.log.refreshFailed, { error: errMessage(err) }))
        return null
      }
    },
    [client, append, msg],
  )

  const waitForOrderStatus = useCallback(
    async (target: WaitTarget, index: number): Promise<boolean> => {
      if (!order) return false
      // 超时按所选链 + 目标推导，而非固定值：detected 近实时给小预算；慢链(如 ethereum-sepolia
      // finalize)给到分钟级；快链(arbitrum / solana)不必空等。多选时取所有选中链的最大预算，
      // 因为事先不知道用户实际会用哪条链支付。
      const timeoutMs =
        target === 'detected'
          ? Math.max(...selectedOptions.map((o) => o.detectTimeoutMs))
          : target === 'confirmed'
            ? Math.max(...selectedOptions.map((o) => o.confirmTimeoutMs))
            : Math.max(...selectedOptions.map((o) => o.finalizeTimeoutMs))
      setBusy(target)
      updateStep(index, {
        status: 'pending',
        detail: tpl(msg.status.polling, {
          target,
          seconds: String(Math.round(timeoutMs / 1000)),
        }),
      })
      const deadline = Date.now() + timeoutMs
      try {
        while (Date.now() <= deadline) {
          const fresh = await refreshOrder(order.id)
          const status = fresh?.status ?? 'unknown'
          append(tpl(msg.log.orderStatus, { status }))
          if (isAcceptedOrderStatus(target, status)) {
            updateStep(index, {
              status: 'done',
              detail: tpl(msg.status.orderStatus, { status }),
            })
            return true
          }
          if (isFailedTerminalOrderStatus(status)) {
            updateStep(index, {
              status: 'error',
              detail: tpl(msg.status.terminalStatus, { target, status }),
            })
            append(tpl(msg.log.waitTerminalStatus, { target, status }))
            return false
          }
          await sleep(POLL_INTERVAL_MS)
        }
        updateStep(index, {
          status: 'error',
          detail: tpl(msg.status.timeout, { target }),
        })
        append(tpl(msg.log.waitTimedOut, { target }))
        return false
      } finally {
        setBusy(null)
      }
    },
    [append, order, refreshOrder, updateStep, selectedOptions, msg],
  )

  // 第 2 步完成后（钱包支付成功 / 手动确认）自动接力：detected → confirmed → finalized。
  // 逐级仅在前一步成功后继续——某步超时(如确认数还没攒够)则停下，用户可用对应按钮手动重试。
  const continueToFinal = useCallback(async () => {
    const detected = await waitForOrderStatus('detected', 2)
    if (!detected) return
    const confirmed = await waitForOrderStatus('confirmed', 3)
    if (confirmed) await waitForOrderStatus('finalized', 4)
  }, [waitForOrderStatus])

  const createOrder = useCallback(async () => {
    if (!client) {
      updateStep(0, { status: 'error', detail: msg.status.missingKey })
      append(msg.log.missingKey)
      return
    }
    setBusy('create')
    updateStep(0, { status: 'pending' })
    const merchantOrderId = `playground_${Date.now().toString(36)}`
    try {
      // 新建 org 地址池为空，先为本订单的每条选中链导入独立 sandbox 地址（best-effort；
      // 已配置地址池的 org 无副作用）。
      if (autoImportAddress) {
        try {
          await importSandboxAddress({
            apiKey: trimmedKey,
            baseUrl,
            merchantOrderId,
            chains: selectedOptions.map((o) => String(o.chain)),
          })
        } catch {
          /* 地址自举失败不阻断；真正的错误会在建单处暴露 */
        }
      }
      const created = await client.paymentOrders.create(
        {
          merchantOrderId,
          amount,
          acceptedAssets: selectedOptions.map((o) => ({
            chain: o.chain,
            asset: o.asset,
          })),
          // 30 分钟后未支付自动过期，order-expiration worker 推进到 expired 并释放地址。
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        { idempotencyKey: merchantOrderId },
      )
      // 先检测被静默丢弃的链（无可用收款地址），失败则不 setOrder 阻断后续。
      const allocatedChains = new Set(
        created.paymentInstructions.map((pi) => pi.chain),
      )
      const dropped = selectedOptions.filter(
        (opt) => !allocatedChains.has(opt.chain),
      )
      if (dropped.length > 0) {
        const nonEvm = dropped.filter((opt) => opt.family !== 'evm')
        const hasEvmAllocated = selectedOptions.some(
          (opt) => opt.family === 'evm' && allocatedChains.has(opt.chain),
        )
        if (nonEvm.length === dropped.length && !hasEvmAllocated) {
          updateStep(0, { status: 'error', detail: msg.dropped.nonEvmOnly })
          append(msg.dropped.nonEvmOnly)
        } else if (nonEvm.length > 0 && hasEvmAllocated) {
          const sep = locale === 'zh' ? '、' : ', '
          const detail = tpl(msg.dropped.nonEvmMix, {
            chains: nonEvm.map((o) => o.label).join(sep),
          })
          updateStep(0, { status: 'error', detail })
          append(detail)
        } else {
          updateStep(0, { status: 'error', detail: msg.dropped.fallback })
          append(msg.dropped.fallback)
        }
        return
      }
      setOrder(created)
      const instructionCount = created.paymentInstructions.length
      const primary = created.paymentInstructions[0]
      updateStep(0, {
        status: 'done',
        detail: `${created.id}  →  ${primary?.address ?? '(no address)'}${
          instructionCount > 1 ? ` (+${instructionCount - 1})` : ''
        }`,
      })
      append(
        tpl(msg.log.orderCreated, { id: created.id, status: created.status }),
      )
    } catch (err) {
      const message = errMessage(err)
      // API 建单失败可能是免费套餐无可用地址，映射为友好提示。
      if (/no available address/i.test(message)) {
        const nonEvm = selectedOptions.filter((o) => o.family !== 'evm')
        const hasEvm = selectedOptions.some((o) => o.family === 'evm')
        if (nonEvm.length === selectedOptions.length) {
          append(msg.dropped.nonEvmOnly)
          updateStep(0, { status: 'error', detail: msg.dropped.nonEvmOnly })
        } else if (nonEvm.length > 0 && hasEvm) {
          const sep = locale === 'zh' ? '、' : ', '
          const detail = tpl(msg.dropped.nonEvmMix, {
            chains: nonEvm.map((o) => o.label).join(sep),
          })
          append(detail)
          updateStep(0, { status: 'error', detail })
        } else {
          append(msg.dropped.fallback)
          updateStep(0, { status: 'error', detail: msg.dropped.fallback })
        }
      } else {
        updateStep(0, { status: 'error', detail: message })
        append(tpl(msg.log.createFailed, { error: message }))
        if (!autoImportAddress) append(msg.noAddress.hint)
      }
    } finally {
      setBusy(null)
    }
  }, [
    client,
    trimmedKey,
    baseUrl,
    autoImportAddress,
    amount,
    selectedOptions,
    primaryOption,
    updateStep,
    append,
    msg,
  ])

  const payWithWallet = useCallback(async () => {
    if (!order) return
    let selected: ReturnType<typeof selectWalletPaymentInstruction>
    try {
      selected = selectWalletPaymentInstruction(
        order.paymentInstructions.map(toWalletInstruction),
        getInjectedWalletProviders(),
      )
    } catch {
      updateStep(1, {
        status: 'error',
        detail: msg.status.walletProviderNotFound,
      })
      append(
        tpl(msg.log.providerNotFound, {
          chain: order.paymentInstructions
            .map((instruction) => instruction.chain)
            .join(', '),
        }),
      )
      return
    }

    setBusy('pay')
    updateStep(1, { status: 'pending', detail: msg.status.waitingWallet })
    try {
      const sent = await sendWalletPayment({
        provider: selected.provider,
        amount: order.amount,
        instruction: selected.instruction,
        solanaRpcUrl:
          selected.instruction.chain === 'solana-devnet'
            ? 'https://api.devnet.solana.com'
            : undefined,
      })
      // 用所支付链的区块浏览器拼出交易详情页链接，方便用户点开核对这笔链上转账。
      const txUrl = explorerTxUrl(selected.instruction.chain, sent.txHash)
      updateStep(1, {
        status: 'done',
        detail: tpl(msg.status.txHash, { hash: sent.txHash }),
        link: txUrl ? { href: txUrl, label: msg.status.viewTx } : undefined,
      })
      append(tpl(msg.log.walletSent, { hash: sent.txHash }))
      await refreshOrder(order.id)
      // 支付成功后自动接力到 confirmed / finalized，无需再手动点按钮。
      await continueToFinal()
    } catch (err) {
      const message = formatWalletError(err)
      updateStep(1, { status: 'error', detail: message })
      append(tpl(msg.log.walletFailed, { message }))
    } finally {
      setBusy(null)
    }
  }, [append, order, refreshOrder, updateStep, continueToFinal, msg])

  // 手动转账路径：用户用任意钱包/交易所往收款地址转完账后点此确认。不发链上交易——
  // 只把第 2 步标记为 done 解锁后续轮询，真正的入金仍由 scanner 按地址唯一匹配检测。
  const markManualTransfer = useCallback(async () => {
    if (!order) return
    updateStep(1, { status: 'done', detail: msg.manual.done })
    append(msg.log.manualConfirmed)
    await refreshOrder(order.id)
    // 与钱包支付一致：确认后自动接力到 confirmed / finalized。
    await continueToFinal()
  }, [append, order, refreshOrder, updateStep, continueToFinal, msg])

  return (
    <div className={cn('not-prose my-6 space-y-5', className)}>
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
        <div className="space-y-2">
          <Label htmlFor="playground-api-key" className="text-sm font-medium">
            {msg.apiKey.label}
          </Label>
          <Input
            id="playground-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full bg-background font-mono"
            placeholder={msg.apiKey.placeholder}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{msg.apiKey.hint}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)] sm:items-start">
          <div className="space-y-2">
            <Label htmlFor="playground-amount" className="text-sm font-medium">
              Amount ({assetLabel})
            </Label>
            <Input
              id="playground-amount"
              className="h-10 w-full bg-background"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={Boolean(order)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="playground-chain" className="text-sm font-medium">
              {locale === 'zh' ? '链（可多选）' : 'Chains (multi-select)'}
            </Label>
            <MultiSelect
              id="playground-chain"
              options={chainOptions.map((option) => ({
                value: `${option.chain}:${option.asset}`,
                label: option.label,
              }))}
              value={chains}
              onChange={(next) => setChains(next as DemoChain[])}
              placeholder={
                locale === 'zh' ? '选择一条或多条链…' : 'Select chains…'
              }
              disabled={Boolean(order)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              checked={autoImportAddress}
              onChange={(e) => setAutoImportAddress(e.target.checked)}
              disabled={Boolean(order) || busy !== null}
            />
            <span className="font-medium">{msg.autoImport.label}</span>
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            {msg.autoImport.hint}
          </p>
          {!autoImportAddress ? (
            <p className="pl-6 text-xs text-muted-foreground">
              {msg.noAddress.banner}{' '}
              <a
                href={dashboardAddressesUrl(baseUrl, locale)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {msg.noAddress.dashboardLink}
              </a>
              .
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {locale === 'zh'
            ? '真实钱包交易，使用所选测试网；不要用主网资金。领测试币：'
            : 'Real wallet transaction on the selected testnet(s) — do not use mainnet funds. Get test funds: '}
          {selectedOptions.map((option, i) => (
            <span key={`${option.chain}:${option.asset}`}>
              {i > 0 ? ' · ' : ''}
              <a
                href={option.faucetUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {option.label}
              </a>
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={createOrder}
            disabled={
              Boolean(order) ||
              busy !== null ||
              !trimmedKey ||
              chains.length === 0
            }
          >
            {busy === 'create' ? msg.actions.creating : msg.actions.createOrder}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={payWithWallet}
            disabled={!order || busy !== null || steps[1].status === 'done'}
          >
            {busy === 'pay' ? msg.actions.paying : msg.actions.pay}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={markManualTransfer}
            disabled={!order || busy !== null || steps[1].status === 'done'}
          >
            {msg.actions.confirmManual}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('detected', 2)}
            disabled={
              !order ||
              busy !== null ||
              steps[1].status !== 'done' ||
              steps[2].status === 'done'
            }
          >
            {busy === 'detected'
              ? msg.actions.polling
              : msg.actions.waitDetected}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('confirmed', 3)}
            disabled={
              !order ||
              busy !== null ||
              steps[2].status !== 'done' ||
              steps[3].status === 'done'
            }
          >
            {busy === 'confirmed'
              ? msg.actions.polling
              : msg.actions.waitConfirmed}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('finalized', 4)}
            disabled={
              !order ||
              busy !== null ||
              steps[3].status !== 'done' ||
              steps[4].status === 'done'
            }
          >
            {busy === 'finalized'
              ? msg.actions.polling
              : msg.actions.waitFinalized}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            disabled={busy !== null}
          >
            {msg.actions.reset}
          </Button>
        </div>
      </div>

      {order && steps[1].status !== 'done' ? (
        <div className="space-y-3 rounded-lg border bg-background/50 p-4">
          <div className="text-sm font-medium">{msg.manual.heading}</div>
          {order.paymentInstructions.map((instruction) => (
            <div
              key={`${instruction.chain}:${instruction.address}`}
              className="space-y-1.5"
            >
              <div className="text-xs text-muted-foreground">
                {tpl(msg.manual.sendTo, {
                  amount: order.amount,
                  asset: instruction.asset,
                  chain: chainLabel(chainOptions, instruction.chain),
                })}
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                  {instruction.address}
                </code>
                <CopyButton
                  value={instruction.address}
                  copyLabel={msg.manual.copy}
                  copiedLabel={msg.manual.copied}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{msg.manual.hint}</p>
        </div>
      ) : null}

      <ol className="space-y-2.5">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-start gap-3 rounded-lg border bg-background/50 p-3.5 text-sm"
          >
            <StatusBadge status={step.status} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{step.label}</div>
              {step.detail ? (
                <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {step.detail}
                  {step.link ? (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-block text-xs underline underline-offset-2"
                    >
                      {step.link.label}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {order ? (
        <div className="rounded-lg border bg-background/50 p-3.5 text-xs">
          <div className="mb-2 font-medium">Latest order snapshot</div>
          <pre className="overflow-x-auto font-mono leading-relaxed">
            {JSON.stringify(order, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="rounded-lg border bg-background/50 p-3.5">
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          Activity log
        </div>
        <pre className="max-h-40 overflow-y-auto font-mono text-xs leading-relaxed">
          {log.length === 0 ? '(empty)' : log.join('\n')}
        </pre>
      </div>

      <p
        className="text-sm text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: msg.footer }}
      />
    </div>
  )
}

// 收款地址旁的复制按钮：写入剪贴板后短暂显示「已复制」再回落。
function CopyButton({
  value,
  copyLabel,
  copiedLabel,
}: {
  value: string
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用（非安全上下文等）时静默：地址本身仍可手动选中复制 */
    }
  }, [value])
  return (
    <Button size="sm" variant="outline" onClick={onCopy} className="shrink-0">
      {copied ? copiedLabel : copyLabel}
    </Button>
  )
}

// 用测试网目录把链 id 渲染成可读标签，找不到则回落到链 id 本身。
function chainLabel(
  options: readonly PlaygroundTestnet[],
  chain: string,
): string {
  return options.find((option) => option.chain === chain)?.label ?? chain
}

// 用测试网目录里的 explorerUrl 基址，按链家族拼出交易详情页链接（各家族路径不同）。
// 思路同 apps/checkout 的 explorerTxUrl；但 playground 自包含、不依赖私有包 @stableops/shared，
// 因此直接复用 testnets.ts 里已声明的 explorerUrl。未知链优雅降级（返回 null，不渲染链接）。
function explorerTxUrl(chain: string, txHash: string): string | null {
  const testnet = PlaygroundTestnets.find((option) => option.chain === chain)
  const base = testnet?.explorerUrl
  if (!base) return null
  if (testnet.family === 'solana') {
    // explorer.solana.com 用 /tx/，cluster 以 query 传入。
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`
  }
  if (testnet.family === 'tron') {
    // tronscan 是单页应用，交易详情在 /#/transaction/。
    return `${base}/#/transaction/${txHash}`
  }
  // EVM 系区块浏览器统一 /tx/。
  return `${base}/tx/${txHash}`
}

function StatusBadge({ status }: { status: Step['status'] }) {
  if (status === 'done') return <Badge variant="default">done</Badge>
  if (status === 'pending') return <Badge variant="secondary">running</Badge>
  if (status === 'error') return <Badge variant="destructive">error</Badge>
  return <Badge variant="outline">idle</Badge>
}

function toWalletInstruction(
  instruction: PaymentOrderInstruction,
): WalletPaymentInstruction {
  return {
    chain: instruction.chain as WalletPaymentInstruction['chain'],
    asset: instruction.asset as WalletPaymentInstruction['asset'],
    address: instruction.address,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 从 API baseUrl 推出 dashboard/addresses 链接：剥去 api. 前缀，本地保留 host 换成 :3000。
// 兜底回生产 stableops.dev（baseUrl 无法解析时）。
function dashboardAddressesUrl(baseUrl: string, locale: Locale): string {
  try {
    const url = new URL(baseUrl)
    if (url.hostname === 'localhost' || url.hostname.startsWith('127.')) {
      return `${url.protocol}//localhost:3000/${locale}/dashboard/addresses`
    }
    const host = url.host.startsWith('api.') ? url.host.slice(4) : url.host
    return `${url.protocol}//${host}/${locale}/dashboard/addresses`
  } catch {
    return `https://stableops.dev/${locale}/dashboard/addresses`
  }
}

// API 错误统一抽成一行：StableOpsError 带后端 message；其余回落到 Error.message / String。
function errMessage(err: unknown): string {
  if (err instanceof StableOpsError) return err.message
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

// 钱包错误常见两类：Error 实例（带 message）和 EIP-1193 风格的 { code, message, data }。
// 直接 String(err) 会拍成 "[object Object]"，丢掉信息——按字段优先级抽出可读串。
function formatWalletError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const obj = err as {
      message?: unknown
      reason?: unknown
      data?: { message?: unknown }
      code?: unknown
    }
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.reason === 'string' && obj.reason) return obj.reason
    if (obj.data && typeof obj.data.message === 'string' && obj.data.message)
      return obj.data.message
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }
  return String(err)
}
