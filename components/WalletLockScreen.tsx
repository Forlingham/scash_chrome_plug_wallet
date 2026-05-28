'use client'

import { useLanguage } from '@/contexts/language-context'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export function WalletLockScreen({ onUnlock }: { onUnlock: (password: string) => boolean }) {
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleUnlock = () => {
    // 任何长度都尝试一次（< 8 也不预先放过/拦截，让后端密码学校验来判定）。
    // 如果后端 onUnlock 抛错（理论上不应该，但 try/catch 兜一下做防御），
    // 一律视为密码错误。
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/logo.jpg-KmKWTogu9C4GGzSeODyNdvCFtQgBWj.jpeg"
            alt="SCASH Logo"
            className="w-16 h-16 rounded-full mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-white">{t('wallet.lock.title')}</h1>
          <p className="text-gray-400 mt-2">{t('wallet.lock.passwordInfo')}</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError('')
              }}
              className="w-full p-4 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
              placeholder={t('wallet.lock.input')}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            onClick={handleUnlock}
            disabled={!password || busy}
            className="w-full p-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg font-medium transition-colors"
          >
            {busy ? '...' : t('wallet.lock.unlock')}
          </button>
        </div>
      </div>
    </div>
  )
}
