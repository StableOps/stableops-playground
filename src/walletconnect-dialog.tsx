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

const PLACEHOLDER_QR_CODE =
  'data:image/png;base64,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'

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
  const readyUri = state.status === 'uri_ready' ? state.uri : null
  const qrLoading = selectedWallet && !qrCode && state.status !== 'failed'
  const walletHref = appLink && readyUri ? walletLink(appLink, readyUri) : undefined

  return (
    <div
      className="fixed inset-0 z-50 m-0 flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm animate-[walletconnect-backdrop-in_160ms_ease-out_both] sm:items-center sm:p-4"
      onClick={onClose}>
      <style>{`
        @keyframes walletconnect-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes walletconnect-sheet-in {
          from {
            opacity: 0;
            transform: translateY(1.25rem);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (min-width: 640px) {
          @keyframes walletconnect-sheet-in {
            from {
              opacity: 0;
              transform: translateY(0.375rem) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[min(90dvh,calc(100vh-1rem))] w-full sm:max-w-md overflow-hidden rounded-t-2xl border bg-background pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl animate-[walletconnect-sheet-in_220ms_cubic-bezier(0.2,0,0,1)_both] sm:max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:pb-0"
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
                {labels.payWith.replace('{wallet}', selectedWallet.name)}
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
              className={`relative mx-auto aspect-square w-full max-w-60 rounded-2xl border p-4 bg-white`}>
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
              ) : qrLoading ? (
                <>
                  <img
                    src={PLACEHOLDER_QR_CODE}
                    alt=""
                    className="h-full w-full object-contain opacity-90"
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-xl bg-white p-1 shadow-md ring-1 ring-black/5">
                      <WalletIcon wallet={selectedWallet} />
                    </div>
                  </div>
                  <div className="absolute inset-2 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-sm">
                    <Spinner className="size-7 text-foreground" />
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
                  {state.status === 'failed' ? (
                    <span className="text-destructive">{labels.connectFailed}</span>
                  ) : (
                    <Spinner className="size-6 text-foreground" />
                  )}
                </div>
              )}
            </div>

            <p className="mt-5 text-center text-sm font-medium text-foreground">
              {selectedWallet.links
                ? labels.scanWithWallet.replace('{wallet}', selectedWallet.name)
                : labels.scanAnyWallet}
            </p>

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
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors ${
                    walletHref
                      ? 'cursor-pointer hover:bg-primary/90'
                      : 'pointer-events-none cursor-not-allowed opacity-50'
                  }`}
                  aria-disabled={walletHref ? false : true}
                  href={walletHref}
                  {...(appLinkIsUniversal && walletHref
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}>
                  {labels.openWallet.replace('{wallet}', selectedWallet.name)}
                </a>
              ) : null}
              <button
                type="button"
                disabled={!qrCode || state.status !== 'uri_ready'}
                onClick={() => {
                  if (readyUri) void onCopyUri(readyUri)
                }}
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background">
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
