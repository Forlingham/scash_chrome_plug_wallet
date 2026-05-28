'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/**
 * 自定义开关（兼容用，主推 ui/switch.tsx 的 Radix 版本）
 * 配色与全局主题一致：开 purple-600（品牌色）/ 关 zinc-700。
 */
interface CustomSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
  disabled?: boolean
}

export function CustomSwitch({
  checked,
  onCheckedChange,
  className,
  disabled = false,
}: CustomSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-8 min-h-5 max-h-5 min-w-8 max-w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 flex-shrink-0',
        checked ? 'bg-purple-600' : 'bg-zinc-700',
        className,
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
