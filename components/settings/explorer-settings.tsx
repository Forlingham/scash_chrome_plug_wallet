'use client'

// 区块浏览器 / 币价数据源 设置（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为完全保留：
//   - explorerBaseUrl: 富交易历史接口（lib/externalApi.ts）
//   - coinPriceUrl:    币价接口（lib/api.ts → getCoinPriceApi）
//   - explorerWebUrl:  区块浏览器网站本身（onOpenExplorer 跳转）
//
// 视觉：移除手机风格的大居中图标头，改为紧凑的标题行 + 单卡设置项。
// ----------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Globe, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { useExplorerConfigStore } from '@/stores/explorer-config-store'
import { useToast } from '@/hooks/use-toast'

interface ExplorerSettingsProps {
  onBack: () => void
}

export function ExplorerSettings({ onBack }: ExplorerSettingsProps) {
  const { t } = useLanguage()
  const { toast } = useToast()

  const explorerBaseUrl = useExplorerConfigStore((s) => s.explorerBaseUrl)
  const coinPriceUrl = useExplorerConfigStore((s) => s.coinPriceUrl)
  const explorerWebUrl = useExplorerConfigStore((s) => s.explorerWebUrl)
  const setExplorerBaseUrl = useExplorerConfigStore((s) => s.setExplorerBaseUrl)
  const setCoinPriceUrl = useExplorerConfigStore((s) => s.setCoinPriceUrl)
  const setExplorerWebUrl = useExplorerConfigStore((s) => s.setExplorerWebUrl)
  const resetToDefault = useExplorerConfigStore((s) => s.resetToDefault)

  const [explorerBase, setExplorerBase] = useState(explorerBaseUrl)
  const [priceUrl, setPriceUrl] = useState(coinPriceUrl)
  const [webUrl, setWebUrl] = useState(explorerWebUrl)

  useEffect(() => {
    setExplorerBase(explorerBaseUrl)
    setPriceUrl(coinPriceUrl)
    setWebUrl(explorerWebUrl)
  }, [explorerBaseUrl, coinPriceUrl, explorerWebUrl])

  const handleSave = () => {
    setExplorerBaseUrl(explorerBase)
    setCoinPriceUrl(priceUrl)
    setExplorerWebUrl(webUrl)
    toast({ title: t('common.success') })
  }

  const handleReset = () => {
    resetToDefault()
    toast({ title: t('common.success') })
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* 紧凑标题区（替代大圆图标） */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-purple-500/10 ring-1 ring-purple-500/30 flex items-center justify-center shrink-0">
          <Globe className="h-4 w-4 text-purple-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100 leading-tight">
            {t('settings.explorer')}
          </h2>
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
            {t('settings.explorerInfo')}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <FieldGroup
            label={t('settings.explorer.api')}
            hint={t('settings.explorer.apiInfo')}
            value={explorerBase}
            onChange={setExplorerBase}
            placeholder="https://explorer.scash.network/api/explorer"
          />
          <FieldGroup
            label={t('settings.explorer.price')}
            hint={t('settings.explorer.priceInfo')}
            value={priceUrl}
            onChange={setPriceUrl}
            placeholder="https://explorer.scash.network/api/explorer/home/overview"
          />
          <FieldGroup
            label={t('settings.explorer.web')}
            hint={t('settings.explorer.webInfo')}
            value={webUrl}
            onChange={setWebUrl}
            placeholder="https://explorer.scash.network/"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleReset} variant="outline" size="sm" className="flex-1">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          {t('common.reset')}
        </Button>
        <Button onClick={handleSave} variant="default" size="sm" className="flex-1">
          {t('common.save')}
        </Button>
      </div>

      <Button onClick={onBack} variant="ghost" size="sm" className="w-full">
        {t('common.back')}
      </Button>
    </div>
  )
}

// 抽出的输入组：标签 + 提示 + 输入框，保持视觉一致
function FieldGroup({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-zinc-300 text-xs">{label}</Label>
      <p className="text-[10px] text-zinc-500 leading-relaxed">{hint}</p>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-[11px]"
        placeholder={placeholder}
      />
    </div>
  )
}
