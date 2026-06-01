'use client'

// 接收页面（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为保留：
//   - 根据当前钱包地址生成二维码（含可选金额参数）
//   - 复制地址按钮
//
// 视觉/交互的桌面化改造：
//   - 删除 "FIO Request" 占位按钮（之前是 mock 设计）
//   - 删除 navigator.share（桌面 Chrome 不支持，且 popup 弹分享面板体验差）
//     如果用户确实想分享，桌面端的最佳方式就是复制地址
// - 二维码卡片去掉冗余包装，直接 zinc 边框 + 白底（识别度优先）
//   - 加金额预填输入框，使收据二维码可指定金额（保留原参数能力）
// ----------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/contexts/language-context'
import { Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { NAME_TOKEN } from '@/lib/utils'
import { useWalletStore } from '@/stores/wallet-store'
import QRCode from 'qrcode'

interface WalletReceiveProps {
  onNavigate: (view: string) => void
}

export function WalletReceive({ onNavigate }: WalletReceiveProps) {
  const { t } = useLanguage()
  const { toast } = useToast()
  const [requestAmount, setRequestAmount] = useState('')
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const wallet = useWalletStore((state) => state.wallet)
  const coinPrice = useWalletStore((state) => state.coinPrice)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (wallet.address) {
      const qrText = requestAmount ? `${wallet.address}?amount=${requestAmount}` : wallet.address
      generateQRCode(qrText)
    }
  }, [wallet.address, requestAmount])

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopied(true)
      toast({
        title: t('receive.addressCopied'),
        description: t('receive.addressCopiedDesc'),
        variant: 'success',
      })
      // 2 秒后恢复按钮文字
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const generateQRCode = async (text: string) => {
    try {
      const canvas = canvasRef.current
      if (!canvas) return

      await QRCode.toCanvas(canvas, text, {
        width: 220,
        margin: 1,
        // 用 zinc-950 作为前景，与整体配色融合（同时保证扫码识别度）
        color: {
          dark: '#09090b',
          light: '#ffffff',
        },
      })

      const dataUrl = canvas.toDataURL()
      setQrCodeUrl(dataUrl)
    } catch (error) {
      console.error('生成二维码失败:', error)
      toast({
        title: t('common.error'),
        description: t('common.errorDesc'),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* 顶部信息栏 */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">
          {t('common.youHave')}{' '}
          <span className="text-zinc-200 font-mono tabular-nums">{wallet.balance}</span>{' '}
          <span className="text-zinc-500">{NAME_TOKEN}</span>
        </span>
        <span className="text-zinc-500 tabular-nums">
          1 {NAME_TOKEN} ≈ ${coinPrice}
        </span>
      </div>

      {/* QR 卡片 */}
      <Card className="bg-zinc-900">
        <CardContent className="flex flex-col items-center py-2">
          <div className="p-2 rounded-md bg-white">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40 block" />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-xs text-zinc-400">
                …
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 隐藏 canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} width={220} height={220} />

      {/* 钱包地址 */}
      <Card>
        <CardContent className="space-y-2">
          <Label className="text-zinc-400 text-[10px] uppercase tracking-wider">
            {t('receive.address')}
          </Label>
          <div className="rounded-md bg-zinc-950 border border-zinc-800/60 p-2.5">
            <p className="text-[11px] font-mono text-zinc-200 break-all leading-relaxed">
              {wallet.address}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 可选金额（用于生成带金额的二维码） */}
      <Card>
        <CardContent className="space-y-2">
          <Label className="text-zinc-400 text-[10px] uppercase tracking-wider">
            {t('common.amount')} <span className="text-zinc-600 normal-case">({t('common.optional') || 'optional'})</span>
          </Label>
          <div className="relative">
            <Input
              type="number"
              value={requestAmount}
              onChange={(e) => setRequestAmount(e.target.value)}
              placeholder="0"
              className="pr-12 tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              {NAME_TOKEN}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 复制按钮：唯一主操作。
          删除手机版的 "FIO Request" / "Share"，因为：
          - FIO Request 是占位 mock，对桌面用户毫无价值
          - navigator.share() 在桌面 Chrome 不被广泛支持
          桌面端用户期望的就是"复制地址"——直接、明确、可靠。 */}
      <Button onClick={copyAddress} variant="default" className="w-full h-10 gap-2">
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            {t('receive.addressCopied')}
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            {t('common.copy')}
          </>
        )}
      </Button>
    </div>
  )
}
