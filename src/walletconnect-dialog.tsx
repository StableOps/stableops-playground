'use client'

import { useCallback, useState, type ReactNode } from 'react'

import type { WalletConnectControllerState } from '@stableops/wallet-sdk'

import { messages, type Locale } from './messages'
import { Spinner } from './ui-bits'
import { WalletIcon, type PlaygroundWallet } from './wallets'

// WalletConnect 支付对话框（纯展示组件）：两步单栏流——先选钱包，选中后进二维码页。
// 连接生命周期（controller / display_uri / 单飞 connect / 断开复用）全部留在调用方（playground.tsx），
// 本组件只负责渲染 + 把交互回调上抛，因此可原样搬到 apps/checkout（仅需替换 labels / wallets 来源）。

type WalletConnectLabels = (typeof messages)[Locale]['walletConnect']

export type WalletConnectDialogProps = {
  // 是否可见（调用方计算：打开且未被签名流程临时隐藏）。
  open: boolean
  labels: WalletConnectLabels
  // 复制成功的反馈文案（取自 manual.copied，与手动转账复用同一份）。
  copiedLabel: string
  // 未传 projectId 时禁用并提示；available=false 表示当前订单无 EVM 指令。
  projectId: string | undefined
  available: boolean
  wallets: PlaygroundWallet[]
  // 当前选中的钱包：null=列表页，非空=该钱包的二维码页。
  selectedWallet: PlaygroundWallet | null
  state: WalletConnectControllerState
  qrCode: string | null
  error: string | null
  onSelectWallet: (wallet: PlaygroundWallet) => void
  onBack: () => void
  onClose: () => void
}

function walletLink(prefix: string, uri: string): string {
  return `${prefix}${encodeURIComponent(uri)}`
}

export function WalletConnectDialog({
  open,
  labels,
  copiedLabel,
  projectId,
  available,
  wallets,
  selectedWallet,
  state,
  qrCode,
  error,
  onSelectWallet,
  onBack,
  onClose,
}: WalletConnectDialogProps): ReactNode {
  // 复制链接的「已复制」反馈（自包含，避免再依赖 ui-bits 的小号 CopyButton——这里要 checkout 同款大按钮）。
  const [copied, setCopied] = useState(false)
  const onCopyUri = useCallback(async (uri: string) => {
    try {
      await navigator.clipboard.writeText(uri)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 剪贴板不可用时静默：链接仍可手动选中复制 */
    }
  }, [])

  if (!open) return null

  // 「打开 App」深链：优先原生 scheme，回退 universal link（无原生时才用 https 链）。
  const appLink = selectedWallet?.links?.native ?? selectedWallet?.links?.universal ?? null
  const appLinkIsUniversal =
    !selectedWallet?.links?.native && Boolean(selectedWallet?.links?.universal)

  return (
    <div
      className="fixed inset-0 z-50 m-0 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] relative w-full max-w-md overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}>
        {/* 顶栏：列表页=品牌图标 + 标题；二维码页=返回 + 选中钱包 */}
        <div className="flex items-center justify-center gap-3 px-6 pt-6">
          {selectedWallet ? (
            <>
              <button
                type="button"
                aria-label={labels.back}
                onClick={onBack}
                className="absolute left-6 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden>
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0 flex-1 truncate text-center font-medium">
                {selectedWallet.name}
              </div>
            </>
          ) : (
            <div className="min-w-0 flex-1 space-y-1 text-center">
              <div className="font-medium">{labels.heading}</div>
            </div>
          )}
          <button
            type="button"
            aria-label={labels.close}
            onClick={onClose}
            className="absolute right-6 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {selectedWallet ? (
          /* 二维码页：QR（中心叠钱包 logo）→ 指引 → 分隔 → 操作 */
          <div className="p-6">
            <div
              className={`relative mx-auto aspect-square w-full max-w-60 rounded-2xl border p-4 ${
                qrCode ? 'bg-white' : 'bg-muted/40'
              }`}>
              {qrCode ? (
                <>
                  <img src={qrCode} alt={labels.qrAlt} className="h-full w-full object-contain" />
                  {/* 居中钱包 logo：白底圆角 chip；QR 用 H 级纠错容得下中心约 20% 遮挡 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-xl bg-white p-1 shadow-md ring-1 ring-black/5">
                      <WalletIcon wallet={selectedWallet} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
                  {state.status === 'failed' ? (
                    <span className="text-destructive">{labels.connectFailed}</span>
                  ) : (
                    <Spinner className="size-6 text-[#0F766E]" />
                  )}
                </div>
              )}
            </div>

            <p className="mt-5 text-center text-sm font-medium text-foreground">
              {selectedWallet.links
                ? labels.scanWithWallet.replace('{wallet}', selectedWallet.name)
                : labels.scanAnyWallet}
            </p>

            {state.status === 'uri_ready' ? (
              <>
                {appLink ? (
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">{labels.or}</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                ) : (
                  <div className="h-4" />
                )}
                <div className="flex gap-2">
                  {appLink ? (
                    <a
                      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0F766E]"
                      href={walletLink(appLink, state.uri)}
                      {...(appLinkIsUniversal ? { target: '_blank', rel: 'noreferrer' } : {})}>
                      {labels.openWallet.replace('{wallet}', selectedWallet.name)}
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onCopyUri(state.uri)}
                    className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    {copied ? (
                      <>
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4 text-[#0F766E]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        {copiedLabel}
                      </>
                    ) : (
                      labels.copyUri
                    )}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          /* 钱包列表页：3 列九宫格，每格 图标 + 名称 */
          <div className="grid grid-cols-3 gap-y-2 gap-x-4 overflow-y-auto p-4">
            {wallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-transparent px-2 py-4 text-center transition-colors hover:border-[#14B8A6]/40 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!projectId || !available}
                onClick={() => onSelectWallet(wallet)}>
                <WalletIcon wallet={wallet} />
                <span className="w-full truncate text-xs font-medium">{wallet.name}</span>
              </button>
            ))}
          </div>
        )}

        {error || state.status === 'failed' ? (
          <div className="mx-5 mb-5 text-center rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error || (state.status === 'failed' ? state.error.message : undefined)}
          </div>
        ) : null}
      </div>
    </div>
  )
}
