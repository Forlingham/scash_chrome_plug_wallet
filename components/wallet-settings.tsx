'use client'

// 钱包设置（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为完全保留：
//   - 改密码（验旧密 → 解密钱包 → 用新密 hash 重加密 → 下载新文件）
//   - 备份（验密 → 显示助记词 → 复制 / 下载加密文件）
//   - 安全状态查看（加密、助记词隔离）
//   - RPC 节点 / 区块浏览器子设置入口
//   - 帮助 / 联系
//   - 重置（清空 localStorage 但保留 RPC / 浏览器 / 语言偏好）
//
// 视觉：去掉每页的"大紫色图标头"，改为统一的 32px 紧凑标题；
//      所有按钮 / 卡片走 token，重要 CTA 用品牌色 purple（default variant）；
//      捐赠地址表格紧凑化，加复制反馈。
// ----------------------------------------------------------------------

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/contexts/language-context'
import {
  Lock,
  Key,
  Download,
  Globe,
  Shield,
  HelpCircle,
  LogOut,
  Eye,
  EyeOff,
  Copy,
  AlertTriangle,
  CheckCircle2,
  Server,
  ChevronRight,
  Heart,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

import { decryptWallet, downloadWalletFile, encryptWallet, passwordMD5, VERSION } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useWalletStore, useWalletActions, type WalletInfo } from '@/stores/wallet-store'
import { RpcNodesSettings } from '@/components/settings/rpc-nodes-settings'
import { ExplorerSettings } from '@/components/settings/explorer-settings'

interface WalletSettingsProps {
  onNavigate: (view: string) => void
  onLockWallet: () => void
}

type SettingsView =
  | 'main'
  | 'changePassword'
  | 'backup'
  | 'security'
  | 'help'
  | 'rpcNodes'
  | 'explorer'

