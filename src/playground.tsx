'use client'

import { StableOps } from '@stableops/api-sdk'
import {
  createWalletConnectController,
  setWalletSdkDebug,
  type EvmWalletChainId,
  type WalletConnectController,
  type WalletConnectControllerState,
  type WalletConnectWalletOption,
} from '@stableops/wallet-sdk'
import QRCode from 'qrcode'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button, cn, Input, Label, MultiSelect } from './ui'
import { CopyButton, StatusBadge, type Step } from './ui-bits'
import { DEFAULT_BASE_URL, chainLabel, isEvmChainId, tpl } from './helpers'
import { messages, type Locale } from './messages'
import { PlaygroundTestnets, type PlaygroundTestnet } from './testnets'
import { usePlaygroundState } from './use-playground-state'

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

const WalletConnectWallets: WalletConnectWalletOption[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    links: {
      native: 'metamask://wc?uri=',
      universal: 'https://metamask.app.link/wc?uri=',
    },
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
  },
]

function walletLink(prefix: string, uri: string): string {
  return `${prefix}${encodeURIComponent(uri)}`
}

export function Playground({
  apiKey: apiKeyProp,
  baseUrl = DEFAULT_BASE_URL,
  walletConnectProjectId,
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
  const [amountMode, setAmountMode] = useState<'exact' | 'auto'>('auto')
  const [walletConnectOpen, setWalletConnectOpen] = useState(false)
  const [walletConnectController, setWalletConnectController] =
    useState<WalletConnectController | null>(null)
  const [walletConnectState, setWalletConnectState] = useState<WalletConnectControllerState>({
    status: 'idle',
    wallets: WalletConnectWallets,
  })
  const [walletConnectQrCode, setWalletConnectQrCode] = useState<string | null>(null)
  const [walletConnectError, setWalletConnectError] = useState<string | null>(null)

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
  } = usePlaygroundState({
    client,
    msg,
    selectedOptions,
    trimmedKey,
    baseUrl,
    amount,
    amountMode,
    autoImportAddress,
    initialSteps,
  })
  const walletConnectChains = useMemo(() => {
    if (!order) return []
    return Array.from(
      new Set(
        order.paymentInstructions
          .map((instruction) => instruction.chain)
          .filter((chain): chain is EvmWalletChainId =>
            isEvmChainId(chain as Parameters<typeof isEvmChainId>[0]),
          ),
      ),
    )
  }, [order])
  const walletConnectAvailable = walletConnectChains.length > 0
  // 链集合签名，作为 controller 生命周期的稳定 key，避免 useEffect 依赖整数组每次 render 都变。
  const walletConnectChainsKey = useMemo(
    () => walletConnectChains.slice().sort().join(','),
    [walletConnectChains],
  )

  useEffect(() => {
    if (walletConnectState.status !== 'uri_ready') {
      setWalletConnectQrCode(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(walletConnectState.uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 224,
    })
      .then((dataUrl) => {
        if (!cancelled) setWalletConnectQrCode(dataUrl)
      })
      .catch((err: unknown) => {
        if (!cancelled) setWalletConnectError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [walletConnectState])

  const resetWalletConnect = useCallback(async () => {
    const controller = walletConnectController
    setWalletConnectController(null)
    setWalletConnectState({ status: 'idle', wallets: WalletConnectWallets })
    setWalletConnectQrCode(null)
    setWalletConnectError(null)
    if (controller) await controller.disconnect().catch(() => undefined)
  }, [walletConnectController])

  const openWalletConnect = useCallback(() => {
    setWalletConnectOpen(true)
    setWalletConnectError(null)
  }, [])

  // Modal 打开后惰性创建 controller，并随关闭 / 链集合变化彻底 disconnect。
  // 关键：原实现每次点钱包按钮都 new 一个 controller，导致同一 tab 内多份 EthereumProvider
  // 实例共享 localStorage,旧实例的 proposal/session 还会被 relay 投递到新实例,
  // 触发 "No matching key. proposal/topic" 噪音日志。
  useEffect(() => {
    if (!walletConnectOpen) return
    if (!walletConnectProjectId || walletConnectChains.length === 0) return
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
          chains: walletConnectChains,
          wallets: WalletConnectWallets,
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
          setWalletConnectError(err instanceof Error ? err.message : String(err))
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
      setWalletConnectState({ status: 'idle', wallets: WalletConnectWallets })
      setWalletConnectQrCode(null)
    }
    // walletConnectChains 用 key 做稳定依赖；按链集合签名重建即可。
  }, [walletConnectOpen, walletConnectProjectId, walletConnectChains, walletConnectChainsKey])

  const connectWalletConnect = useCallback(
    async (wallet: WalletConnectWalletOption) => {
      if (!order || walletConnectChains.length === 0 || !walletConnectProjectId) return
      const controller = walletConnectController
      if (!controller) return
      setWalletConnectError(null)
      try {
        await controller.connect({ walletId: wallet.id })
        await payWithWallet(controller.providers)
        setWalletConnectOpen(false)
      } catch (err) {
        setWalletConnectError(err instanceof Error ? err.message : String(err))
      }
    },
    [order, payWithWallet, walletConnectChains, walletConnectProjectId, walletConnectController],
  )

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
              {msg.chains.label}
            </Label>
            <MultiSelect
              id="playground-chain"
              options={chainOptions.map((option) => ({
                value: `${option.chain}:${option.asset}`,
                label: option.label,
              }))}
              value={chains}
              onChange={(next) => setChains(next as DemoChain[])}
              placeholder={msg.chains.placeholder}
              disabled={Boolean(order)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{msg.amountMode.label}</Label>
            <MultiSelect
              options={[
                { value: 'exact', label: msg.amountMode.exact },
                { value: 'auto', label: msg.amountMode.auto },
              ]}
              value={[amountMode]}
              onChange={(next) => setAmountMode(next[next.length - 1] as 'exact' | 'auto')}
              placeholder={msg.amountMode.label}
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
          <p className="pl-6 text-xs text-muted-foreground">{msg.autoImport.hint}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {msg.faucet.prefix}
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
            {busy === 'create' ? msg.actions.creating : msg.actions.createOrder}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void payWithWallet()}
            disabled={!order || busy === 'create' || busy === 'pay' || steps[1].status === 'done'}>
            {busy === 'pay' ? msg.actions.paying : msg.actions.pay}
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
              !walletConnectAvailable
            }>
            {msg.walletConnect.button}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={markManualTransfer}
            disabled={!order || busy === 'create' || busy === 'pay' || steps[1].status === 'done'}>
            {msg.actions.confirmManual}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('detected', 2)}
            disabled={
              !order || busy !== null || steps[1].status !== 'done' || steps[2].status === 'done'
            }>
            {busy === 'detected' ? msg.actions.polling : msg.actions.waitDetected}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('confirmed', 3)}
            disabled={
              !order || busy !== null || steps[2].status !== 'done' || steps[3].status === 'done'
            }>
            {busy === 'confirmed' ? msg.actions.polling : msg.actions.waitConfirmed}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => waitForOrderStatus('finalized', 4)}
            disabled={
              !order || busy !== null || steps[3].status !== 'done' || steps[4].status === 'done'
            }>
            {busy === 'finalized' ? msg.actions.polling : msg.actions.waitFinalized}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy === 'create'}>
            {msg.actions.reset}
          </Button>
        </div>
      </div>

      {walletConnectOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => {
            setWalletConnectOpen(false)
            void resetWalletConnect()
          }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="playground-walletconnect-title"
            className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg border bg-background p-4 shadow-xl sm:p-5"
            onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div id="playground-walletconnect-title" className="text-sm font-semibold">
                  {msg.walletConnect.heading}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {!walletConnectProjectId
                    ? msg.walletConnect.missingProjectId
                    : walletConnectAvailable
                      ? msg.walletConnect.hint
                      : msg.walletConnect.noEvm}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setWalletConnectOpen(false)
                  void resetWalletConnect()
                }}>
                {msg.walletConnect.close}
              </Button>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,300px)_minmax(260px,1fr)]">
              <div className="space-y-2">
                {WalletConnectWallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    type="button"
                    className="flex min-h-14 w-full items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!walletConnectProjectId || !walletConnectAvailable}
                    onClick={() => void connectWalletConnect(wallet)}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background text-xs font-semibold">
                      {wallet.name.slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{wallet.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {wallet.links?.universal
                          ? msg.walletConnect.deepLink
                          : msg.walletConnect.scanQr}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {msg.walletConnect.qrTitle}
                </div>
                <div className="mx-auto flex aspect-square w-full max-w-64 items-center justify-center rounded-md border bg-white p-3">
                  {walletConnectQrCode ? (
                    <img
                      src={walletConnectQrCode}
                      alt={msg.walletConnect.qrAlt}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="px-3 text-center text-xs text-muted-foreground">
                      {walletConnectState.status === 'connecting'
                        ? msg.walletConnect.waitingUri
                        : msg.walletConnect.chooseWallet}
                    </div>
                  )}
                </div>
                {walletConnectState.status === 'uri_ready' ? (
                  <div className="space-y-2">
                    <div className="max-h-20 overflow-y-auto break-all rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                      {walletConnectState.uri}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <CopyButton
                        value={walletConnectState.uri}
                        copyLabel={msg.walletConnect.copyUri}
                        copiedLabel={msg.manual.copied}
                      />
                      {walletConnectState.selectedWallet?.links?.native ? (
                        <a
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                          href={walletLink(
                            walletConnectState.selectedWallet.links.native,
                            walletConnectState.uri,
                          )}>
                          {msg.walletConnect.openApp}
                        </a>
                      ) : null}
                      {walletConnectState.selectedWallet?.links?.universal ? (
                        <a
                          className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                          href={walletLink(
                            walletConnectState.selectedWallet.links.universal,
                            walletConnectState.uri,
                          )}
                          target="_blank"
                          rel="noreferrer">
                          {msg.walletConnect.openUniversal}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {walletConnectError || walletConnectState.status === 'failed' ? (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {walletConnectError ||
                  (walletConnectState.status === 'failed'
                    ? walletConnectState.error.message
                    : undefined)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {order && steps[1].status !== 'done' ? (
        <div className="space-y-3 rounded-lg border bg-background/50 p-4">
          <div className="text-sm font-medium">{msg.manual.heading}</div>
          {order.paymentInstructions.map((instruction) => (
            <div key={`${instruction.chain}:${instruction.address}`} className="space-y-1.5">
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
        dangerouslySetInnerHTML={{ __html: msg.footer }}
      />
    </div>
  )
}
