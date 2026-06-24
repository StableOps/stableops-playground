'use client'

import { StableOps } from '@stableops/api-sdk'
import type { PaymentOrder } from '@stableops/api-sdk'
import {
  createWalletConnectConnection,
  getInjectedWalletProviders,
  selectWalletPaymentInstruction,
  sendWalletPayment,
  type EvmWalletChainId,
  type WalletConnectConnection,
  type WalletConnectMetadata,
  type WalletProviderByChain,
} from '@stableops/wallet-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  defaultWalletConnectMetadata,
  errMessage,
  explorerTxUrl,
  formatWalletError,
  isEvmChainId,
  POLL_INTERVAL_MS,
  sleep,
  toWalletInstruction,
  tpl,
} from './helpers'
import { importSandboxAddress } from './sandbox-address'
import { isAcceptedOrderStatus, isFailedTerminalOrderStatus, type WaitTarget } from './order-status'
import type { Messages } from './messages'
import type { PlaygroundTestnet } from './testnets'
import type { Step } from './ui-bits'
import { createConfirmationProgressGuard } from './wallet-confirmation-guard'

export type UsePlaygroundStateInput = {
  client: StableOps | null
  msg: Messages
  selectedOptions: PlaygroundTestnet[]
  trimmedKey: string
  baseUrl: string
  amount: string
  amountMode: 'exact' | 'auto'
  autoImportAddress: boolean
  walletConnectProjectId?: string
  walletConnectMetadata?: WalletConnectMetadata
  initialSteps: Step[]
}

