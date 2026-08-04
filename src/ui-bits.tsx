'use client'

import { useCallback, useState } from 'react'

import { Check, Copy, Loader2 } from 'lucide-react'

import { Badge, cn } from './ui'

export type Step = {
  label: string
  status: 'idle' | 'pending' | 'done' | 'error'
  detail?: string
  // 可选的跳转链接（如第 2 步支付成功后的区块浏览器交易页）。
  link?: { href: string; label: string }
}

// 内联复制按钮：样式与 Web 端一致，复制后短暂显示对勾反馈。
export function CopyButton({
  value,
  copyLabel,
  copiedLabel,
  className,
}: {
  value: string
  copyLabel: string
  copiedLabel: string
  className?: string
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
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? copiedLabel : copyLabel}
      className={cn(
        'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}>
      {copied ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  )
}

export function StatusBadge({ status }: { status: Step['status'] }) {
  if (status === 'done') return <Badge variant="default">done</Badge>
  if (status === 'pending') return <Badge variant="secondary">running</Badge>
  if (status === 'error') return <Badge variant="destructive">error</Badge>
  return <Badge variant="outline">idle</Badge>
}

// 内联加载圈：跟随 currentColor，由调用方用 text-* 着色（WalletConnect 弹窗用品牌 teal）。
export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />
}
