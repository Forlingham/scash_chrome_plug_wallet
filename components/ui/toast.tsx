"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Toast 通知样式（Chrome 插件桌面化重塑）
 * - 旧：紫粉渐变 + 紫色阴影（移动端 App 风格）
 * - 新：实色 zinc-900 + 左侧 2px 主题色强调线（purple/emerald/red/amber）
 *   purple = 默认 / 信息（与品牌色一致）
 *   emerald = 成功
 *   red = 错误
 *   amber = 警告
 *
 * Viewport 已经针对 popup 适配：
 *   sm:right-4 + max-w-[320px]，确保 360px 窗口里 toast 不会贴边或被截断。
 */

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed top-2 left-2 right-2 z-[100] flex max-h-screen w-auto flex-col gap-1.5 p-0 sm:top-2 sm:left-auto sm:right-2 sm:max-w-[320px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-2 overflow-hidden rounded-lg border bg-zinc-900 p-3 pr-8 shadow-lg backdrop-blur-md transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-top-full",
  {
    variants: {
      variant: {
        // 默认：中性灰 + 左侧 purple 品牌强调线
        default:
          "border-zinc-800 text-zinc-100 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-purple-500",
        // 错误：红色描边 + 左侧红色强调线
        destructive:
          "border-red-500/30 text-zinc-100 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-red-500",
        // 成功：emerald 描边（功能性正向）
        success:
          "border-emerald-500/30 text-zinc-100 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-emerald-500",
        // 警告：琥珀色
        warning:
          "border-amber-500/30 text-zinc-100 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-amber-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-transparent px-2.5 text-xs font-medium transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-1.5 top-1.5 rounded-sm p-1 text-zinc-400 opacity-70 transition-all hover:opacity-100 hover:text-zinc-100 hover:bg-zinc-800 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-zinc-500",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-3 w-3" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-xs font-semibold text-zinc-100 leading-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-[11px] text-zinc-400 leading-relaxed mt-0.5", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