export function WalletSettings({ onNavigate, onLockWallet }: WalletSettingsProps) {
  const { t } = useLanguage()
  const { toast } = useToast()
  const [currentView, setCurrentView] = useState<SettingsView>('main')
  const [showPassword, setShowPassword] = useState(false)
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  })
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [verifyPassword, setVerifyPassword] = useState('')
  const wallet = useWalletStore((state) => state.wallet)
  const { setWallet } = useWalletActions()
  const [mockMnemonic, setMockMnemonic] = useState('')

  const handlePasswordChange = () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast({
        title: t('common.error'),
        description: t('settings.missingInformation'),
        variant: 'destructive',
      })
      return
    }
    if (passwords.new !== passwords.confirm) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordMismatch'),
        variant: 'destructive',
      })
      return
    }
    if (passwords.new.length < 8) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordTooShort'),
        variant: 'destructive',
      })
      return
    }
    const walletObj = decryptWallet(wallet.encryptedWallet, passwords.current)
    if (!walletObj.isSuccess) {
      toast({
        title: t('common.error'),
        description: t('settings.passwordError'),
        variant: 'destructive',
      })
      return
    }
    const passwordHash = passwordMD5(passwords.new)
    walletObj.wallet!.passwordHash = passwordHash
    const walletEncrypt = encryptWallet(walletObj.wallet!, passwordHash)

    downloadWalletFile(walletEncrypt)

    const walletInfo: WalletInfo = {
      isHasWallet: true,
      address: wallet.address,
      balance: wallet.balance,
      lockBalance: wallet.lockBalance,
      memPoolBalance: wallet.memPoolBalance,
      usableBalance: wallet.usableBalance,
      encryptedWallet: walletEncrypt,
    }
    setWallet(walletInfo)
    toast({ title: t('common.success'), description: t('settings.passwordChanged') })
    setPasswords({ current: '', new: '', confirm: '' })
    setCurrentView('main')
  }

  const handClickReveal = () => setShowPasswordDialog(true)

  const handlePasswordVerify = async () => {
    if (!verifyPassword.trim()) {
      toast({
        title: t('common.error'),
        description: t('settings.inputPassword'),
        variant: 'destructive',
      })
      return
    }
    try {
      const walletObj = decryptWallet(wallet.encryptedWallet, verifyPassword)
      if (!walletObj.isSuccess) {
        toast({
          title: t('common.error'),
          description: t('settings.passwordError'),
          variant: 'destructive',
        })
        return
      }
      setShowMnemonic(true)
      setShowPasswordDialog(false)
      setVerifyPassword('')
      setMockMnemonic(walletObj.wallet!.mnemonic)
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('settings.verifyFailed'),
        variant: 'destructive',
      })
    }
  }

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mockMnemonic)
    toast({
      title: t('settings.copyMnemonicSuccess'),
      description: t('settings.copyMnemonicDesc'),
    })
  }

  const downloadBackup = () => {
    downloadWalletFile(wallet.encryptedWallet)
    toast({
      title: t('settings.backupDownloaded'),
      description: t('settings.backupDownloadedDesc'),
    })
  }

  const onResetWallet = () => {
    // 修复 1: 保留 RPC / 区块浏览器 / 语言偏好（用户期望重置只清钱包身份与缓存）
    const PRESERVED_KEYS = ['scash-rpc-config', 'scash-explorer-config', 'language-storage']
    const preserved: Record<string, string | null> = {}
    for (const key of PRESERVED_KEYS) {
      preserved[key] = localStorage.getItem(key)
    }

    localStorage.clear()

    for (const [key, value] of Object.entries(preserved)) {
      if (value !== null) localStorage.setItem(key, value)
    }

    window.location.reload()
  }

  const handleConfirmReset = () => {
    // 修复 2: setTimeout 让 dialog 关闭的 state commit 先完成再 reload，避免 React 警告
    setShowResetDialog(false)
    setTimeout(() => onResetWallet(), 0)
  }

  // ====================================================================
  // 子视图：RPC / 浏览器 设置
  // ====================================================================
  if (currentView === 'rpcNodes') {
    return <RpcNodesSettings onBack={() => setCurrentView('main')} />
  }

  if (currentView === 'explorer') {
    return <ExplorerSettings onBack={() => setCurrentView('main')} />
  }

  // ====================================================================
  // 子视图：修改密码
  // ====================================================================
  if (currentView === 'changePassword') {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
        <SubHeader
          icon={<Key className="h-4 w-4 text-purple-400" />}
          title={t('settings.changePassword')}
          description={t('settings.changePasswordInfo2')}
        />

        <Card>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">
                {t('settings.currentPassword')}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  className="pr-9 text-xs"
                  placeholder={t('settings.currentPassword')}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-100"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide' : 'Show'}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">{t('settings.newPassword')}</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                className="text-xs"
                placeholder={t('wallet.passwordInput')}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">
                {t('settings.confirmNewPassword')}
              </Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                className="text-xs"
                placeholder={t('settings.confirmNewPassword')}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => setCurrentView('main')} variant="outline" size="sm" className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handlePasswordChange}
            variant="default"
            size="sm"
            className="flex-1"
            disabled={!passwords.current || !passwords.new || !passwords.confirm}
          >
            {t('settings.changePassword')}
          </Button>
        </div>
      </div>
    )
  }

  // ====================================================================
  // 子视图：备份
  // ====================================================================
  if (currentView === 'backup') {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
        <SubHeader
          icon={<Download className="h-4 w-4 text-purple-400" />}
          title={t('settings.backup')}
          description={t('settings.backupSubtitle')}
        />

        <Card>
          <CardContent className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <h3 className="text-xs text-zinc-100 font-medium">{t('wallet.saveRecovery')}</h3>
            </div>

            <div className="relative">
              <div
                className={`grid grid-cols-3 gap-1 p-2.5 bg-zinc-950 rounded-md border border-zinc-800/60 ${
                  !showMnemonic ? 'blur-sm select-none' : ''
                }`}
              >
                {mockMnemonic.split(' ').map((word, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1 px-1.5 py-1 bg-zinc-900 rounded text-[11px] border border-zinc-800/40"
                  >
                    <span className="text-zinc-500 text-[9px] font-mono">{index + 1}.</span>
                    <span className="text-zinc-100">{word}</span>
                  </div>
                ))}
              </div>

              {!showMnemonic && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button onClick={handClickReveal} variant="default" size="sm">
                    <Eye className="h-3.5 w-3.5" />
                    {t('wallet.clickReveal')}
                  </Button>
                </div>
              )}
            </div>

            {showMnemonic && (
              <Button onClick={copyMnemonic} variant="outline" size="sm" className="w-full">
                <Copy className="h-3.5 w-3.5" />
                {t('common.copy')}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              <h3 className="text-xs text-zinc-100 font-medium">
                {t('settings.backupConfirmTitle')}
              </h3>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {t('settings.backupConfirmInfo')}
            </p>
            <Button onClick={downloadBackup} variant="default" size="sm" className="w-full">
              <Download className="h-3.5 w-3.5" />
              {t('settings.backupConfirm')}
            </Button>
          </CardContent>
        </Card>

        <Button onClick={() => setCurrentView('main')} variant="ghost" size="sm" className="w-full">
          {t('common.back')}
        </Button>

        <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-1.5 text-sm">
                <Lock className="h-4 w-4 text-purple-400" />
                {t('settings.verifyPassword')}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[11px]">
                {t('settings.verifyPasswordInfo')}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Label htmlFor="verify-password" className="text-zinc-300 text-xs">
                {t('settings.password')}
              </Label>
              <Input
                id="verify-password"
                type="password"
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                placeholder={t('settings.inputPassword')}
                className="text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handlePasswordVerify()
                }}
                autoFocus
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setShowPasswordDialog(false)
                  setVerifyPassword('')
                }}
              >
                {t('common.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePasswordVerify}
                className="bg-purple-600 text-white hover:bg-purple-500"
              >
                {t('common.verify')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ====================================================================
  // 子视图：安全
  // ====================================================================
  if (currentView === 'security') {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
        <SubHeader
          icon={<Shield className="h-4 w-4 text-purple-400" />}
          title={t('settings.security.title')}
          description={t('settings.security.subtitle')}
        />

        <Card>
          <CardContent className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs text-zinc-100 font-medium leading-tight">
                {t('settings.security.encrypted')}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                {t('settings.security.encryptedDesc')}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs text-zinc-100 font-medium leading-tight">
                {t('settings.security.recoverySecured')}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                {t('settings.security.recoverySecuredDesc')}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <RowActionButton
            icon={<Key className="h-3.5 w-3.5" />}
            label={t('settings.changePassword')}
            onClick={() => setCurrentView('changePassword')}
          />
          <RowActionButton
            icon={<Download className="h-3.5 w-3.5" />}
            label={t('settings.backup')}
            onClick={() => setCurrentView('backup')}
          />
          <Button
            onClick={onLockWallet}
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
          >
            <Lock className="h-3.5 w-3.5" />
            {t('settings.lock')}
          </Button>
        </div>

        <Button onClick={() => setCurrentView('main')} variant="ghost" size="sm" className="w-full">
          {t('common.back')}
        </Button>
      </div>
    )
  }

  // ====================================================================
  // 子视图：帮助
  // ====================================================================
  if (currentView === 'help') {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
        <SubHeader
          icon={<HelpCircle className="h-4 w-4 text-purple-400" />}
          title={t('settings.help.title')}
          description={t('settings.help.subtitle')}
        />

        <Card>
          <CardContent>
            <div
              className="text-[11px] text-zinc-400 leading-relaxed prose prose-sm max-w-none prose-invert prose-p:my-1 prose-headings:text-zinc-200 prose-a:text-purple-400"
              dangerouslySetInnerHTML={{ __html: t('safety.instructions') }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div
              className="text-[11px] text-zinc-400 leading-relaxed prose prose-sm max-w-none prose-invert prose-p:my-1 prose-headings:text-zinc-200 prose-a:text-purple-400"
              dangerouslySetInnerHTML={{ __html: t('Technical.Overview') }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <h3 className="text-xs text-zinc-100 font-medium">{t('common.contactSupport')}</h3>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {t('common.contactSupportDesc')}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                window.open('https://github.com/Forlingham/scash_chrome_plug_wallet', '_blank')
              }
            >
              {t('common.contactSupportGitHub')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="text-center space-y-1">
            <h3 className="text-xs text-zinc-100 font-medium">{t('wallet.title')}</h3>
            <p className="text-[10px] text-zinc-500 font-mono">v{VERSION}</p>
            <p className="text-[10px] text-zinc-600 leading-relaxed">{t('common.walletInfo')}</p>
          </CardContent>
        </Card>

        <Button onClick={() => setCurrentView('main')} variant="ghost" size="sm" className="w-full">
          {t('common.back')}
        </Button>
      </div>
    )
  }

  // ====================================================================
  // 主视图
  // ====================================================================
  const settingsItems: SettingsItem[] = [
    {
      icon: Server,
      title: t('settings.rpcNodes'),
      description: t('settings.rpcNodesInfo'),
      action: () => setCurrentView('rpcNodes'),
      highlight: true,
    },
    {
      icon: Globe,
      title: t('settings.explorer'),
      description: t('settings.explorerInfo'),
      action: () => setCurrentView('explorer'),
    },
    {
      icon: Key,
      title: t('settings.changePassword'),
      description: t('settings.changePasswordInfo'),
      action: () => setCurrentView('changePassword'),
    },
    {
      icon: Download,
      title: t('settings.backup'),
      description: t('settings.backupInfo'),
      action: () => setCurrentView('backup'),
    },
    {
      icon: Shield,
      title: t('settings.lock'),
      description: t('settings.lockInfo'),
      action: () => setCurrentView('security'),
    },
    {
      icon: HelpCircle,
      title: t('settings.help'),
      description: t('settings.helpInfo'),
      action: () => setCurrentView('help'),
    },
  ]

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* 设置项列表 */}
      <div className="space-y-1.5">
        {settingsItems.map((item, index) => (
          <button
            key={index}
            onClick={item.action}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-card text-left transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              item.highlight ? 'border-purple-500/40' : 'border-border'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                item.highlight
                  ? 'bg-purple-500/15 ring-1 ring-purple-500/30'
                  : 'bg-zinc-800'
              }`}
            >
              <item.icon
                className={`h-4 w-4 ${item.highlight ? 'text-purple-400' : 'text-zinc-300'}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs text-zinc-100 font-medium leading-tight">{item.title}</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed truncate">
                {item.description}
              </p>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          </button>
        ))}
      </div>

      {/* 锁仓 + 重置 */}
      <div className="space-y-2 pt-1">
        <Button
          onClick={onLockWallet}
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
        >
          <Lock className="h-3.5 w-3.5" />
          {t('settings.lock')}
        </Button>

        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => setShowResetDialog(true)}
          >
            <LogOut className="h-3.5 w-3.5" />
            {t('settings.reset')}
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                {t('settings.resetConfirmTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[11px] leading-relaxed">
                {t('settings.resetConfirm')}
                <span className="block mt-2 text-red-300 font-medium">
                  {t('settings.resetConfirmInfo')}
                </span>
                <span className="block mt-1.5 text-zinc-500 text-[10px]">
                  {t('settings.resetPreserveNote')}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <Button
                onClick={handleConfirmReset}
                className="bg-red-500 text-white hover:bg-red-600"
                size="sm"
              >
                {t('common.confirm')}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* 捐赠区 */}
      <Card>
        <CardContent className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <h3 className="text-xs text-zinc-100 font-medium">{t('common.supportAuthor')}</h3>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            {t('common.supportAuthorDesc')}
          </p>
          <div className="space-y-1.5">
            {[
              { label: 'BTC', address: 'bc1qnvdrxs23t6ejuxjs6mswx7cez2rn80wrwjd0u8' },
              { label: 'BNB', address: '0xD4dB57B007Ad386C2fC4d7DD146f5977c039Fefc' },
              { label: 'USDT (BEP-20)', address: '0xD4dB57B007Ad386C2fC4d7DD146f5977c039Fefc' },
              { label: 'SCASH', address: 'scash1qy48v7frkutlthqq7uqs8lk5fam24tghjdxqtf5' },
            ].map((item, index) => (
              <DonateRow
                key={index}
                label={item.label}
                address={item.address}
                onCopy={() => {
                  navigator.clipboard.writeText(item.address)
                  toast({
                    title: t('common.copySuccess'),
                    description: `${item.label} ${t('common.addressCopied')}`,
                    duration: 2000,
                  })
                }}
              />
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 text-center pt-1">
            {t('wallet.title')} <span className="font-mono">v{VERSION}</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// 内部小组件
// ============================================================

interface SettingsItem {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  action: () => void
  highlight?: boolean
}

function SubHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-md bg-purple-500/10 ring-1 ring-purple-500/30 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-zinc-100 leading-tight">{title}</h2>
        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function RowActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="sm"
      className="w-full justify-start gap-2"
    >
      {icon}
      {label}
    </Button>
  )
}

function DonateRow({
  label,
  address,
  onCopy,
}: {
  label: string
  address: string
  onCopy: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-md bg-zinc-950/50 border border-zinc-800/40">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-zinc-300 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-[10px] text-zinc-500 font-mono break-all leading-relaxed mt-0.5">
          {address}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onCopy}
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
