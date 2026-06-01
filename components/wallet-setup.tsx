'use client'

// 钱包创建 / 导入流程（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务流程完全保留：
//   welcome → create-mnemonic → verify-mnemonic → set-password → download-wallet
//          ↘ restore-method → restore-mnemonic / restore-file → restore-password
//
// 所有 BIP39 校验、AES 加密、地址派生（P2WPKH m/84'/0'/0'/0/0）逻辑原样保留。
//
// 视觉/交互的桌面化改造：
//   - logo 远程 URL（vercel-storage）替换为本地 /logo.png（manifest 已声明）
//   - 紫色按钮全部走 default variant（自动取品牌色 purple-600，与 logo 一致）
//   - 字号收紧、间距压缩，单卡 max-w 改为 popup 宽度
//   - 助记词 grid 紧凑化，3 列 12 词在 360 内可清晰阅读
//   - 文件上传按钮样式从 file:bg-purple-600 改为主题色
// ----------------------------------------------------------------------

import type React from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/contexts/language-context'
import { useToast } from '@/hooks/use-toast'
import {
  decryptWallet,
  downloadWalletFile,
  encryptWallet,
  normalizeMnemonic,
  passwordMD5,
  SCASH_NETWORK,
} from '@/lib/utils'
import { useWalletActions, useWalletStore, type WalletInfo } from '@/stores/wallet-store'
import { BIP32Factory } from 'bip32'
import * as bip39 from 'bip39'
import * as bitcoin from 'bitcoinjs-lib'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Upload,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import * as ecc from 'tiny-secp256k1'
import { onUserCreateApi } from '@/lib/api'
import { LanguageSelector } from '@/components/language-selector'

interface WalletSetupProps {
  onWalletCreated: () => void
}

type SetupStep =
  | 'welcome'
  | 'create-mnemonic'
  | 'verify-mnemonic'
  | 'set-password'
  | 'download-wallet'
  | 'restore-method'
  | 'restore-mnemonic'
  | 'restore-file'
  | 'restore-password'

