'use client'

import { useState, useEffect } from 'react'
import { WalletSetup } from '@/components/wallet-setup'
import { WalletDashboard } from '@/components/wallet-dashboard'
import { LanguageProvider } from '@/contexts/language-context'
import { useWalletActions, useWalletStore } from '@/stores/wallet-store'
import { WalletLockScreen } from '@/components/WalletLockScreen'

export default function Home() {
  const { wallet, isLocked } = useWalletStore()
  const { lockWallet, unlockWallet } = useWalletActions()
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    // 不论 wallet 是否已存在，初始化拉完都关 loading
    setIsLoading(false)
  }, [wallet])

  const handleWalletCreated = () => {
    // 钱包创建成功后由 wallet-setup 内部 setWallet，触发上面 useEffect
  }

  const handleLogout = () => {
    lockWallet()
  }

  const handleUnlock = (password: string) => {
    return unlockWallet(password)
  }

  if (isLoading) {
    return (
      <div className="h-full w-full bg-background flex items-center justify-center">
        {/* 加载指示器：purple 品牌色环，小尺寸符合插件 */}
        <div className="h-6 w-6 rounded-full border-2 border-zinc-800 border-t-purple-500 animate-spin" />
      </div>
    )
  }

  return (
    <LanguageProvider>
      <div className="h-full w-full bg-background text-foreground">
        {!wallet.address ? (
          <WalletSetup onWalletCreated={handleWalletCreated} />
        ) : isLocked ? (
          <WalletLockScreen onUnlock={handleUnlock} />
        ) : (
          <WalletDashboard onLogout={handleLogout} />
        )}
      </div>
    </LanguageProvider>
  )
}
