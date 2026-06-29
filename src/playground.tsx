'use client'

import { StableOps, type ChainId } from '@stableops/api-sdk'
import {
  createWalletConnectController,
  setWalletSdkDebug,
  type WalletConnectController,
  type WalletConnectControllerState,
} from '@stableops/wallet-sdk'
import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button, cn, Input, Label, MultiSelect } from './ui'
import { CopyButton, StatusBadge, type Step } from './ui-bits'
import { WALLETCONNECT_WALLETS, type PlaygroundWallet } from './wallets'
import { WalletConnectDialog, type WalletConnectDialogError } from './walletconnect-dialog'
import {
  DEFAULT_BASE_URL,
  chainLabel,
  filterWalletConnectWallets,
  getPaymentCandidateChains,
  getUnauthorizedWalletConnectChains,
  getWalletConnectChainSelection,
} from './helpers'
import { PlaygroundTestnets, type PlaygroundTestnet } from './testnets'
import { usePlaygroundState } from './use-playground-state'

import { loadAllLocales } from './i18n/i18n-util.sync.js'
import { i18nObject } from './i18n/i18n-util.js'
import type { Locales } from './i18n/i18n-types.js'
loadAllLocales()

// 独立、可嵌入的 StableOps playground：在浏览器里走一遍「建单 → 钱包链上支付 → 确认 → 终局」。
// 直接用 @stableops/api-sdk + 调用方提供的 API Key 调真实 API（建单 / 查单 / 地址导入），
// 第 2 步用 @stableops/wallet-sdk 让浏览器钱包发真实测试网交易；后续状态由 scanner /
// confirmations watcher 自动推进，按钮只负责轮询。
//
// 注意：API Key 的环境由 key 本身决定（API 端按 key 解析 org/env），请使用 sandbox key。
//
// 本文件只保留主组件壳:配置 state(API key / 金额 / 链选择等) + JSX。订单流程的所有
// state/action 由 usePlaygroundState 封装,i18n 字典在 messages.ts,纯函数在 helpers.ts,
// 小 UI 子组件(CopyButton/StatusBadge)在 ui-bits.tsx。

export type PlaygroundProps = {
  // 默认 API Key；同时界面提供输入框，用户可粘贴 / 覆盖自己的 sandbox key。
  apiKey?: string
  // StableOps API base，浏览器需可达。默认公网 API。
  baseUrl?: string
  // WalletConnect / Reown projectId。未传入时 WalletConnect UI 禁用，注入钱包和手动转账仍可用。
  walletConnectProjectId?: string
  locale?: 'en' | 'zh'
  className?: string
}

// 是否自动导入 sandbox 地址改为内部开关（UI 控制），不再作为对外 prop——
// 嵌入方常常不知道该不该开；放在 UI 里让用户当面选，且关闭时给出失败兜底提示。

type DemoChain = string
const WALLETCONNECT_CONNECT_REFRESH_LIMIT = 3

function toWalletConnectDialogError(error: unknown): WalletConnectDialogError {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') return { code, message: error.message }
    return error.message
  }
  return String(error)
}

function isWalletConnectConnectFailed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'walletconnect_connect_failed'
  )
}