export type UsePlaygroundState = {
  order: PaymentOrder | null
  steps: Step[]
  log: string[]
  busy: string | null
  createOrder: () => Promise<void>
  payWithWallet: () => Promise<void>
  markManualTransfer: () => Promise<void>
  waitForOrderStatus: (target: WaitTarget, index: number) => Promise<boolean>
  reset: () => void
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
    msg,
    selectedOptions,
    trimmedKey,
    baseUrl,
    amount,
    amountMode,
    autoImportAddress,
    walletConnectProjectId,
    walletConnectMetadata,
    initialSteps,
  } = input

  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [steps, setSteps] = useState<Step[]>(initialSteps)
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

  // WC 兜底:仅当未注入 EVM provider(典型为手机普通浏览器)且接入方提供了 projectId 时按需创建。
  // 用 ref 而非 state:连接在异步函数闭包里使用,不需要触发重渲染。
  const walletConnectRef = useRef<WalletConnectConnection | null>(null)

  const reset = useCallback(() => {
    pollGenRef.current += 1
    setOrder(null)
    setSteps(initialSteps)
    setLog([])
    setBusy(null)
    // reset 时主动断开 WC 会话,避免下次连接残留旧 session;失败不阻塞 UI。
    const wc = walletConnectRef.current
    walletConnectRef.current = null
    if (wc) void wc.disconnect().catch(() => {})
  }, [initialSteps])

  // 卸载时同样断开,防止用户离开页面后 WC relay 长连接继续保持。
  useEffect(() => {
    return () => {
      const wc = walletConnectRef.current
      walletConnectRef.current = null
      if (wc) void wc.disconnect().catch(() => {})
    }
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
        append(tpl(msg.log.refreshFailed, { error: errMessage(err) }))
        return null
      }
    },
    [client, append, msg],
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
        detail: tpl(msg.status.polling, {
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
        if (pollGenRef.current !== gen) return false
        updateStep(index, {
          status: 'error',
          detail: tpl(msg.status.timeout, { target }),
        })
        append(tpl(msg.log.waitTimedOut, { target }))
        return false
      } finally {
        if (!silent) setBusy(null)
      }
    },
    [append, order, refreshOrder, updateStep, selectedOptions, msg],
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
          updateStep(0, { status: 'error', detail: msg.dropped.nonEvmOnly })
          append(msg.dropped.nonEvmOnly)
        } else if (nonEvm.length > 0 && hasEvmAllocated) {
          const detail = tpl(msg.dropped.nonEvmMix, {
            chains: nonEvm.map((o) => o.label).join(msg.sep),
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
      append(tpl(msg.log.orderCreated, { id: created.id, status: created.status }))
      // 不在这里启动 detected 轮询:用户可能慢悠悠才打开钱包/手动转账,提前倒计时会
      // 把"用户还没付钱"误报成"detected 超时"。轮询的真正起点是 payWithWallet 钱包
      // 返回 tx hash 之后,或 markManualTransfer 用户点确认之后,见各自分支。
      pollGenRef.current += 1
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
          const detail = tpl(msg.dropped.nonEvmMix, {
            chains: nonEvm.map((o) => o.label).join(msg.sep),
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
    amountMode,
    selectedOptions,
    updateStep,
    append,
    msg,
    continueToFinal,
  ])

  const payWithWallet = useCallback(async () => {
    if (!order) return

    const walletInstructions = order.paymentInstructions.map(toWalletInstruction)
    let providers: WalletProviderByChain = getInjectedWalletProviders()

    // 桌面浏览器插件 / 钱包内置浏览器 → providers 里已有 EVM provider,跳过 WC。
    // 普通手机浏览器没注入 provider:订单含 EVM 链且接入方提供了 projectId 时,
    // 通过 WalletConnect 模态框拉起已安装钱包 App 完成签名(没装钱包则降级二维码)。
    const orderHasEvm = walletInstructions.some((i) => isEvmChainId(i.chain))
    const hasInjectedEvm = walletInstructions.some(
      (i) => isEvmChainId(i.chain) && providers[i.chain],
    )

    if (orderHasEvm && !hasInjectedEvm && walletConnectProjectId) {
      setBusy('pay')
      updateStep(1, { status: 'pending', detail: msg.status.walletConnectConnecting })
      append(msg.log.walletConnectOpening)
      try {
        let wc = walletConnectRef.current
        if (!wc) {
          // 只声明本订单实际需要的 EVM 链,避免把所有主网/测试网协商进钱包网络列表。
          // reset 时会清掉 walletConnectRef,新订单总会以自己的链集合重建连接。
          const evmChains = walletInstructions
            .filter((i) => isEvmChainId(i.chain))
            .map((i) => i.chain as EvmWalletChainId)
          wc = await createWalletConnectConnection({
            projectId: walletConnectProjectId,
            metadata: walletConnectMetadata ?? defaultWalletConnectMetadata(),
            chains: evmChains,
          })
          walletConnectRef.current = wc
          wc.onDisplayUri((uri) => append(tpl(msg.log.walletConnectUri, { uri })))
        }
        const accounts = await wc.connect()
        providers = { ...providers, ...wc.providers }
        append(tpl(msg.log.walletConnectConnected, { account: accounts[0] ?? '?' }))
      } catch (err) {
        const message = formatWalletError(err)
        updateStep(1, { status: 'error', detail: message })
        append(tpl(msg.log.walletFailed, { message }))
        setBusy(null)
        return
      }
    }

    let selected: ReturnType<typeof selectWalletPaymentInstruction>
    try {
      selected = selectWalletPaymentInstruction(walletInstructions, providers)
    } catch {
      updateStep(1, {
        status: 'error',
        detail: msg.status.walletProviderNotFound,
      })
      append(
        tpl(msg.log.providerNotFound, {
          chain: order.paymentInstructions.map((instruction) => instruction.chain).join(', '),
        }),
      )
      setBusy(null)
      return
    }

    const usesWalletConnect = walletConnectRef.current !== null

    if (usesWalletConnect) {
      // WC 路径:eth_sendTransaction 可能不通过 relay 返回 tx hash(用户已在手机上确认),
      // 不阻塞 UI, 直接进入轮询。若后续收到返回则在后台更新步骤 2。
      // busy='pay' 期间 Pay/Manual 按钮 disabled(见 button disabled 表达式),
      // 由 paymentPromise.finally 释放——避免立即 setBusy(null) 让用户连点 Pay 发起多笔交易。
      setBusy('pay')
      updateStep(1, { status: 'pending', detail: msg.status.waitingWallet })
      append(msg.log.wcSubmitted)

      const gen = pollGenRef.current
      const paymentPromise = sendWalletPayment({
        provider: selected.provider,
        amount: order.amount,
        instruction: selected.instruction,
        solanaRpcUrl:
          selected.instruction.chain === 'solana-devnet'
            ? 'https://api.devnet.solana.com'
            : undefined,
        // WC 通过 optionalChains 在 session 协商阶段处理了链切换，不再需要
        // wallet_switchEthereumChain / wallet_addEthereumChain
        skipChainSwitch: true,
      })

      // gen 检查:reset 后旧 promise resolve 不污染新订单 UI;
      // 同时 busy 也只在自己代次内释放,避免清掉新 owner 的 busy。
      paymentPromise
        .then((sent) => {
          if (gen !== pollGenRef.current) return
          const txUrl = explorerTxUrl(selected.instruction.chain, sent.txHash)
          updateStep(1, {
            status: 'done',
            detail: tpl(msg.status.txHash, { hash: sent.txHash }),
            link: txUrl ? { href: txUrl, label: msg.status.viewTx } : undefined,
          })
          append(tpl(msg.log.walletSent, { hash: sent.txHash }))
          sent.confirmation.catch((_err) => {
            if (gen !== pollGenRef.current) return
            append(tpl(msg.log.walletReverted, { hash: sent.txHash }))
          })
        })
        .catch((err) => {
          if (gen !== pollGenRef.current) return
          append(tpl(msg.log.walletFailed, { message: formatWalletError(err) }))
        })
        .finally(() => {
          if (gen !== pollGenRef.current) return
          setBusy(null)
        })

      // 后台启动轮询:不 await,不阻塞 paymentPromise.finally 释放 busy。
      // continueToFinal 是 silent,不会影响这里 setBusy('pay') 的状态。
      continueToFinal(order.id)
      return
    }

    // 非 WC 路径:保持原有阻塞式等待。gen 检查防止 reset 后旧 await 回到回调时污染新订单 UI。
    setBusy('pay')
    updateStep(1, { status: 'pending', detail: msg.status.waitingWallet })
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
      if (gen !== pollGenRef.current) return

      // 在后台监听链上确认结果：revert 时更新 UI，但若 scanner 已推进则以链上为准。
      const guard = createConfirmationProgressGuard()
      sent.confirmation.catch((err) => {
        if (gen !== pollGenRef.current) return
        if (guard.shouldIgnoreError()) return
        const message = formatWalletError(err)
        updateStep(1, { status: 'error', detail: message })
        append(tpl(msg.log.walletReverted, { hash: sent.txHash }))
      })

      // 用所支付链的区块浏览器拼出交易详情页链接，方便用户点开核对这笔链上转账。
      const txUrl = explorerTxUrl(selected.instruction.chain, sent.txHash)
      updateStep(1, {
        status: 'done',
        detail: tpl(msg.status.txHash, { hash: sent.txHash }),
        link: txUrl ? { href: txUrl, label: msg.status.viewTx } : undefined,
      })
      append(tpl(msg.log.walletSent, { hash: sent.txHash }))
      const fresh = await refreshOrder(order.id)
      if (gen !== pollGenRef.current) return
      // 如果服务端已推进（refreshOrder 返回非 created），立即标记避免异步 confirmation reject 冲突。
      if (fresh && fresh.status !== 'created') guard.markProgressed()
      // 由这里接管 detected→confirmed→finalized 接力。
      await continueToFinal(order.id)
      guard.markProgressed()
    } catch (err) {
      if (gen !== pollGenRef.current) return
      const message = formatWalletError(err)
      updateStep(1, { status: 'error', detail: message })
      append(tpl(msg.log.walletFailed, { message }))
    } finally {
      if (gen === pollGenRef.current) setBusy(null)
    }
  }, [
    append,
    order,
    refreshOrder,
    updateStep,
    continueToFinal,
    msg,
    walletConnectProjectId,
    walletConnectMetadata,
  ])

  // 手动转账路径：用户用任意钱包/交易所往收款地址转完账后点此确认。不发链上交易——
  // 只把第 2 步标记为 done 解锁后续轮询，真正的入金仍由 scanner 按地址唯一匹配检测。
  const markManualTransfer = useCallback(async () => {
    if (!order) return
    updateStep(1, { status: 'done', detail: msg.manual.done })
    append(msg.log.manualConfirmed)
    await refreshOrder(order.id)
    // 手动确认后接管 detected→confirmed→finalized 接力。
    await continueToFinal(order.id)
  }, [append, order, refreshOrder, updateStep, continueToFinal, msg])

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
    ],
  )
}
