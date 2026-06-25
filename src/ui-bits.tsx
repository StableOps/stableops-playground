'use client'

import { useCallback, useState } from 'react'

import { Badge, Button } from './ui'
import { Loader2 } from 'lucide-react'

export type Step = {
  label: string
  status: 'idle' | 'pending' | 'done' | 'error'
  detail?: string
  // 可选的跳转链接（如第 2 步支付成功后的区块浏览器交易页）。
  link?: { href: string; label: string }
}

// 收款地址旁的复制按钮：写入剪贴板后短暂显示「已复制」再回落。
export function CopyButton({
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