export function Playground({
  apiKey: apiKeyProp,
  baseUrl = DEFAULT_BASE_URL,
  walletConnectProjectId,
  locale: localeProp = 'en',
  className,
}: PlaygroundProps) {
  const locale: Locales = localeProp === 'zh' ? 'zh' : 'en'
  const LL = i18nObject(locale)

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
      { label: LL.steps.create(), status: 'idle' as const },
      { label: LL.steps.pay(), status: 'idle' as const },
      { label: LL.steps.waitDetected(), status: 'idle' as const },
      { label: LL.steps.waitConfirmed(), status: 'idle' as const },
      { label: LL.steps.waitFinalized(), status: 'idle' as const },
    ],
    [LL],
  )

  const [amount, setAmount] = useState('0.01')
  // 多选链：建单时每个选中链生成一条 acceptedAssets / 一个收款地址，订单返回多条
  // paymentInstructions，用户用任意一条链支付即可。
  const [chains, setChains] = useState<DemoChain[]>(['base-sepolia:USDC'])
  // 自动导入 sandbox 收款地址：默认开启；关闭时改用 org 已有地址，并在 UI / 失败日志里提示如何补救。
  const [autoImportAddress, setAutoImportAddress] = useState(true)
  const [amountMode, setAmountMode] = useState<'exact' | 'auto'>('auto')
  const [selectedPayChain, setSelectedPayChain] = useState<ChainId | null>(null)
  const [walletConnectOpen, setWalletConnectOpen] = useState(false)
  const [walletConnectHidden, setWalletConnectHidden] = useState(false)
  const [walletConnectController, setWalletConnectController] =
    useState<WalletConnectController | null>(null)
  const [walletConnectState, setWalletConnectState] = useState<WalletConnectControllerState>({
    status: 'idle',
    wallets: WALLETCONNECT_WALLETS,
  })
  const [walletConnectQrCode, setWalletConnectQrCode] = useState<string | null>(null)
  const [walletConnectError, setWalletConnectError] = useState<WalletConnectDialogError | null>(
    null,
  )
  const [walletConnectRefreshAvailable, setWalletConnectRefreshAvailable] = useState(false)
  // 弹窗两步视图：null=钱包列表页；非空=该钱包的二维码页。
  const [selectedWalletConnectId, setSelectedWalletConnectId] = useState<string | null>(null)
  // 用户在二维码页点「返回」会主动断开在途连接，使 connect() reject；据此抑制由此产生的误报错误。
  const walletConnectCancelling = useRef(false)

  // 选中的测试网（按选择顺序）；为空时回落到目录首项，避免 Math.max(...[]) / 取 asset 出错。
  const selectedOptions: PlaygroundTestnet[] = useMemo(() => {
    const picked = chains
      .map((composite) => {
        const [chain, asset] = composite.split(':')
        return chainOptions.find((option) => option.chain === chain && option.asset === asset)
      })
      .filter((option): option is PlaygroundTestnet => Boolean(option))
    return picked.length > 0 ? picked : [chainOptions[0]]
  }, [chains, chainOptions])
  // 选中链可能混用资产（多数 USDC，TRON 为 USDT），金额标签去重展示。
  const assetLabel = useMemo(
    () => Array.from(new Set(selectedOptions.map((o) => o.asset))).join(' / '),
    [selectedOptions],
  )
  // playground 默认开启 wallet-sdk 调试日志：挂载即打开，钱包支付全过程在控制台输出 [wallet-sdk] …，
  // 便于排查支付失败。这是个面向开发者的演练场，默认开 debug 比藏开关更有用。
  useEffect(() => {
    setWalletSdkDebug(true)
  }, [])

  const {
    order,
    steps,
    log,
    busy,
    createOrder,
    payWithWallet,
    markManualTransfer,
    waitForOrderStatus,
    reset,
    cancelPayment,
  } = usePlaygroundState({
    client,
    LL,
    selectedOptions,
    trimmedKey,
    baseUrl,
    amount,
    amountMode,
    autoImportAddress,
    initialSteps,
  })

  // 订单支付时可选的链（去重），作为支付网络选择器的数据源。
  const payChainOptions = useMemo(() => {
    if (!order) return []
    return Array.from(new Set(order.paymentInstructions.map((pi) => pi.chain)))
  }, [order])
  const mobileWalletCandidateChains = useMemo(
    () => getPaymentCandidateChains(payChainOptions, selectedPayChain),
    [payChainOptions, selectedPayChain],
  )

  // 订单变化时，若当前支付网络选择不在新订单的可用链中，回退自动。
  useEffect(() => {
    if (selectedPayChain && order && !payChainOptions.includes(selectedPayChain)) {
      setSelectedPayChain(null)
    }
  }, [order, payChainOptions, selectedPayChain])

  const walletConnectChainSelection = useMemo(() => {
    if (!order) return { evmChains: [], solanaChains: [], tronChains: [], supportedChains: [] }
    return getWalletConnectChainSelection(mobileWalletCandidateChains)
  }, [mobileWalletCandidateChains, order])
  const walletConnectAvailable = walletConnectChainSelection.supportedChains.length > 0
  const walletConnectWallets = useMemo(
    () => filterWalletConnectWallets(WALLETCONNECT_WALLETS, walletConnectChainSelection.supportedChains),
    [walletConnectChainSelection.supportedChains],
  )
  const mobileWalletAvailable = walletConnectAvailable
  const mobileWallets = walletConnectWallets
  const selectedWalletConnect = useMemo(
    () => mobileWallets.find((wallet) => wallet.id === selectedWalletConnectId) ?? null,
    [selectedWalletConnectId, mobileWallets],
  )
  // 链集合签名，作为 controller 生命周期的稳定 key，避免 useEffect 依赖整数组每次 render 都变。
  const walletConnectChainsKey = useMemo(
    () => walletConnectChainSelection.supportedChains.slice().sort().join(','),
    [walletConnectChainSelection.supportedChains],
  )

  useEffect(() => {
    if (walletConnectState.status !== 'uri_ready') {
      setWalletConnectQrCode(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(walletConnectState.uri, {
      // 二维码中心叠了钱包 logo（约 20% 面积），用 H 级纠错（~30% 冗余）保证仍可扫。
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
    })
      .then((dataUrl) => {
        if (!cancelled) setWalletConnectQrCode(dataUrl)
      })
      .catch((err: unknown) => {
        if (!cancelled) setWalletConnectError(toWalletConnectDialogError(err))
      })
    return () => {
      cancelled = true
    }
  }, [walletConnectState])

  const resetWalletConnect = useCallback(async () => {
    cancelPayment()
    const controller = walletConnectController
    setWalletConnectController(null)
    setWalletConnectHidden(false)
    setWalletConnectState({ status: 'idle', wallets: walletConnectWallets })
    setWalletConnectQrCode(null)
    setWalletConnectError(null)
    setWalletConnectRefreshAvailable(false)
    setSelectedWalletConnectId(null)
    if (controller) await controller.disconnect().catch(() => undefined)
  }, [cancelPayment, walletConnectController, walletConnectWallets])

  const openWalletConnect = useCallback(() => {
    setWalletConnectOpen(true)
    setWalletConnectHidden(false)
    setWalletConnectError(null)
    setWalletConnectRefreshAvailable(false)
    setSelectedWalletConnectId(null)
  }, [])

  // 二维码页「返回」：断开在途连接并回到钱包列表（controller 保留复用）。断开会让在途 connect()
  // reject，用 walletConnectCancelling 抑制由此产生的误报错误；断开后下次选钱包会重新出 URI。
  const backToWalletList = useCallback(async () => {
    cancelPayment()
    walletConnectCancelling.current = true
    setSelectedWalletConnectId(null)
    setWalletConnectQrCode(null)
    setWalletConnectError(null)
    setWalletConnectRefreshAvailable(false)
    const controller = walletConnectController
    if (controller) await controller.disconnect().catch(() => undefined)
    walletConnectCancelling.current = false
  }, [cancelPayment, walletConnectController])

  // Modal 打开后惰性创建 controller，并随关闭 / 链集合变化彻底 disconnect。
  // 关键：原实现每次点钱包按钮都 new 一个 controller，导致同一 tab 内多份 EthereumProvider
  // 实例共享 localStorage,旧实例的 proposal/session 还会被 relay 投递到新实例,
  // 触发 "No matching key. proposal/topic" 噪音日志。
  useEffect(() => {
    if (!walletConnectOpen) return
    if (!walletConnectProjectId || walletConnectChainSelection.supportedChains.length === 0) return
    let cancelled = false
    let createdController: WalletConnectController | null = null
    let unsubscribe: (() => void) | undefined
    void (async () => {
      try {
        const controller = await createWalletConnectController({
          projectId: walletConnectProjectId,
          metadata: {
            name: 'StableOps Playground',
            description: 'StableOps sandbox payment playground',
            url: window.location.origin,
            icons: [`${window.location.origin}/logo.svg`],
          },
          chains: walletConnectChainSelection.evmChains,
          solanaChains: walletConnectChainSelection.solanaChains,
          tronChains: walletConnectChainSelection.tronChains,
          wallets: walletConnectWallets,
        })
        if (cancelled) {
          await controller.disconnect().catch(() => undefined)
          return
        }
        createdController = controller
        unsubscribe = controller.subscribe(setWalletConnectState)
        setWalletConnectState(controller.getState())
        setWalletConnectController(controller)
      } catch (err) {
        if (!cancelled) {
          setWalletConnectError(toWalletConnectDialogError(err))
        }
      }
    })()
    return () => {
      cancelled = true
      unsubscribe?.()
      if (createdController) {
        void createdController.disconnect().catch(() => undefined)
      }
      setWalletConnectController(null)
      setWalletConnectState({ status: 'idle', wallets: walletConnectWallets })
      setWalletConnectQrCode(null)
    }
    // walletConnectChainsKey 用链集合签名做稳定依赖；按链集合变化重建即可。
  }, [
    walletConnectOpen,
    walletConnectProjectId,
    walletConnectChainSelection,
    walletConnectChainsKey,
    walletConnectWallets,
  ])

  const connectWalletConnect = useCallback(
    async (wallet: PlaygroundWallet) => {
      if (
        !order ||
        walletConnectChainSelection.supportedChains.length === 0 ||
        !walletConnectProjectId
      )
        return
      const controller = walletConnectController
      if (!controller) return
      setWalletConnectError(null)
      setWalletConnectRefreshAvailable(false)
      setWalletConnectQrCode(null)
      setSelectedWalletConnectId(wallet.id)
      for (let refreshCount = 0; ; refreshCount += 1) {
        try {
          await controller.connect({ walletId: wallet.id })
          const unauthorizedChains = getUnauthorizedWalletConnectChains(
            walletConnectChainSelection.supportedChains,
            controller.providers,
          )
          if (unauthorizedChains.length === walletConnectChainSelection.supportedChains.length) {
            setWalletConnectError(
              LL.walletConnect.chainNotAuthorized({
                chains: unauthorizedChains
                  .map((chain) => chainLabel(chainOptions, chain))
                  .join(LL.sep()),
              }),
            )
            return
          }
          const paid = await payWithWallet(controller.providers, selectedPayChain ?? undefined)
          if (paid) setWalletConnectOpen(false)
          return
        } catch (err) {
          // 用户主动返回（断开在途连接）导致的 reject 不是错误，静默忽略。
          if (walletConnectCancelling.current) return
          if (
            isWalletConnectConnectFailed(err) &&
            refreshCount < WALLETCONNECT_CONNECT_REFRESH_LIMIT
          ) {
            setWalletConnectError(null)
            setWalletConnectQrCode(null)
            await controller.disconnect().catch(() => undefined)
            if (walletConnectCancelling.current) return
            continue
          }
          setWalletConnectQrCode(null)
          if (isWalletConnectConnectFailed(err)) setWalletConnectRefreshAvailable(true)
          setWalletConnectError(toWalletConnectDialogError(err))
          return
        }
      }
    },
    [
      chainOptions,
      LL,
      order,
      payWithWallet,
      selectedPayChain,
      walletConnectChainSelection,
      walletConnectProjectId,
      walletConnectController,
    ],
  )

  const retryWalletConnectPayment = useCallback(async () => {
    const controller = walletConnectController
    if (!controller) return
    setWalletConnectError(null)
    const paid = await payWithWallet(controller.providers, selectedPayChain ?? undefined)
    if (paid) setWalletConnectOpen(false)
  }, [payWithWallet, selectedPayChain, walletConnectController])

  return (
    <div className={cn('not-prose my-6 space-y-5', className)}>
      <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
        <div className="space-y-2">
          <Label htmlFor="playground-api-key" className="text-sm font-medium">
            {LL.apiKey.label()}
          </Label>
          <Input
            id="playground-api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className="h-10 w-full bg-background font-mono"
            placeholder={LL.apiKey.placeholder()}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{LL.apiKey.hint()}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-4 sm:items-start">
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
          <div className="space-y-2 col-span-2">
            <Label htmlFor="playground-chain" className="text-sm font-medium">
              {LL.chains.label()}
            </Label>
            <MultiSelect
              id="playground-chain"
              options={chainOptions.map((option) => ({
                value: `${option.chain}:${option.asset}`,
                label: option.label,
              }))}
              value={chains}
              onChange={(next) => setChains(next as DemoChain[])}
              placeholder={LL.chains.placeholder()}
              disabled={Boolean(order)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{LL.amountMode.label()}</Label>
            <MultiSelect
              options={[
                { value: 'exact', label: LL.amountMode.exact() },
                { value: 'auto', label: LL.amountMode.auto() },
              ]}
              value={[amountMode]}
              onChange={(next) => setAmountMode(next[next.length - 1] as 'exact' | 'auto')}
              placeholder={LL.amountMode.label()}
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
            <span className="font-medium">{LL.autoImport.label()}</span>
          </label>
          <p className="pl-6 text-xs text-muted-foreground">{LL.autoImport.hint()}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {LL.faucet.prefix()}
          {selectedOptions.map((option, i) => (
            <span key={`${option.chain}:${option.asset}`}>
              {i > 0 ? ' · ' : ''}
              <a
                href={option.faucetUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2">
                {option.label}
              </a>
            </span>
          ))}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={createOrder}
            disabled={Boolean(order) || busy !== null || !trimmedKey || chains.length === 0}>
            {busy === 'create' ? LL.actions.creating() : LL.actions.createOrder()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void payWithWallet(undefined, selectedPayChain ?? undefined)}

            disabled={!order || busy === 'create' || busy === 'pay' || steps[1].status === 'done'}>
            {busy === 'pay' ? LL.actions.paying() : LL.actions.pay()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={openWalletConnect}
            disabled={
              !order ||
              busy === 'create' ||
              busy === 'pay' ||
              steps[1].status === 'done' ||
              !walletConnectProjectId ||
              !mobileWalletAvailable
            }>
            {LL.walletConnect.button()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={markManualTransfer}
            disabled={!order || busy === 'create' || busy === 'pay' || steps[1].status === 'done'}>
            {LL.actions.confirmManual()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('detected', 2)}
            disabled={
              !order || busy !== null || steps[1].status !== 'done' || steps[2].status === 'done'
            }>
            {busy === 'detected' ? LL.actions.polling() : LL.actions.waitDetected()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('confirmed', 3)}
            disabled={
              !order || busy !== null || steps[2].status !== 'done' || steps[3].status === 'done'
            }>
            {busy === 'confirmed' ? LL.actions.polling() : LL.actions.waitConfirmed()}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('finalized', 4)}
            disabled={
              !order || busy !== null || steps[3].status !== 'done' || steps[4].status === 'done'
            }>
            {busy === 'finalized' ? LL.actions.polling() : LL.actions.waitFinalized()}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy === 'create'}>
            {LL.actions.reset()}
          </Button>
        </div>
      </div>

      <WalletConnectDialog
        open={walletConnectOpen && !walletConnectHidden}
        locale={locale}
        projectId={walletConnectProjectId}
        available={mobileWalletAvailable}
        wallets={mobileWallets}
        selectedWallet={selectedWalletConnect}
        state={walletConnectState}
        qrCode={walletConnectQrCode}
        error={walletConnectError}
        paymentPending={busy === 'pay'}
        connectionRefreshAvailable={walletConnectRefreshAvailable}
        onSelectWallet={(wallet) => void connectWalletConnect(wallet)}
        onRetryPayment={() => void retryWalletConnectPayment()}
        onRefreshConnection={() => {
          if (selectedWalletConnect) void connectWalletConnect(selectedWalletConnect)
        }}
        onBack={() => void backToWalletList()}
        onClose={() => {
          setWalletConnectOpen(false)
          void resetWalletConnect()
        }}
      />

      {order && steps[1].status !== 'done' ? (
        <div className="space-y-3 rounded-lg border bg-background/50 p-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedPayChain(null)}
              className={`cursor-pointer rounded-full border px-2 py-0.5 transition ${
                selectedPayChain === null
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}>
              {LL.network.auto()}
            </button>
            {payChainOptions.map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => setSelectedPayChain(chain)}
                className={`cursor-pointer rounded-full border px-2 py-0.5 font-mono transition ${
                  selectedPayChain === chain
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}>
                {chainLabel(chainOptions, chain)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {order && steps[1].status !== 'done' ? (
        <div className="space-y-3 rounded-lg border bg-background/50 p-4">
          <div className="text-sm font-medium">{LL.manual.heading()}</div>
          {order.paymentInstructions.map((instruction) => (
            <div key={`${instruction.chain}:${instruction.address}`} className="space-y-1.5">
              <div className="text-xs text-muted-foreground">
                {LL.manual.sendTo({
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
                  copyLabel={LL.manual.copy()}
                  copiedLabel={LL.manual.copied()}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{LL.manual.hint()}</p>
        </div>
      ) : null}

      <ol className="space-y-2.5">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex items-start gap-3 rounded-lg border bg-background/50 p-3.5 text-sm">
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
                      className="ml-2 inline-block text-xs underline underline-offset-2">
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
        <div className="mb-1 text-xs font-medium text-muted-foreground">Activity log</div>
        <pre className="max-h-40 overflow-y-auto font-mono text-xs leading-relaxed">
          {log.length === 0 ? '(empty)' : log.join('\n')}
        </pre>
      </div>

      <p
        className="text-sm text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: LL.footer() }}
      />
    </div>
  )
}
