'use client'

// 钱包锁屏（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为完全保留：
//   - 任意长度密码都尝试调用 onUnlock，由密码学校验层判定（不预先拦截）
//   - 异常一律视为'密码错误'，避免泄露内部错误信息
//
// 视觉重塑：
//   - 远程 logo（vercel-storage）替换为本地 /logo.png，离线可用
//   - 紫色按钮/聚焦色 → 品牌色 purple（与 SCASH logo 紫色相呼应）
//   - 紧凑布局，输入框居中可读，配 Lock 图标暗示场景
// ----------------------------------------------------------------------

import { useLanguage } from '@/contexts/language-context'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function WalletLockScreen({ onUnlock }: { onUnlock: (password: string) => boolean }) {
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleUnlock = () => {
    if (!password) {
      setError(t('wallet.lock.error'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const isUnlocked = onUnlock(password)
      if (!isUnlocked) {
        setError(t('wallet.lock.error'))
      }
    } catch (e) {
      console.warn('解锁过程异常：', e)
      setError(t('wallet.lock.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* 主体居中 */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full space-y-4">
          {/* Hero */}
          <div className="text-center space-y-2">
            <div className="relative inline-block">
              <img
                src="/logo.png"
                alt="SCASH"
                className="w-16 h-16 rounded-full mx-auto ring-1 ring-zinc-800"
              />
              {/* 锁图标徽章，叠加在 logo 右下，强化"已锁定"语义 */}
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500/15 ring-2 ring-background flex items-center justify-center">
                <Lock className="h-3 w-3 text-amber-400" />
              </div>
            </div>
            <h1 className="text-base font-semibold text-zinc-100">{t('wallet.lock.title')}</h1>
            <p className="text-[11px] text-zinc-400 leading-relaxed px-2">
              {t('wallet.lock.passwordInfo')}
            </p>
          </div>

          {/* 输入区 */}
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError('')
                }}
                placeholder={t('wallet.lock.input')}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                autoFocus
                className="h-10 pr-9 text-sm"
                aria-invalid={!!error}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* 错误提示 */}
            {error && (
              <p className="text-[11px] text-red-400 text-center" role="alert">
                {error}
              </p>
            )}

            <Button
              onClick={handleUnlock}
              disabled={!password || busy}
              variant="default"
              className="w-full h-10"
            >
              {busy ? (
                <span className="inline-block w-4 h-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-950" />
              ) : (
                t('wallet.lock.unlock')
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
