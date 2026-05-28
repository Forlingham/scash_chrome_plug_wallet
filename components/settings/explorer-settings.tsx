'use client'

// 区块浏览器 / 币价数据源 设置
// 三个 URL：
//   - explorerBaseUrl：富交易历史接口（lib/externalApi.ts 用）
//   - coinPriceUrl：币价接口（lib/api.ts → getCoinPriceApi）
//   - explorerWebUrl：区块浏览器站点本身（onOpenExplorer 跳转用）

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
    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
      <div className="text-center mb-2">
        <Globe className="h-12 w-12 text-purple-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white">{t('settings.explorer')}</h2>
        <p className="text-gray-400 text-sm mt-1">{t('settings.explorerInfo')}</p>
      </div>

      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="px-4 py-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-gray-300">{t('settings.explorer.api')}</Label>
            <p className="text-xs text-gray-500">{t('settings.explorer.apiInfo')}</p>
            <Input
              value={explorerBase}
              onChange={(e) => setExplorerBase(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white font-mono text-sm"
              placeholder="https://explorer.scash.network/api/explorer"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">{t('settings.explorer.price')}</Label>
            <p className="text-xs text-gray-500">{t('settings.explorer.priceInfo')}</p>
            <Input
              value={priceUrl}
              onChange={(e) => setPriceUrl(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white font-mono text-sm"
              placeholder="https://explorer.scash.network/api/explorer/home/overview"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">{t('settings.explorer.web')}</Label>
            <p className="text-xs text-gray-500">{t('settings.explorer.webInfo')}</p>
            <Input
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white font-mono text-sm"
              placeholder="https://explorer.scash.network/"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleReset} variant="outline" className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700">
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('common.reset')}
        </Button>
        <Button onClick={handleSave} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
          {t('common.save')}
        </Button>
      </div>

      <Button onClick={onBack} variant="outline" className="w-full border-gray-600 text-gray-300 hover:bg-gray-700">
        {t('common.back')}
      </Button>
    </div>
  )
}
