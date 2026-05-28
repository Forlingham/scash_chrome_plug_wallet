'use client'

// 链上刻字（DAP）页面（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为完全保留：
//   - 用户输入文字 → 通过 DAP 协议编码为多个输出 → 签名 → 广播
//   - 费用拆分：dapAmount（写入数据本身的销毁额）+ networkFee + appFee
//   - 进入页面只拉一次 baseFee；余额由 dashboard 22s 定时器维护
//
// 视觉/交互的桌面化改造：
//   - 紫粉渐变 → emerald 单色（与全局主色统一），重要文本块用 indigo 暗示"链上信息"
//   - 大圆形渐变图标移除（手机风格"启动屏"），替换为简洁标签头
//   - 紧凑化字号与间距，适配 360x600
// ----------------------------------------------------------------------

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/contexts/language-context'
import { useToast } from '@/hooks/use-toast'
import { onBroadcastApi, Unspent } from '@/lib/api'
import { buildRpcErrorToast } from '@/lib/rpc-error'
import {
  calcFee,
  calcValue,
  decryptWallet,
  getDapInstance,
  getWalletPrivateKey,
  NAME_TOKEN,
  onOpenExplorer,
  signTransaction,
  sleep,
} from '@/lib/utils'
import { PendingTransaction, useWalletActions, useWalletState } from '@/stores/wallet-store'
import Decimal from 'decimal.js'
import { CheckCircle2, ExternalLink, Eye, Lock, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DapMessageDisplay } from './dap-message-display'

interface WalletEngraveProps {
  onNavigate: (view: string) => void
}