export function WalletSetup({ onWalletCreated }: WalletSetupProps) {
  const { t } = useLanguage()
  const { toast } = useToast()

  const { setWallet } = useWalletActions()

  const [step, setStep] = useState<SetupStep>('welcome')
  const [showMnemonic, setShowMnemonic] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [generatedMnemonic, setGeneratedMnemonic] = useState('')
  const [verificationWords, setVerificationWords] = useState<{ word: string; index: number }[]>([])
  const [userVerification, setUserVerification] = useState<string[]>([])
  const [walletFile, setWalletFile] = useState<File | null>(null)
  const [walletInfo, setWalletInfo] = useState<WalletInfo>()
  const [uploadedWalletEncrypted, setUploadedWalletEncrypted] = useState<string>()

  const handleCreateWallet = () => {
    setShowMnemonic(false)
    const newMnemonic = bip39.generateMnemonic()
    setGeneratedMnemonic(newMnemonic)
    setStep('create-mnemonic')
  }

  const handleVerifyMnemonic = () => {
    const words = generatedMnemonic.split(' ')
    const randomIndices = [] as number[]
    while (randomIndices.length < 3) {
      const randomIndex = Math.floor(Math.random() * words.length)
      if (!randomIndices.includes(randomIndex)) {
        randomIndices.push(randomIndex)
      }
    }

    const verification = randomIndices.map((index) => ({
      word: words[index],
      index: index + 1,
    }))

    setVerificationWords(verification)
    setUserVerification(new Array(3).fill(''))
    setStep('verify-mnemonic')
  }

  const handleVerificationSubmit = () => {
    const isCorrect = verificationWords.every(
      (item, index) => userVerification[index]?.toLowerCase().trim() === item.word.toLowerCase(),
    )

    if (isCorrect) {
      setStep('set-password')
    } else {
      toast({
        title: t('wallet.verificationFailed'),
        description: t('wallet.verificationFailedInfo'),
        variant: 'destructive',
      })
    }
  }

  const handlePasswordSubmit = () => {
    if (password.length < 8) {
      toast({
        title: t('wallet.passwordTooShort'),
        description: t('wallet.passwordMinLength'),
        variant: 'destructive',
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        title: t('wallet.passwordsDontMatch'),
        description: t('wallet.passwordsDontMatchInfo'),
        variant: 'destructive',
      })
      return
    }

    const passwordHash = passwordMD5(password)

    const bip2 = BIP32Factory(ecc)
    const seed = bip39.mnemonicToSeedSync(generatedMnemonic)
    const root = bip2.fromSeed(seed, SCASH_NETWORK)
    const path = "m/84'/0'/0'/0/0"
    const child = root.derivePath(path)
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(child.publicKey),
      network: SCASH_NETWORK,
    })

    if (!address) {
      toast({
        title: t('wallet.addressGenerationFailed'),
        description: t('wallet.addressGenerationFailedInfo'),
        variant: 'destructive',
      })
      return
    }

    const walletForFile: WalletFile = {
      mnemonic: generatedMnemonic,
      path,
      address,
      privateKey: child.toWIF(),
      passwordHash,
    }

    const encryptedWallet = encryptWallet(walletForFile, passwordHash)

    const walletInfoData: WalletInfo = {
      isHasWallet: true,
      address: address!,
      balance: 0,
      lockBalance: 0,
      memPoolBalance: 0,
      usableBalance: 0,
      encryptedWallet: encryptedWallet,
    }

    onUserCreateApi(address)
    setWalletInfo(walletInfoData)

    setStep('download-wallet')
  }

  const handleDownloadWallet = () => {
    if (!walletInfo || !walletInfo.encryptedWallet) {
      toast({
        title: t('common.error'),
        description: t('setup.error.notEncrypted'),
        variant: 'destructive',
      })
      return
    }

    downloadWalletFile(walletInfo.encryptedWallet)
    setWallet(walletInfo)

    toast({
      title: t('setup.success.created'),
      description: t('setup.success.createdDesc'),
    })

    onWalletCreated()
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setWalletFile(file)
    }
  }

  const handleRestoreFromFile = () => {
    if (!walletFile) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const walletData = JSON.parse(e.target?.result as string) as WalletFileData
        if (walletData && walletData.data && walletData.encrypted && walletData.timestamp) {
          setUploadedWalletEncrypted(walletData.data)
          setStep('restore-password')
        } else {
          toast({
            title: t('setup.error.invalidWalletFile'),
            description: t('setup.error.invalidWalletFileDesc'),
            variant: 'destructive',
          })
        }
      } catch (error) {
        toast({
          title: t('setup.error.invalidWalletFile'),
          description: t('setup.error.invalidWalletFileDesc'),
          variant: 'destructive',
        })
      }
    }
    reader.readAsText(walletFile)
  }

  const onRestorePassword = () => {
    if (!password) {
      toast({ title: t('wallet.enterPassword'), variant: 'destructive' })
      return
    }

    if (!uploadedWalletEncrypted) {
      toast({
        title: t('setup.error.invalidWalletFile'),
        description: t('setup.error.invalidWalletFileDesc'),
        variant: 'destructive',
      })
      return
    }

    try {
      const decryptedWallet = decryptWallet(uploadedWalletEncrypted, password)

      if (!decryptedWallet.isSuccess) {
        toast({
          title: t('setup.error.invalidPassword'),
          description: t('setup.error.invalidPasswordDesc'),
          variant: 'destructive',
        })
        return
      }

      const walletInfoData: WalletInfo = {
        isHasWallet: true,
        address: decryptedWallet.wallet!.address,
        balance: 0,
        lockBalance: 0,
        memPoolBalance: 0,
        usableBalance: 0,
        encryptedWallet: uploadedWalletEncrypted,
      }

      setWalletInfo(walletInfoData)
      setWallet(walletInfoData)
      onWalletCreated()
    } catch (error) {
      toast({
        title: t('setup.error.invalidPassword'),
        description: t('setup.error.invalidPasswordDesc'),
        variant: 'destructive',
      })
      return
    }
  }

  const handleRestoreFromMnemonic = () => {
    // 业务逻辑保留，全部注释也一并保留
    const normalized = normalizeMnemonic(generatedMnemonic)
    const words = normalized ? normalized.split(' ') : []

    if (words.length !== 12) {
      toast({
        title: t('wallet.invalidMnemonic'),
        description: t('wallet.invalidMnemonicWordCount').replace('{n}', String(words.length)),
        variant: 'destructive',
      })
      return
    }

    if (!bip39.validateMnemonic(normalized)) {
      toast({
        title: t('wallet.invalidMnemonic'),
        description: t('wallet.invalidMnemonicChecksum'),
        variant: 'destructive',
      })
      return
    }

    setGeneratedMnemonic(normalized)
    setStep('set-password')
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: t('setup.copy.mnemonic'),
      description: t('setup.copy.mnemonicDesc'),
    })
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ============================================================
          顶部品牌栏（48px，与其他页面一致）
          ============================================================ */}
      <div className="h-12 px-3 flex items-center justify-between border-b border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="SCASH"
            className="w-7 h-7 rounded-full ring-1 ring-zinc-700/60"
          />
          <h1 className="text-sm font-semibold text-zinc-100">SCASH</h1>
        </div>
        <LanguageSelector />
      </div>

      {/* ============================================================
          主内容滚动区
          ============================================================ */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
        {step === 'welcome' && (
          <WelcomeStep
            onCreate={handleCreateWallet}
            onRestore={() => setStep('restore-method')}
          />
        )}

        {step === 'create-mnemonic' && (
          <CreateMnemonicStep
            mnemonic={generatedMnemonic}
            showMnemonic={showMnemonic}
            onReveal={() => setShowMnemonic(true)}
            onCopy={() => copyToClipboard(generatedMnemonic)}
            onContinue={handleVerifyMnemonic}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'verify-mnemonic' && (
          <VerifyMnemonicStep
            verificationWords={verificationWords}
            userVerification={userVerification}
            setUserVerification={setUserVerification}
            onSubmit={handleVerificationSubmit}
            onBack={() => setStep('create-mnemonic')}
          />
        )}

        {step === 'set-password' && (
          <SetPasswordStep
            password={password}
            setPassword={setPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            onSubmit={handlePasswordSubmit}
            onBack={() =>
              setStep(generatedMnemonic ? 'verify-mnemonic' : 'restore-mnemonic')
            }
          />
        )}

        {step === 'download-wallet' && <DownloadWalletStep onDownload={handleDownloadWallet} />}

        {step === 'restore-method' && (
          <RestoreMethodStep
            onUseRecovery={() => {
              setStep('restore-mnemonic')
              setGeneratedMnemonic('')
            }}
            onUploadFile={() => setStep('restore-file')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'restore-mnemonic' && (
          <RestoreMnemonicStep
            mnemonic={generatedMnemonic}
            setMnemonic={setGeneratedMnemonic}
            onSubmit={handleRestoreFromMnemonic}
            onBack={() => {
              setStep('restore-method')
              setGeneratedMnemonic('')
            }}
          />
        )}

        {step === 'restore-file' && (
          <RestoreFileStep
            walletFile={walletFile}
            onUpload={handleFileUpload}
            onSubmit={handleRestoreFromFile}
            onBack={() => setStep('restore-method')}
          />
        )}

        {step === 'restore-password' && (
          <RestorePasswordStep
            password={password}
            setPassword={setPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            onSubmit={onRestorePassword}
            onBack={() => setStep('restore-file')}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// 步骤一：欢迎
// ============================================================
function WelcomeStep({ onCreate, onRestore }: { onCreate: () => void; onRestore: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="space-y-4 pt-4">
      {/* hero */}
      <div className="text-center space-y-2">
        <img src="/logo.png" alt="SCASH" className="w-14 h-14 rounded-full mx-auto ring-1 ring-zinc-800" />
        <h2 className="text-base font-semibold text-zinc-100">{t('wallet.title')}</h2>
        <p className="text-[11px] text-zinc-400 leading-relaxed px-4">{t('wallet.subtitle')}</p>
      </div>

      <div className="space-y-2 pt-2">
        <Button onClick={onCreate} variant="default" className="w-full h-10 gap-2">
          <Plus className="h-4 w-4" />
          {t('wallet.createNew')}
        </Button>
        <Button onClick={onRestore} variant="outline" className="w-full h-10 gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('wallet.restoreExisting')}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// 步骤二：展示助记词
// ============================================================
function CreateMnemonicStep({
  mnemonic,
  showMnemonic,
  onReveal,
  onCopy,
  onContinue,
  onBack,
}: {
  mnemonic: string
  showMnemonic: boolean
  onReveal: () => void
  onCopy: () => void
  onContinue: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-amber-500/10 ring-1 ring-amber-500/30 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-100 leading-tight">
            {t('wallet.saveRecovery')}
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{t('wallet.writeDown')}</p>
        </div>
      </div>

      <div className="relative">
        <div
          className={`grid grid-cols-3 gap-1 p-2.5 bg-zinc-950 rounded-md border border-zinc-800/60 ${
            !showMnemonic ? 'blur-sm select-none' : ''
          }`}
        >
          {mnemonic.split(' ').map((word, index) => (
            <div
              key={index}
              className="flex items-center gap-1 px-1.5 py-1 bg-zinc-900 rounded text-[11px] border border-zinc-800/40"
            >
              <span className="text-zinc-500 text-[9px] font-mono">{index + 1}.</span>
              <span className="text-zinc-100 truncate">{word}</span>
            </div>
          ))}
        </div>

        {!showMnemonic && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button onClick={onReveal} variant="default" size="sm">
              <Eye className="h-3.5 w-3.5" />
              {t('wallet.clickReveal')}
            </Button>
          </div>
        )}
      </div>

      {showMnemonic && (
        <div className="flex gap-2">
          <Button onClick={onCopy} variant="outline" size="sm" className="flex-1">
            <Copy className="h-3.5 w-3.5" />
            {t('common.copy')}
          </Button>
          <Button onClick={onContinue} variant="default" size="sm" className="flex-1">
            {t('wallet.savedIt')}
          </Button>
        </div>
      )}

      <Button onClick={onBack} variant="ghost" size="sm" className="w-full">
        {t('common.back')}
      </Button>
    </div>
  )
}

// ============================================================
// 步骤三：验证助记词
// ============================================================
function VerifyMnemonicStep({
  verificationWords,
  userVerification,
  setUserVerification,
  onSubmit,
  onBack,
}: {
  verificationWords: { word: string; index: number }[]
  userVerification: string[]
  setUserVerification: (v: string[]) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">{t('wallet.verifyPhrase')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('wallet.enterWords')}</p>
      </div>

      <Card>
        <CardContent className="space-y-2.5">
          {verificationWords.map((item, index) => (
            <div key={index} className="space-y-1">
              <Label className="text-zinc-300 text-xs">Word #{item.index}</Label>
              <Input
                value={userVerification[index] || ''}
                onChange={(e) => {
                  const newVerification = [...userVerification]
                  newVerification[index] = e.target.value
                  setUserVerification(newVerification)
                }}
                placeholder={t('setup.placeholder.enterWord')}
                className="text-xs"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" size="sm" className="flex-1">
          {t('common.back')}
        </Button>
        <Button
          onClick={onSubmit}
          variant="default"
          size="sm"
          className="flex-1"
          disabled={userVerification.some((word) => !word.trim())}
        >
          {t('common.verify')}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// 步骤四：设置密码
// ============================================================
function SetPasswordStep({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  onSubmit,
  onBack,
}: {
  password: string
  setPassword: (v: string) => void
  confirmPassword: string
  setConfirmPassword: (v: string) => void
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">{t('wallet.setPassword')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('wallet.passwordInfo')}</p>
      </div>

      <Card>
        <CardContent className="space-y-2.5">
          <div className="space-y-1">
            <Label className="text-zinc-300 text-xs">{t('wallet.password')}</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('wallet.passwordInput')}
                className="pr-9 text-xs"
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

          <div className="space-y-1">
            <Label className="text-zinc-300 text-xs">{t('wallet.confirmPassword')}</Label>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('wallet.confirmPassword')}
              className="text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" size="sm" className="flex-1">
          {t('common.back')}
        </Button>
        <Button
          onClick={onSubmit}
          variant="default"
          size="sm"
          className="flex-1"
          disabled={!password || !confirmPassword}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// 步骤五：下载钱包文件
// ============================================================
function DownloadWalletStep({ onDownload }: { onDownload: () => void }) {
  const { t } = useLanguage()
  return (
    <div className="space-y-4 text-center pt-4">
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full bg-purple-500/15 ring-1 ring-purple-500/40 flex items-center justify-center">
          <Download className="h-7 w-7 text-purple-400" />
        </div>
        <h3 className="text-base font-semibold text-zinc-100">{t('wallet.downloadWallet')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed px-2">
          {t('wallet.downloadInfo')}
        </p>
      </div>

      <Button onClick={onDownload} variant="default" className="w-full h-10 gap-2">
        <Download className="h-4 w-4" />
        {t('wallet.downloadButton')}
      </Button>

      <p className="text-[10px] text-zinc-500 leading-relaxed">{t('wallet.needFile')}</p>
    </div>
  )
}

// ============================================================
// 步骤六：恢复方式选择
// ============================================================
function RestoreMethodStep({
  onUseRecovery,
  onUploadFile,
  onBack,
}: {
  onUseRecovery: () => void
  onUploadFile: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">{t('wallet.restoreMethod')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('wallet.chooseMethod')}</p>
      </div>

      <div className="space-y-2 pt-1">
        <Button onClick={onUseRecovery} variant="default" className="w-full h-10 gap-2">
          {t('wallet.useRecovery')}
        </Button>
        <Button onClick={onUploadFile} variant="outline" className="w-full h-10 gap-2">
          <Upload className="h-4 w-4" />
          {t('wallet.uploadWalletFile')}
        </Button>
      </div>

      <Button onClick={onBack} variant="ghost" size="sm" className="w-full">
        {t('common.back')}
      </Button>
    </div>
  )
}

// ============================================================
// 步骤七：用助记词恢复
// ============================================================
function RestoreMnemonicStep({
  mnemonic,
  setMnemonic,
  onSubmit,
  onBack,
}: {
  mnemonic: string
  setMnemonic: (v: string) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">{t('wallet.enterRecovery')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('wallet.enter12Words')}</p>
      </div>

      <Card>
        <CardContent className="space-y-1.5">
          <Label className="text-zinc-300 text-xs">{t('wallet.recoveryPhrase')}</Label>
          <Textarea
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder={t('wallet.enter12Words')}
            className="min-h-[88px] text-xs"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" size="sm" className="flex-1">
          {t('common.back')}
        </Button>
        <Button
          onClick={onSubmit}
          variant="default"
          size="sm"
          className="flex-1"
          disabled={!mnemonic.trim()}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// 步骤八：上传钱包文件
// ============================================================
function RestoreFileStep({
  walletFile,
  onUpload,
  onSubmit,
  onBack,
}: {
  walletFile: File | null
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">{t('wallet.uploadWalletFile')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('wallet.selectFile')}</p>
      </div>

      <Card>
        <CardContent className="space-y-2">
          <Label className="text-zinc-300 text-xs">{t('wallet.walletFile')}</Label>
          <Input
            type="file"
            accept=".json"
            onChange={onUpload}
            className="text-xs file:mr-2 file:px-2 file:py-0.5 file:rounded file:border-0 file:bg-purple-500/15 file:text-purple-300 file:text-[11px] file:font-medium hover:file:bg-purple-500/25 cursor-pointer"
          />
        </CardContent>
      </Card>

      {walletFile && (
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/30">
          <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-emerald-300 truncate">{walletFile.name}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" size="sm" className="flex-1">
          {t('common.back')}
        </Button>
        <Button
          onClick={onSubmit}
          variant="default"
          size="sm"
          className="flex-1"
          disabled={!walletFile}
        >
          {t('wallet.restoreWallet')}
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// 步骤九：输入恢复密码（来自上传的钱包文件）
// ============================================================
function RestorePasswordStep({
  password,
  setPassword,
  showPassword,
  setShowPassword,
  onSubmit,
  onBack,
}: {
  password: string
  setPassword: (v: string) => void
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  onSubmit: () => void
  onBack: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-3">
      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold text-zinc-100">{t('wallet.enterPassword')}</h3>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('wallet.passwordUsed')}</p>
      </div>

      <Card>
        <CardContent className="space-y-1.5">
          <Label className="text-zinc-300 text-xs">{t('wallet.password')}</Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('wallet.enterPassword')}
              className="pr-9 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password) onSubmit()
              }}
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
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onBack} variant="outline" size="sm" className="flex-1">
          {t('common.back')}
        </Button>
        <Button
          onClick={onSubmit}
          variant="default"
          size="sm"
          className="flex-1"
          disabled={!password}
        >
          {t('wallet.unlockWallet')}
        </Button>
      </div>
    </div>
  )
}
