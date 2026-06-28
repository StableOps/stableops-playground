'use client'

import { StableOps, StableOpsError } from '@stableops/api-sdk'
import type { PaymentOrder } from '@stableops/api-sdk'
import {
  getInjectedWalletProviders,
  selectWalletPaymentInstruction,
  sendWalletPayment,
  StableOpsWalletError,
  type ChainId,
  type WalletProviderByChain,
} from '@stableops/wallet-sdk'
import { useCallback, useMemo, useRef, useState } from 'react'

import {
  errMessage,
  explorerTxUrl,
  formatWalletError,
  mergeWalletProviders,
  POLL_INTERVAL_MS,
  sleep,
  toWalletInstruction,
} from './helpers'
import { importSandboxAddress } from './sandbox-address'
import { isAcceptedOrderStatus, isFailedTerminalOrderStatus, type WaitTarget } from './order-status'
import type { PlaygroundTestnet } from './testnets'
import type { Step } from './ui-bits'
import type { TranslationFunctions } from './i18n/i18n-types.js'
import { createConfirmationProgressGuard } from './wallet-confirmation-guard'

export type UsePlaygroundStateInput = {
  client: StableOps | null
  LL: TranslationFunctions
  initialOrder?: PaymentOrder | null
  selectedOptions: PlaygroundTestnet[]
  trimmedKey: string
  baseUrl: string
  amount: string
  amountMode: 'exact' | 'auto'
  autoImportAddress: boolean
  initialSteps: Step[]
}

export type UsePlaygroundState = {
  order: PaymentOrder | null
  steps: Step[]
  log: string[]
  busy: string | null
  createOrder: () => Promise<void>
  payWithWallet: (providers?: WalletProviderByChain, preferredChain?: ChainId) => Promise<boolean>
  markManualTransfer: () => Promise<void>
  waitForOrderStatus: (target: WaitTarget, index: number) => Promise<boolean>
  reset: () => void
  cancelPayment: () => void
}