export function WalletEngrave({ onNavigate }: WalletEngraveProps) {
  const { wallet, coinPrice, unspent } = useWalletState()
  const { getBaseFee, addPendingTransaction, setUpdateBalanceByMemPool } = useWalletActions()
  const { t } = useLanguage()
  const { toast } = useToast()
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form')

  const [engraveText, setEngraveText] = useState<string>('')
  const [dapInfo, setDapInfo] = useState<DapOutputsResult | null>(null)
  const [appFee] = useState<number>(0.05)
  const [networkFee, setNetworkFee] = useState<number>(0)
  const [totalFee, setTotalFee] = useState<number>(0)
  const [baseFee, setBaseFee] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const [pickUnspents, setPickUnspents] = useState<Unspent[]>([])
  const [password, setPassword] = useState<string>('')
  const [passwordError, setPasswordError] = useState<string>('')
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false)
  const [currentPendingTransaction, setCurrentPendingTransaction] = useState<PendingTransaction>()

  async function getInitData() {
    setIsLoading(true)
    try {
      const getBaseFeeRes = await getBaseFee()
      setBaseFee(getBaseFeeRes.fee)
    } catch (error) {
      console.log(error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    getInitData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!engraveText || !engraveText.trim()) {
      setDapInfo(null)
      setTotalFee(0)
      return
    }

    const dap = getDapInstance()
    if (!dap) {
      setDapInfo(null)
      return
    }

    try {
      const dapOutputs = dap.createDapOutputs(engraveText)
      const dapAmount = dapOutputs.reduce((sum: number, output: { value: number }) => sum + output.value, 0) / 1e8

      setDapInfo({
        outputs: dapOutputs.map((output: { address: string; value: number }) => ({
          address: output.address,
          amount: (output.value / 1e8).toString(),
        })),
        dapAmount,
        chunkCount: dapOutputs.length,
      })
    } catch (error) {
      console.error('创建 DAP 输出失败:', error)
      setDapInfo(null)
    }
  }, [engraveText])

  useEffect(() => {
    if (!dapInfo || !baseFee) {
      setNetworkFee(0)
      setTotalFee(0)
      return
    }
    const inputCount = pickUnspents.length
    const outputCount = dapInfo.outputs.length + 1 + 1
    const feeResult = calcFee(inputCount, outputCount, baseFee)
    setNetworkFee(feeResult.feeScash)
    const total = new Decimal(dapInfo.dapAmount).plus(feeResult.feeScash).plus(appFee).toNumber()
    setTotalFee(total)
  }, [dapInfo, baseFee, pickUnspents, appFee])

  useEffect(() => {
    if (step !== 'form' || !baseFee || !totalFee || !dapInfo) return

    const requiredAmount = new Decimal(dapInfo.dapAmount).plus(networkFee).plus(appFee)

    let pickAmount = new Decimal(0)
    const pickUnspentsArr: Unspent[] = []
    for (const unspentItem of unspent) {
      if (unspentItem.isHasMemPool || !unspentItem.isUsable) continue
      pickAmount = pickAmount.plus(new Decimal(unspentItem.amount))
      pickUnspentsArr.push(unspentItem)
      if (pickAmount.gte(requiredAmount)) break
    }

    if (pickAmount.lt(requiredAmount)) {
      setPickUnspents([])
      return
    }
    setPickUnspents([...pickUnspentsArr])
  }, [engraveText, baseFee, totalFee, networkFee, dapInfo, step, appFee, unspent])

  const handleSendToConfirm = () => {
    if (pickUnspents.length === 0 || !dapInfo) return
    setStep('confirm')
  }

  const handlePasswordSubmit = () => {
    if (!password) {
      setPasswordError(t('wallet.lock.input'))
      return
    }
    setPasswordError('')
    setShowConfirmDialog(true)
  }

  const [isConfirmLoading, setIsConfirmLoading] = useState<boolean>(false)

  const handleConfirmTransaction = async () => {
    setIsConfirmLoading(true)
    if (!dapInfo) {
      setIsConfirmLoading(false)
      return
    }

    const walletObj = decryptWallet(wallet.encryptedWallet, password)
    if (!walletObj.isSuccess) {
      setPasswordError(t('wallet.lock.error'))
      setShowConfirmDialog(false)
      setIsConfirmLoading(false)
      return
    }

    if (!walletObj.wallet) {
      setIsConfirmLoading(false)
      return
    }

    const child = getWalletPrivateKey(walletObj.wallet.mnemonic)
    const outputs = [...dapInfo.outputs]
    const totalFeeRate = new Decimal(networkFee).plus(appFee).toNumber()
    const signTransactionResult = signTransaction(pickUnspents, outputs, totalFeeRate, wallet.address, child, appFee)

    if (!signTransactionResult.isSuccess) {
      toast({ title: t('send.errorSign'), description: '', variant: 'destructive' })
      setIsConfirmLoading(false)
      return
    }

    try {
      const res = await onBroadcastApi({
        address: wallet.address,
        txid: '',
        rawtx: signTransactionResult.rawtx,
        totalInput: signTransactionResult.totalInput.toNumber(),
        totalOutput: signTransactionResult.totalOutput.toNumber(),
        change: signTransactionResult.change.toNumber(),
        feeRate: signTransactionResult.feeRate,
        appFee: signTransactionResult.appFee,
      })

      if (res.data.error) {
        const { title, description } = buildRpcErrorToast(t, res.data.error.error.message, res.data.error.error.code)
        toast({ title, description, variant: 'destructive' })
        setIsConfirmLoading(false)
        return
      }

      if (!res.data.rpcData.txid) {
        toast({ title: t('send.error'), description: t('send.errorTxid'), variant: 'destructive' })
        setIsConfirmLoading(false)
        return
      }

      const pendingTransaction: PendingTransaction = {
        id: res.data.rpcData.txid,
        rawtx: signTransactionResult.rawtx,
        totalInput: signTransactionResult.totalInput.toNumber(),
        totalOutput: signTransactionResult.totalOutput.toNumber(),
        change: signTransactionResult.change.toNumber(),
        feeRate: signTransactionResult.feeRate,
        pickUnspents,
        sendListConfirm: outputs,
        timestamp: Date.now(),
        status: 'pending',
      }
      await sleep(1533)
      addPendingTransaction(pendingTransaction)
      setUpdateBalanceByMemPool()
      setCurrentPendingTransaction(pendingTransaction)
      setStep('success')
      setPassword('')
      toast({ title: t('send.success'), description: t('send.broadcast'), variant: 'success' })
    } catch (error: any) {
      console.log(error, 'error')
      toast({ title: t('send.error'), description: t('send.errorInfo'), variant: 'destructive' })
    } finally {
      setIsConfirmLoading(false)
      setShowConfirmDialog(false)
    }
  }

  const [isCancelLoading, setIsCancelLoading] = useState<boolean>(false)
  const handleCancelTransaction = async () => {
    setIsCancelLoading(true)
    await sleep(1533)
    setIsCancelLoading(false)
    setShowConfirmDialog(false)
  }

  // ====================================================================
  // 成功页
  // ====================================================================
  if (step === 'success') {
    return (
      <div className="h-full overflow-y-auto px-3 py-4">
        <div className="space-y-3">
          <div className="flex flex-col items-center text-center pt-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">{t('send.engraveSuccess')}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t('send.engraveSuccessMsg')}</p>
          </div>

          {currentPendingTransaction && (
            <>
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t('transaction.id')}</p>
                  <p className="text-[11px] font-mono text-zinc-200 break-all leading-relaxed">
                    {currentPendingTransaction.id}
                  </p>
                  <button
                    onClick={() => onOpenExplorer('1', 'tx', currentPendingTransaction.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('transactions.openExplorer')}
                  </button>
                </CardContent>
              </Card>

              {/* 留言内容预览（indigo 系，强调"链上信息") */}
              <Card className="bg-indigo-500/5 border-indigo-500/30">
                <CardContent className="text-center space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-indigo-300/80">
                    {t('send.engraveContent')}
                  </p>
                  <DapMessageDisplay
                    content={engraveText}
                    buttonText={<>{t('dap.preview')}</>}
                    title={t('dap.preview')}
                    className="p-0 border-none bg-transparent justify-center"
                  />
                </CardContent>
              </Card>

              {/* 费用细分 */}
              <Card>
                <CardContent className="space-y-1.5 text-[11px]">
                  <Row label={t('send.engraveLoss')}>
                    {dapInfo?.dapAmount.toFixed(8)} {NAME_TOKEN}
                  </Row>
                  <Row label={t('send.engraveNetworkFee')}>
                    {networkFee.toFixed(8)} {NAME_TOKEN}
                  </Row>
                  <Row label={t('send.engravePlatformFee')}>
                    {appFee.toFixed(8)} {NAME_TOKEN}
                  </Row>
                </CardContent>
              </Card>
            </>
          )}

          <Button onClick={() => onNavigate('home')} variant="success" className="w-full">
            {t('send.backToHome')}
          </Button>
        </div>
      </div>
    )
  }

  // ====================================================================
  // 确认页
  // ====================================================================
  if (step === 'confirm') {
    return (
      <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
        <div className="text-center">
          <h2 className="text-sm font-semibold text-zinc-100">{t('send.confirm')}</h2>
        </div>

        <Card>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-500">{t('send.engraveFrom')}</span>
              <span className="text-zinc-200 font-mono">
                {wallet.address.slice(0, 8)}…{wallet.address.slice(-8)}
              </span>
            </div>

            <div className="rounded-md bg-indigo-500/5 border border-indigo-500/30 p-2.5 mt-2">
              <p className="text-[10px] uppercase tracking-wider text-indigo-300/80 mb-1.5">
                {t('send.engraveContent')}
              </p>
              <DapMessageDisplay
                content={engraveText}
                buttonText={<>{t('dap.preview')}</>}
                title={t('dap.preview')}
                className="p-0 border-none bg-transparent"
              />
            </div>

            <div className="space-y-1.5 pt-2.5 border-t border-zinc-800/60 text-[11px]">
              <Row label={t('send.engraveLoss')}>
                {dapInfo?.dapAmount.toFixed(8)} {NAME_TOKEN}
              </Row>
              <Row label={t('send.engraveNetworkFee')}>
                {networkFee.toFixed(8)} {NAME_TOKEN}
              </Row>
              <Row label={t('send.engravePlatformFee')}>
                {appFee.toFixed(8)} {NAME_TOKEN}
              </Row>
            </div>

            <div className="flex justify-between items-start pt-2.5 border-t border-zinc-800/60 font-medium">
              <span className="text-zinc-300">{t('send.total')}</span>
              <div className="text-right">
                <div className="text-zinc-100 tabular-nums">
                  {totalFee.toFixed(8)} {NAME_TOKEN}
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums mt-0.5">
                  ≈ ${calcValue(totalFee, coinPrice)} USD
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <Label className="text-zinc-300 text-xs flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-emerald-400" />
              {t('send.confirmTransaction')}
            </Label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError('')
              }}
              placeholder={t('send.inputPassword')}
              className="w-full bg-zinc-950 text-zinc-100 placeholder-zinc-500 border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
            {passwordError && <p className="text-red-400 text-[11px]">{passwordError}</p>}
          </CardContent>
        </Card>

        <AlertDialog
          open={showConfirmDialog}
          onOpenChange={(open) => {
            if (!open) return
            setShowConfirmDialog(open)
          }}
        >
          <AlertDialogTrigger asChild>
            <Button onClick={handlePasswordSubmit} disabled={!password} variant="success" className="w-full h-10">
              {t('send.confirmPay')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('send.confirm')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('send.confirmTransactionInfo')}
                <br />
                {t('send.total')}: {totalFee.toFixed(8)} {NAME_TOKEN}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelTransaction}>
                {isCancelLoading ? <Spinner /> : t('send.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmTransaction}
                className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              >
                {isConfirmLoading ? <Spinner /> : t('send.confirmTransactionOn')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button onClick={() => setStep('form')} variant="outline" className="w-full">
          {t('send.backToEdit')}
        </Button>
      </div>
    )
  }

  // ====================================================================
  // 表单页
  // ====================================================================
  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      <Card>
        <CardContent className="space-y-3">
          {/* 头部说明 */}
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
              <MessageSquare className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-zinc-100 leading-tight">
                {t('action.engrave')}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                {t('send.engraveDesc')}
              </p>
            </div>
          </div>

          {/* 输入区 */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-emerald-400 text-xs">{t('send.engraveText')}</Label>
              {engraveText && (
                <DapMessageDisplay
                  content={engraveText}
                  showPreview={false}
                  buttonText={
                    <>
                      <Eye className="w-3 h-3 mr-1" />
                      {t('dap.preview')}
                    </>
                  }
                  title={t('dap.preview')}
                  className="h-6 px-2 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                />
              )}
            </div>
            <textarea
              value={engraveText}
              onChange={(e) => setEngraveText(e.target.value)}
              placeholder={t('send.engravePlaceholder')}
              className="w-full bg-zinc-950 text-zinc-100 placeholder-zinc-500 border border-border rounded-md p-2.5 text-xs resize-none h-28 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 leading-relaxed"
            />
            <div className="text-right text-[10px] text-zinc-500">
              {engraveText.length} {t('send.engraveChunkCount').toLowerCase()}
            </div>
          </div>

          {dapInfo && (
            <div className="rounded-md bg-zinc-950 p-2.5 space-y-1.5 text-[11px] border border-zinc-800/60">
              <Row label={t('send.engraveLoss')}>
                {dapInfo.dapAmount.toFixed(8)} {NAME_TOKEN}
              </Row>
              <Row label={t('send.engraveChunkCount')}>{dapInfo.chunkCount}</Row>
              <Row label={t('send.engraveNetworkFee')}>
                {networkFee.toFixed(8)} {NAME_TOKEN}
              </Row>
              <Row label={t('send.engravePlatformFee')}>
                {appFee.toFixed(8)} {NAME_TOKEN}
              </Row>
              <Row label={t('send.totalFee')} bold>
                <span className="tabular-nums">
                  {totalFee.toFixed(8)} {NAME_TOKEN}
                </span>
              </Row>
              <div className="text-right text-[10px] text-zinc-500 tabular-nums mt-1">
                ≈ ${calcValue(totalFee, coinPrice)} USD
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalFee > 0 && pickUnspents.length === 0 && (
        <div className="text-red-400 text-[11px] text-center bg-red-500/10 border border-red-500/30 rounded-md p-2">
          {t('send.engraveInsufficient')}
        </div>
      )}

      <Button
        onClick={handleSendToConfirm}
        disabled={!engraveText || !engraveText.trim() || pickUnspents.length === 0 || isLoading}
        variant="success"
        className="w-full h-10"
      >
        {isLoading ? <Spinner /> : t('send.engraveButton')}
      </Button>
    </div>
  )
}

// ============================================================
// 内部小组件
// ============================================================

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-100" />
  )
}

function Row({
  label,
  bold,
  children,
}: {
  label: string
  bold?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex items-center justify-between ${bold ? 'font-semibold text-zinc-200 border-t border-zinc-800/60 pt-1.5 mt-1' : 'text-zinc-400'}`}
    >
      <span>{label}</span>
      <span className={bold ? 'text-zinc-100' : 'text-zinc-200'}>{children}</span>
    </div>
  )
}
