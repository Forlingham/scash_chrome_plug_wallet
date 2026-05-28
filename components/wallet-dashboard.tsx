'use client'

// 钱包总容器（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为：
//   - 在 home view 时不渲染外部 header（home 自己有工具栏）
//   - 在其他 view 时渲染统一的 48px 顶部 header（返回 + 标题 + 语言切换）
//   - 22 秒定时器拉取链上数据 / 余额 / 币价
//
// 视觉/交互重塑：
//   - 外层容器从 min-h-screen 改为 h-full（适配 popup 600px 固定高度）
//   - header 高度由 80px 缩到 48px，与 home 工具栏视觉对齐
//   - 去除紫色渐变标题，改用 zinc-100 + emerald 强调点
//   - "功能即将上线" 占位页改造为简洁的居中提示
// ----------------------------------------------------------------------

import { LanguageSelector } from '@/components/language-selector'
import { Button } from '@/components/ui/button'
import { WalletAssets } from '@/components/wallet-assets'
import { WalletEngrave } from '@/components/wallet-engrave'
import { WalletHome } from '@/components/wallet-home'
import { WalletReceive } from '@/components/wallet-receive'
import { WalletSend } from '@/components/wallet-send'
import { WalletSettings } from '@/components/wallet-settings'
import { useLanguage } from '@/contexts/language-context'
import { useWalletActions } from '@/stores/wallet-store'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

interface WalletDashboardProps {
  onLogout: () => void
}

export function WalletDashboard({ onLogout }: WalletDashboardProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('home')
  const [currentView, setCurrentView] = useState('home')
  const { setUpdateBlockchaininfo, setUpdateBalance, setUpdateCoinPrice } = useWalletActions()

  const initGetWalletInfo = async () => {
    await Promise.all([
      setUpdateBlockchaininfo(),
      setUpdateBalance(),
      setUpdateCoinPrice().catch(() => undefined),
    ])
  }

  useEffect(() => {
    initGetWalletInfo()
    const interval = setInterval(() => {
      initGetWalletInfo()
    }, 1000 * 22)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNavigation = (view: string) => {
    setCurrentView(view)
    if (['home', 'assets', 'buy', 'sell', 'trade'].includes(view)) {
      setActiveTab(view)
    }
  }

  const handleLockWallet = () => {
    onLogout()
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'home':
        return <WalletHome onNavigate={handleNavigation} />
      case 'assets':
        return <WalletAssets onNavigate={handleNavigation} />
      case 'receive':
        return <WalletReceive onNavigate={handleNavigation} />
      case 'send':
        return <WalletSend onNavigate={handleNavigation} />
      case 'engrave':
        return <WalletEngrave onNavigate={handleNavigation} />
      case 'settings':
        return <WalletSettings onNavigate={handleNavigation} onLockWallet={handleLockWallet} />
      case 'buy':
      case 'sell':
      case 'trade':
        return (
          <div className="h-full flex items-center justify-center px-4">
            <div className="text-center max-w-[260px]">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="h-5 w-5 text-emerald-400" />
              </div>
              <h2 className="text-base font-semibold text-zinc-100 mb-1">
                {t('common.featureComingSoon')}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                {t('common.featureComingSoonDesc')}
              </p>
              <Button
                onClick={() => handleNavigation('home')}
                variant="outline"
                size="sm"
              >
                {t('send.backToHome')}
              </Button>
            </div>
          </div>
        )
      default:
        return <WalletHome onNavigate={handleNavigation} />
    }
  }

  // 非 home 页面的标题
  const viewTitle = (() => {
    switch (currentView) {
      case 'receive':
        return t('receive.title')
      case 'send':
        return t('action.send')
      case 'engrave':
        return t('action.engrave')
      case 'assets':
        return t('nav.assets')
      case 'settings':
        return t('settings.title')
      case 'buy':
        return t('action.buy') || t('common.featureComingSoon')
      case 'sell':
        return t('action.sell') || t('common.featureComingSoon')
      case 'trade':
        return t('action.trade')
      default:
        return ''
    }
  })()

  const isHome = currentView === 'home'

  return (
    <div className="h-full w-full flex flex-col bg-background relative overflow-hidden">
      {/* ========== 非 home 页面的统一顶部 header（48px 高） ========== */}
      {!isHome && (
        <div className="absolute top-0 left-0 right-0 z-40 h-12 bg-background/95 backdrop-blur-md border-b border-zinc-800/60">
          <div className="flex items-center justify-between h-full px-2">
            <div className="flex items-center gap-1 min-w-0">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-zinc-400 hover:text-zinc-100"
                onClick={() => handleNavigation('home')}
                aria-label={t('common.back')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-sm font-semibold text-zinc-100 truncate">{viewTitle}</h1>
            </div>
            <LanguageSelector />
          </div>
        </div>
      )}

      {/* ========== 视图主体 ==========
          home 走 absolute header（自己实现顶部工具栏），所以 pt-0；
          其他视图被 dashboard 的 48px header 占位，主体 pt-12。
      */}
      <div className={`flex-1 min-h-0 ${isHome ? '' : 'pt-12'} relative`}>
        {renderCurrentView()}
      </div>
    </div>
  )
}