// 整个订单流程的状态机:state + refs + 所有 action。
// 配置输入(client/msg/selectedOptions/...) 由主组件通过 props 传入,这里只关心"建单→支付→
// 等待 detected/confirmed/finalized"的状态流转。
//
// 关键不变量:
// - busy 单值有"持有者"概念:同一时刻只有一个 action 控制它。createOrder 持 'create',
//   payWithWallet 持 'pay',手动 wait 按钮持 'detected'/'confirmed'/'finalized'。
//   后台静默接力(continueToFinal/waitForOrderStatus 的 silent 路径)绝不抢 busy。
// - pollGenRef 是"代次":每次 reset / 重新建单递增。所有 in-flight 异步回调进入回调时
//   先对比 gen,不匹配就跳过 setState,避免污染新订单 UI。
// - 不在 createOrder 后启动轮询:用户可能拖延支付,detected 倒计时会误报超时。轮询的
//   起点是 payWithWallet 钱包返回 tx hash 或 markManualTransfer 用户点确认。
export function usePlaygroundState(input: UsePlaygroundStateInput): UsePlaygroundState {
  const {
    client,
    LL,
    initialOrder,
    selectedOptions,
    trimmedKey,
    baseUrl,
    amount,
    amountMode,
    autoImportAddress,
    initialSteps,
  } = input

  const [order, setOrder] = useState<PaymentOrder | null>(initialOrder ?? null)
  const [steps, setSteps] = useState<Step[]>(() => {
    if (!initialOrder) return initialSteps
    const primary = initialOrder.paymentInstructions[0]
    return initialSteps.map((step, index) =>
      index === 0
        ? {
            ...step,
            status: 'done',
            detail: `${initialOrder.id}  →  ${primary?.address ?? '(no address)'}`,
          }
        : step,
    )
  })
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState<null | string>(null)

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, `${new Date().toISOString().slice(11, 19)}  ${line}`])
  }, [])

  const updateStep = useCallback((index: number, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }, [])

  // 每次 reset / 重新建单时递增，旧轮询循环检测到 generation 变化后立即退出，
  // 避免旧循环的 updateStep 覆盖新订单的状态。
  const pollGenRef = useRef(0)

  const reset = useCallback(() => {
    pollGenRef.current += 1
    setOrder(null)
    setSteps(initialSteps)
    setLog([])
    setBusy(null)
  }, [initialSteps])

  const cancelPayment = useCallback(() => {
    pollGenRef.current += 1
    setBusy(null)
  }, [])

  const refreshOrder = useCallback(
    async (id: string) => {
      if (!client) return null
      try {
        const fresh = await client.paymentOrders.retrieve(id)
        // 用 functional update + id 比对:reset 后 prev 为 null,或已被新订单替换时,
        // 旧 refreshOrder resolve 不会把旧订单 fresh 写回 state 污染当前 UI。
        setOrder((prev) => (prev && prev.id === id ? fresh : prev))
        return fresh
      } catch (err) {
        append(LL.log.refreshFailed({ error: errMessage(err) }))
        return null
      }
    },
    [client, append, LL],
  )

  const waitForOrderStatus = useCallback(
    async (
      target: WaitTarget,
      index: number,
      opts?: { orderId?: string; silent?: boolean },
    ): Promise<boolean> => {
      const id = opts?.orderId ?? order?.id
      if (!id) return false
      const silent = opts?.silent === true
      // 超时按所选链 + 目标推导，而非固定值：detected 近实时给小预算；慢链(如 ethereum-sepolia
      // finalize)给到分钟级；快链(arbitrum / solana)不必空等。多选时取所有选中链的最大预算，
      // 因为事先不知道用户实际会用哪条链支付。
      const timeoutMs =
        target === 'detected'
          ? Math.max(...selectedOptions.map((o) => o.detectTimeoutMs))
          : target === 'confirmed'
            ? Math.max(...selectedOptions.map((o) => o.confirmTimeoutMs))
            : Math.max(...selectedOptions.map((o) => o.finalizeTimeoutMs))
      // silent 路径不抢 busy:建单后的静默接力 / payWithWallet 后台接力都不应该覆盖
      // 已有的 'create' / 'pay' busy(否则会清掉它,让按钮重新可点)。
      // 手动 wait 按钮路径 silent=false,需要 setBusy 让按钮 disable、给用户反馈。
      if (!silent) setBusy(target)
      updateStep(index, {
        status: 'pending',
        detail: LL.status.polling({
          target,
          seconds: String(Math.round(timeoutMs / 1000)),
        }),
      })
      const deadline = Date.now() + timeoutMs
      const gen = pollGenRef.current
      try {
        while (Date.now() <= deadline) {
          if (pollGenRef.current !== gen) return false
          const fresh = await refreshOrder(id)
          if (!fresh || pollGenRef.current !== gen) return false
          const status = fresh?.status ?? 'unknown'
          append(LL.log.orderStatus({ status }))
          if (isAcceptedOrderStatus(target, status)) {
            updateStep(index, {
              status: 'done',
              detail: LL.status.orderStatus({ status }),
            })
            return true
          }
          if (isFailedTerminalOrderStatus(status)) {
            updateStep(index, {
              status: 'error',
              detail: LL.status.terminalStatus({ target, status }),
            })
            append(LL.log.waitTerminalStatus({ target, status }))
            return false
          }
          await sleep(POLL_INTERVAL_MS)
        }
        if (pollGenRef.current !== gen) return false
        updateStep(index, {
          status: 'error',
          detail: LL.status.timeout({ target }),
        })
        append(LL.log.waitTimedOut({ target }))
        return false
      } finally {
        if (!silent) setBusy(null)
      }
    },
    [append, order, refreshOrder, updateStep, selectedOptions, LL],
  )

  // 暴露给外部的简化签名:不需要 orderId/silent。手动 wait 按钮的回调直接绑这个。
  const waitForOrderStatusPublic = useCallback(
    (target: WaitTarget, index: number) => waitForOrderStatus(target, index),
    [waitForOrderStatus],
  )

  // 第 2 步完成后（钱包支付成功 / 手动确认）自动接力：detected → confirmed → finalized。
  // 逐级仅在前一步成功后继续——某步超时(如确认数还没攒够)则停下，用户可用对应按钮手动重试。
  // orderIdOverride 用于建单后提前启动轮询（此时 order 状态尚未更新）；continueToFinal 总是 silent,
  // 因为它跑在 createOrder / payWithWallet / markManualTransfer 这些"已经持有 busy"或"不需要 busy"
  // 的路径里,不能反过来覆盖上游 caller 设置的 busy 值。
  const continueToFinal = useCallback(
    async (orderIdOverride?: string) => {
      const opts = { orderId: orderIdOverride, silent: true }
      const detected = await waitForOrderStatus('detected', 2, opts)
      if (!detected) return
      const confirmed = await waitForOrderStatus('confirmed', 3, opts)
      if (confirmed) await waitForOrderStatus('finalized', 4, opts)
    },
    [waitForOrderStatus],
  )

  const createOrder = useCallback(async () => {
    if (!client) {
      updateStep(0, { status: 'error', detail: LL.status.missingKey() })
      append(LL.log.missingKey())
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
        } catch (importErr) {
          // 套餐地址配额超限时立即抛出，让外层 catch 显示服务器真实消息；
          // 其余网络/临时错误仍静默忽略，建单失败时会在外层补更具体的提示。
          if (importErr instanceof StableOpsError && importErr.code === 'plan_quota_exceeded') {
            throw importErr
          }
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
          amountMode,
          // 30 分钟后未支付自动过期，order-expiration worker 推进到 expired 并释放地址。
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        { idempotencyKey: merchantOrderId },
      )
      // 先检测被静默丢弃的链（无可用收款地址），失败则不 setOrder 阻断后续。
      const allocatedChains = new Set(created.paymentInstructions.map((pi) => pi.chain))
      const dropped = selectedOptions.filter((opt) => !allocatedChains.has(opt.chain))
      if (dropped.length > 0) {
        const nonEvm = dropped.filter((opt) => opt.family !== 'evm')
        const hasEvmAllocated = selectedOptions.some(
          (opt) => opt.family === 'evm' && allocatedChains.has(opt.chain),
        )
        if (nonEvm.length === dropped.length && !hasEvmAllocated) {
          updateStep(0, { status: 'error', detail: LL.dropped.nonEvmOnly() })
          append(LL.dropped.nonEvmOnly())
        } else if (nonEvm.length > 0 && hasEvmAllocated) {
          const detail = LL.dropped.nonEvmMix({
            chains: nonEvm.map((o) => o.label).join(LL.sep()),
          })
          updateStep(0, { status: 'error', detail })
          append(detail)
        } else {
          updateStep(0, { status: 'error', detail: LL.dropped.fallback() })
          append(LL.dropped.fallback())
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
      append(LL.log.orderCreated({ id: created.id, status: created.status }))
      // 不在这里启动 detected 轮询:用户可能慢悠悠才打开钱包/手动转账,提前倒计时会
      // 把"用户还没付钱"误报成"detected 超时"。轮询的真正起点是 payWithWallet 钱包
      // 返回 tx hash 之后,或 markManualTransfer 用户点确认之后,见各自分支。
      pollGenRef.current += 1
    } catch (err) {
      const message = errMessage(err)
      // 套餐地址/用量配额超限——显示服务器原始消息，不覆盖。
      if (err instanceof StableOpsError && err.code === 'plan_quota_exceeded') {
        updateStep(0, { status: 'error', detail: message })
        append(LL.log.createFailed({ error: message }))
      } else if (/no available address/i.test(message)) {
        const nonEvm = selectedOptions.filter((o) => o.family !== 'evm')
        const hasEvm = selectedOptions.some((o) => o.family === 'evm')
        if (nonEvm.length === selectedOptions.length) {
          append(LL.dropped.nonEvmOnly())
          updateStep(0, { status: 'error', detail: LL.dropped.nonEvmOnly() })
        } else if (nonEvm.length > 0 && hasEvm) {
          const detail = LL.dropped.nonEvmMix({
            chains: nonEvm.map((o) => o.label).join(LL.sep()),
          })
          append(detail)
          updateStep(0, { status: 'error', detail })
        } else {
          append(LL.dropped.fallback())
          updateStep(0, { status: 'error', detail: LL.dropped.fallback() })
        }
      } else {
        updateStep(0, { status: 'error', detail: message })
        append(LL.log.createFailed({ error: message }))
        if (!autoImportAddress) append(LL.noAddress.hint())
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
    amountMode,
    selectedOptions,
    updateStep,
    append,
    LL,
    continueToFinal,
  ])

  const payWithWallet = useCallback(
    async (extraProviders: WalletProviderByChain = {}, preferredChain?: ChainId) => {
      if (!order) return false

      const walletInstructions = order.paymentInstructions.map(toWalletInstruction)
      const providers = mergeWalletProviders(getInjectedWalletProviders(), extraProviders)

      let selected: ReturnType<typeof selectWalletPaymentInstruction>
      try {
        selected = selectWalletPaymentInstruction(
          walletInstructions,
          providers,
          preferredChain ? [preferredChain] : [],
        )
      } catch {
        updateStep(1, {
          status: 'error',
          detail: LL.status.walletProviderNotFound(),
        })
        append(
          LL.log.providerNotFound({
            chain: order.paymentInstructions.map((instruction) => instruction.chain).join(', '),
          }),
        )
        setBusy(null)
        return false
      }

      setBusy('pay')
      updateStep(1, { status: 'pending', detail: LL.status.waitingWallet() })
      const gen = pollGenRef.current
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
        if (gen !== pollGenRef.current) return false

        // 在后台监听链上确认结果：revert 时更新 UI，但若 scanner 已推进则以链上为准。
        const guard = createConfirmationProgressGuard()
        sent.confirmation.catch((err) => {
          if (gen !== pollGenRef.current) return
          if (guard.shouldIgnoreError()) return
          const message = formatWalletError(err)
          updateStep(1, { status: 'error', detail: message })
          append(LL.log.walletReverted({ hash: sent.txHash }))
        })

        // 用所支付链的区块浏览器拼出交易详情页链接，方便用户点开核对这笔链上转账。
        const txUrl = explorerTxUrl(selected.instruction.chain, sent.txHash)
        updateStep(1, {
          status: 'done',
          detail: LL.status.txHash({ hash: sent.txHash }),
          link: txUrl ? { href: txUrl, label: LL.status.viewTx() } : undefined,
        })
        append(LL.log.walletSent({ hash: sent.txHash }))
        void (async () => {
          const fresh = await refreshOrder(order.id)
          if (gen !== pollGenRef.current) return
          // 如果服务端已推进（refreshOrder 返回非 created），立即标记避免异步 confirmation reject 冲突。
          if (fresh && fresh.status !== 'created') guard.markProgressed()
          // 由这里接管 detected→confirmed→finalized 接力。
          await continueToFinal(order.id)
          guard.markProgressed()
        })()
          .catch((err) => {
            if (gen !== pollGenRef.current) return
            append(LL.log.refreshFailed({ error: errMessage(err) }))
          })
          .finally(() => {
            if (gen === pollGenRef.current) setBusy(null)
          })
        return true
      } catch (err) {
        if (gen !== pollGenRef.current) return false
        const message =
          err instanceof StableOpsWalletError && err.code === 'tron_address_not_ready'
            ? LL.status.tronAddressNotReady()
            : formatWalletError(err)
        updateStep(1, { status: 'error', detail: message })
        append(LL.log.walletFailed({ message }))
        if (gen === pollGenRef.current) setBusy(null)
        return false
      }
    },
    [append, order, refreshOrder, updateStep, continueToFinal, LL],
  )

  // 手动转账路径：用户用任意钱包/交易所往收款地址转完账后点此确认。不发链上交易——
  // 只把第 2 步标记为 done 解锁后续轮询，真正的入金仍由 scanner 按地址唯一匹配检测。
  const markManualTransfer = useCallback(async () => {
    if (!order) return
    updateStep(1, { status: 'done', detail: LL.manual.done() })
    append(LL.log.manualConfirmed())
    await refreshOrder(order.id)
    // 手动确认后接管 detected→confirmed→finalized 接力。
    await continueToFinal(order.id)
  }, [append, order, refreshOrder, updateStep, continueToFinal, LL])

  return useMemo(
    () => ({
      order,
      steps,
      log,
      busy,
      createOrder,
      payWithWallet,
      markManualTransfer,
      waitForOrderStatus: waitForOrderStatusPublic,
      reset,
      cancelPayment,
    }),
    [
      order,
      steps,
      log,
      busy,
      createOrder,
      payWithWallet,
      markManualTransfer,
      waitForOrderStatusPublic,
      reset,
      cancelPayment,
    ],
  )
}
