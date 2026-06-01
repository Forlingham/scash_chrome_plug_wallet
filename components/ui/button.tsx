import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button 设计说明（Chrome 插件版）：
 * - 所有 variant 都走 design token（bg-primary / bg-secondary 等），
 *   颜色由 globals.css 的主题变量统一控制，便于切换主色或主题。
 * - 默认尺寸 sm/default 都收紧了 padding，更适合 360px 宽的 popup。
 *
 * Variant 语义分工（与 logo 紫色匹配）：
 *   - default → 品牌色 purple，主 CTA 用（发送、确认、解锁、保存等）
 *   - success → emerald 实色，仅用于"成功状态"语义按钮（验证通过后的"返回首页"等）
 *   - destructive → red，删除/重置等危险操作
 *   - outline / subtle / ghost → 中性次级
 *
 * - 新增 xs 尺寸（h-7）：用于工具栏图标按钮，避免 h-9 在 popup 里显得太"重"。
 * - focus-visible 走 ring 主色（自动跟随 --ring，目前为 purple）。
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/50",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground hover:border-zinc-700",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-foreground hover:bg-accent hover:text-accent-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
        // 高肯定性 CTA：发送、确认、解锁
        success:
          "bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-400 shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset]",
        // 次级操作：比 secondary 更轻量，常用于工具栏旁的"复制/分享"
        subtle:
          "bg-zinc-800/60 text-zinc-200 hover:bg-zinc-800 hover:text-white",
      },
      size: {
        default: "h-9 px-3.5 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        xs: "h-7 rounded-md gap-1 px-2.5 text-xs has-[>svg]:px-2",
        lg: "h-10 rounded-md px-5 has-[>svg]:px-4",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
