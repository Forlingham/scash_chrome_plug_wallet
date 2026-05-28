'use client'

// 发送页面（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为完全保留：
//   - 多收款人支持、二维码扫码填地址、最大值/手续费扣除、密码二次确认、
//     DAP 留言、广播后写入 pendingTransactions、立即重算余额。
//   - 复杂的边界条件全部沿用原逻辑（注释也一并保留）。
//
// 视觉/交互的桌面化改造：
//   - 删除手机风格的紫粉渐变 / 大图标 / 大字号
//   - 主 CTA "确认发送 / 立即支付" 改为品牌色 purple（default 变体）
//   - 表单 label 颜色统一为 purple-400（品牌点缀）
//   - 成功页 hero 用 emerald CheckCircle2（功能性正向语义）+ 简洁信息卡
// ----------------------------------------------------------------------

import { QRScannerComponent } from '@/components/qr-scanner'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/contexts/language-context'
import { useToast } from '@/hooks/use-toast'
import { onBroadcastApi, Unspent } from '@/lib/api'
import { buildRpcErrorToast } from '@/lib/rpc-error'
import {
  calcAppFee,
  calcFee,
  calcValue,
  decryptWallet,
  getDapInstance,
  getWalletPrivateKey,
  hideString,
  NAME_TOKEN,
  normalizeScashAddress,
  onOpenExplorer,
  signTransaction,
  sleep,
  validateScashAddress,
} from '@/lib/utils'
import { PendingTransaction, useWalletActions, useWalletState } from '@/stores/wallet-store'
import Decimal from 'decimal.js'
import {
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Lock,
  QrCode,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { DapMessageDisplay } from './dap-message-display'

interface WalletSendProps {
  onNavigate: (view: string) => void
}

export function WalletSend({ onNavigate }: WalletSendProps) {
  const { wallet, coinPrice, unspent } = useWalletState()
  const { getBaseFee, addPendingTransaction, setUpdateBalanceByMemPool } = useWalletActions()
  const { t } = useLanguage()
  const { toast } = useToast()
  const [step, setStep] = useState<'form' | 'confirm' | 'success'>('form')
  const [isSliding, setIsSliding] = useState(false)

  const [sendList, setSendList] = useState<SendList[]>([{ address: '', amount: '' }])
  const [sendListConfirm, setSendListConfirm] = useState<SendList[]>([])
  const [sendAmount, setSendAmount] = useState<number>(0)
  const [sendAmountTotal, setSendAmountTotal] = useState<number>(0)
  const [baseFee, setBaseFee] = useState<number>(0)
  const [networkFee, setNetworkFee] = useState<number>(0)
  const [appFee, setAppFee] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const [pickUnspents, setPickUnspents] = useState<Unspent[]>([])
  const [addressErrors, setAddressErrors] = useState<{ [key: number]: boolean }>({})
  const [amountErrors, setAmountErrors] = useState<{ [key: number]: boolean }>({})
  const [lastAmountInputIndex, setLastAmountInputIndex] = useState<number | null>(null)
  const [deductFeeFromAmount, setDeductFeeFromAmount] = useState<boolean>(false)
  const [isForcedDeductFeeFromAmount, setIsForcedDeductFeeFromAmount] = useState<boolean>(false)
  const [totalAmountError, setTotalAmountError] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [passwordError, setPasswordError] = useState<string>('')
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false)
  const [showQRScanner, setShowQRScanner] = useState<boolean>(false)
  const [currentScanIndex, setCurrentScanIndex] = useState<number>(0)
  const [currentPendingTransaction, setCurrentPendingTransaction] = useState<PendingTransaction>()

  const [dapMessage, setDapMessage] = useState<string>('')
  const [dapInfo, setDapInfo] = useState<DapOutputsResult | null>(null)
  const [dapNetworkFee, setDapNetworkFee] = useState<number>(0)
  const [totalFee, setTotalFee] = useState<number>(0)

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
    // 进入发送页时只拉一次费率；余额由 wallet-dashboard 的 22 秒定时器维护，
    // 不需要在这里再调 setUpdateBalanceByMemPool（容易在 state.unspent 还没填充时
    // 把余额清零，反而出问题）。
    getInitData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChangeAddress = (index: number, value: string) => {
    setSendList((prev) => {
      const newList = [...prev]
      newList[index].address = value
      return newList
    })
    if (addressErrors[index]) {
      setAddressErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[index]
        return newErrors
      })
    }
  }

  const handleBlurAddress = (index: number) => {
    if (sendList[index].address && !validateScashAddress(sendList[index].address)) {
      setAddressErrors((prev) => ({ ...prev, [index]: true }))
    }
  }

  const handleChangeAmount = (index: number, value: string) => {
    setSendList((prev) => {
      const newList = [...prev]
      newList[index].amount = value
      return newList
    })
    setLastAmountInputIndex(index)
    if (amountErrors[index]) {
      setAmountErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[index]
        return newErrors
      })
    }
  }

  const handleMaxAmount = (index: number) => {
    handleChangeAmount(index, wallet.usableBalance.toString())
    setDeductFeeFromAmount(true)
  }

  const validateAmount = (index: number, amount: string) => {
    const numAmount = parseFloat(amount)
    const walletBalance = parseFloat(wallet.usableBalance.toString())
    if (amount && !isNaN(numAmount) && numAmount > walletBalance) {
      setAmountErrors((prev) => ({ ...prev, [index]: true }))
    }
  }

  const validateTotalAmount = () => {
    const validSendList = sendList.filter((item) => {
      return item.address && validateScashAddress(item.address) && item.amount && Number.parseFloat(item.amount) > 0
    })
    const totalAmount = validSendList.reduce((sum, item) => sum.add(item.amount), new Decimal(0))
    const availableBalance = parseFloat(wallet.usableBalance.toString())
    const fee = networkFee

    let requiredAmount = totalAmount
    if (!deductFeeFromAmount) requiredAmount = requiredAmount.plus(fee)

    if (requiredAmount.gt(availableBalance)) {
      setTotalAmountError(t('send.inputExceed'))
      return false
    } else {
      setTotalAmountError('')
      return true
    }
  }

  useEffect(() => {
    if (sendList.some((item) => item.amount) && networkFee) validateTotalAmount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendList, networkFee, deductFeeFromAmount, wallet.usableBalance])

  useEffect(() => {
    if (step !== 'form') return
    const validSendList = sendList.filter((item) => {
      return item.address && validateScashAddress(item.address) && item.amount && Number.parseFloat(item.amount) > 0
    })

    if (validSendList.length === 0) {
      setNetworkFee(0)
      setPickUnspents([])
      setSendAmount(0)
      return
    }

    const _sendAmount = new Decimal(
      validSendList.reduce((acc, item) => acc.plus(new Decimal(item.amount || '0')), new Decimal(0)),
    ).toNumber()
    setSendAmount(_sendAmount)

    let pickAmount = new Decimal(0)
    const pickUnspentsArr: Unspent[] = []
    for (const unspentItem of unspent) {
      if (unspentItem.isHasMemPool || !unspentItem.isUsable) continue
      pickAmount = pickAmount.plus(new Decimal(unspentItem.amount))
      pickUnspentsArr.push(unspentItem)
      if (pickAmount.gte(new Decimal(_sendAmount))) break
    }
    if (dapInfo) {
      pickAmount = pickAmount.plus(new Decimal(dapInfo.dapAmount).plus(new Decimal(dapNetworkFee)))
    }
    if (pickAmount.lt(_sendAmount)) {
      setTotalAmountError(t('send.inputExceed'))
      return
    }

    setPickUnspents([...pickUnspentsArr])

    const inputCount = pickUnspentsArr.length
    const outputCount = sendList.filter((item) => item.address).length + 5

    const _appFee = calcAppFee(_sendAmount)
    setAppFee(_appFee)

    const _networkFee = new Decimal(_appFee).plus(calcFee(inputCount, outputCount, baseFee).feeScash).toNumber()
    setNetworkFee(_networkFee)

    if (pickAmount.eq(new Decimal(_sendAmount)) || new Decimal(_sendAmount).plus(networkFee).gte(new Decimal(pickAmount))) {
      setDeductFeeFromAmount(true)
      setIsForcedDeductFeeFromAmount(true)
    } else {
      setIsForcedDeductFeeFromAmount(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendList, dapInfo, dapNetworkFee])

  // DAP 留言费用计算
  useEffect(() => {
    if (!dapMessage || !dapMessage.trim()) {
      setDapInfo(null)
      return
    }
    const dap = getDapInstance()
    if (!dap) {
      setDapInfo(null)
      return
    }
    try {
      const dapOutputs = dap.createDapOutputs(dapMessage.trim())
      const dapAmount = dapOutputs.reduce((sum: number, output: { value: number }) => sum + output.value, 0) / 1e8
      setDapInfo({
        outputs: dapOutputs.map((output: { address: string; value: number }) => ({
          address: output.address,
          amount: (output.value / 1e8).toString(),
        })),
        dapAmount,
        chunkCount: dapOutputs.length,
      })
      const feeResult = calcFee(0, dapOutputs.length, baseFee)
      setDapNetworkFee(feeResult.feeScash)
    } catch (error) {
      console.error('创建 DAP 输出失败:', error)
      setDapInfo(null)
    }
  }, [dapMessage, baseFee])

  // 总手续费
  useEffect(() => {
    let total = networkFee
    if (dapInfo) total = new Decimal(total).plus(dapInfo.dapAmount).plus(dapNetworkFee).toNumber()
    setTotalFee(total)
  }, [networkFee, dapInfo, dapNetworkFee])

  const handleAddAddress = () => setSendList([...sendList, { address: '', amount: '' }])

  const handleSendToConfirm = () => {
    // 全部业务逻辑保留，不动
    const validSendList: SendList[] = JSON.parse(
      JSON.stringify(
        sendList
          .map((item) => ({ ...item, address: normalizeScashAddress(item.address) }))
          .filter((item) => {
            return (
              item.address &&
              validateScashAddress(item.address) &&
              item.amount &&
              Number.parseFloat(item.amount) > 0
            )
          }),
      ),
    )

    if (validSendList.length === 0) {
      setSendListConfirm([])
      setTotalAmountError(t('send.invalidAddress'))
      return
    }

    let feeWithDap = networkFee
    if (dapInfo) feeWithDap = new Decimal(feeWithDap).plus(dapInfo.dapAmount).toNumber()

    let amountTotal: number
    if (deductFeeFromAmount) {
      let lastIndex = validSendList.length - 1
      while (lastIndex >= 0) {
        if (new Decimal(validSendList[lastIndex].amount || '0').gte(feeWithDap)) {
          validSendList[lastIndex].amount = new Decimal(validSendList[lastIndex].amount || '0')
            .minus(feeWithDap)
            .toString()
          break
        }
        lastIndex--
      }
      if (lastIndex < 0) {
        setTotalAmountError(t('send.inputExceed'))
        return
      }
      amountTotal = sendAmount
    } else {
      amountTotal = +new Decimal(sendAmount).add(feeWithDap).toFixed(8)
    }

    setTotalAmountError('')
    setSendAmountTotal(amountTotal)
    setSendListConfirm(validSendList)
    setStep('confirm')
  }

  const handleScanQR = (index: number) => {
    setCurrentScanIndex(index)
    setShowQRScanner(true)
  }

  const handleScanResult = (result: string) => {
    try {
      let address = result
      let amount = ''
      if (result.includes('?amount=')) {
        const [addr, params] = result.split('?')
        address = addr
        const urlParams = new URLSearchParams(params)
        amount = urlParams.get('amount') || ''
      }
      if (validateScashAddress(address)) {
        setSendList((prev) => {
          const newList = [...prev]
          newList[currentScanIndex].address = address
          if (amount) newList[currentScanIndex].amount = amount
          return newList
        })
        setAddressErrors((prev) => {
          const newErrors = { ...prev }
          delete newErrors[currentScanIndex]
          return newErrors
        })
        toast({ title: t('send.successScan'), description: t('send.successScanDesc'), variant: 'success' })
      } else {
        toast({ title: t('send.errorScan'), description: t('send.errorScanDesc'), variant: 'destructive' })
      }
    } catch (error) {
      console.error('解析二维码失败:', error)
      toast({ title: t('send.errorScan'), description: t('send.errorScanDesc'), variant: 'destructive' })
    }
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

    let outputs = [...sendListConfirm]
    if (dapInfo) outputs = [...outputs, ...dapInfo.outputs]

    if (outputs.length === 0) {
      toast({
        title: t('send.error'),
        description: t('send.errorInfo'),
        variant: 'destructive',
      })
      setShowConfirmDialog(false)
      setIsConfirmLoading(false)
      setStep('form')
      return
    }

    const feeRate = new Decimal(networkFee).add(dapNetworkFee).toNumber()
    const signTransactionResult = signTransaction(pickUnspents, outputs, feeRate, wallet.address, child, appFee)
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
        sendListConfirm: [...sendListConfirm],
        timestamp: Date.now(),
        status: 'pending',
      }
      await sleep(1533)
      addPendingTransaction(pendingTransaction)
      setUpdateBalanceByMemPool()
      setCurrentPendingTransaction(pendingTransaction)
      setStep('success')
      setIsSliding(false)
      setPassword('')
      toast({ title: t('send.success'), description: t('send.broadcast'), variant: 'success' })
    } catch (error: any) {
      console.log(error, 'error')
      const nodeMsg = error?.data?.data?.error?.error?.message ?? error?.data?.message ?? error?.message
      const nodeCode = error?.data?.data?.error?.error?.code ?? error?.data?.code ?? 0
      const { title, description } = buildRpcErrorToast(t, nodeMsg, nodeCode)
      toast({
        title,
        description: description || t('send.errorInfo'),
        variant: 'destructive',
      })
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
          {/* 成功 hero */}
          <div className="flex flex-col items-center text-center pt-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/40 flex items-center justify-center mb-2">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">{t('send.success')}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{t('send.broadcast')}</p>
          </div>

          {/* 总额卡 */}
          <Card>
            <CardContent className="text-center space-y-1">
              <p className="text-xl font-semibold text-zinc-50 tabular-nums tracking-tight">
                {sendAmountTotal} <span className="text-xs font-normal text-zinc-500">{NAME_TOKEN}</span>
              </p>
              <p className="text-xs text-zinc-500 tabular-nums">
                ≈ ${calcValue(sendAmountTotal, coinPrice)} USD
              </p>
            </CardContent>
          </Card>

          {currentPendingTransaction && (
            <>
              {/* 交易 ID */}
              <Card>
                <CardContent className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">{t('transaction.id')}</p>
                  <p className="text-[11px] font-mono text-zinc-200 break-all leading-relaxed">
                    {currentPendingTransaction.id}
                  </p>
                  <button
                    onClick={() => onOpenExplorer('1', 'tx', currentPendingTransaction.id)}
                    className="inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('transactions.openExplorer')}
                  </button>
                </CardContent>
              </Card>

              {/* 收款人 */}
              <div className="space-y-2">
                {currentPendingTransaction?.sendListConfirm.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="flex justify-between items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{t('send.to')}</p>
                        <p className="text-xs font-mono text-zinc-200 truncate">{hideString(item.address)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{t('common.amount')}</p>
                        <p className="text-xs font-medium text-zinc-100 tabular-nums">
                          {item.amount} <span className="text-zinc-500 font-normal">{NAME_TOKEN}</span>
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* DAP 留言 */}
              {dapMessage && (
                <Card>
                  <CardContent>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">{t('send.message')}</p>
                    <DapMessageDisplay
                      content={dapMessage}
                      buttonText={<>{t('dap.preview')}</>}
                      title={t('send.message')}
                      className="p-0 border-none bg-transparent justify-center"
                    />
                  </CardContent>
                </Card>
              )}

              {/* 原始交易 raw（折叠展示） */}
              <Card>
                <CardContent>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
                    {t('send.rawTransaction')}
                  </p>
                  <div className="bg-zinc-950 rounded p-2 max-h-20 overflow-y-auto border border-zinc-800/60">
                    <p className="text-[10px] font-mono text-zinc-500 break-all leading-relaxed">
                      {currentPendingTransaction?.rawtx}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          <Button onClick={() => onNavigate('home')} variant="default" className="w-full">
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
            <div className="flex justify-between items-center gap-2">
              <span className="text-zinc-500">{t('send.from')}</span>
              <span className="text-zinc-200 font-mono">
                {wallet.address.slice(0, 8)}…{wallet.address.slice(-8)}
              </span>
            </div>

            {sendListConfirm.map((item, index) => (
              <div className="space-y-1.5 pt-2.5 border-t border-zinc-800/60" key={index}>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-zinc-500">{t('send.to')}</span>
                  <span className="text-zinc-200 font-mono">
                    {item.address.slice(0, 8)}…{item.address.slice(-8)}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-zinc-500">{t('send.amount')}</span>
                  <span className="text-zinc-200 font-mono tabular-nums">{item.amount}</span>
                </div>
              </div>
            ))}

            <div className="flex justify-between items-center pt-2.5 border-t border-zinc-800/60">
              <span className="text-zinc-500">{t('common.fee')}</span>
              <span className="text-zinc-200 tabular-nums">
                {networkFee} {NAME_TOKEN}
              </span>
            </div>

            {dapInfo && (
              <div className="flex justify-between items-center pt-2.5 border-t border-zinc-800/60">
                <span className="text-zinc-500">{t('send.messageFee') || 'Message fee'}</span>
                <span className="text-zinc-200 tabular-nums">
                  {dapInfo.dapAmount} {NAME_TOKEN}
                </span>
              </div>
            )}

            <div className="flex justify-between items-start pt-2.5 border-t border-zinc-800/60 font-medium">
              <span className="text-zinc-300">{t('send.total')}</span>
              <div className="text-right">
                <div className="text-zinc-100 tabular-nums">
                  {sendAmountTotal} {NAME_TOKEN}
                </div>
                <div className="text-[10px] text-zinc-500 tabular-nums mt-0.5">
                  ≈ ${calcValue(sendAmountTotal, coinPrice)} USD
                </div>
              </div>
            </div>

            {dapMessage && (
              <div className="bg-zinc-950 rounded-md p-2 mt-2 border border-zinc-800/60">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  {t('send.message') || 'Message'}
                </div>
                <DapMessageDisplay
                  content={dapMessage}
                  buttonText={<>{t('dap.preview')}</>}
                  title={t('send.message')}
                  className="p-0 border-none bg-transparent justify-center"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <Label className="text-zinc-300 text-xs flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-purple-400" />
              {t('send.confirmTransaction')}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError('')
              }}
              placeholder={t('send.inputPassword')}
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
            <Button
              onClick={handlePasswordSubmit}
              disabled={isSliding || !password}
              variant="default"
              className="w-full h-10"
            >
              {isSliding ? <Spinner /> : t('send.confirmPay')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('send.confirm')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('send.send')} {sendAmountTotal} {NAME_TOKEN}，{t('send.fee')} {networkFee} {NAME_TOKEN}
                {dapInfo && `，${t('send.messageFee') || 'Message fee'} ${dapInfo.dapAmount} ${NAME_TOKEN}`}。
                <br />
                {t('send.confirmTransactionInfo')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelTransaction}>
                {isCancelLoading ? <Spinner /> : t('send.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmTransaction} className="bg-purple-600 text-white hover:bg-purple-500">
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
      {/* 余额 + 价格行 */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">
          {t('wallet.available')}:{' '}
          <span className="text-zinc-200 font-mono tabular-nums">{wallet.usableBalance}</span>{' '}
          <span className="text-zinc-500">{NAME_TOKEN}</span>
        </span>
        <span className="text-zinc-500 tabular-nums">
          1 {NAME_TOKEN} ≈ ${coinPrice}
        </span>
      </div>

      {/* 收款人输入卡（多行） */}
      {sendList.map((item, index) => (
        <Card key={index}>
          <CardContent className="space-y-2.5">
            <Label className="text-purple-400 text-xs">{t('send.to')}</Label>

            <div className="relative">
              <Input
                value={item.address}
                onChange={(e) => handleChangeAddress(index, e.target.value)}
                onBlur={() => handleBlurAddress(index)}
                placeholder={t('send.toInfo')}
                className={`pr-16 font-mono text-xs ${
                  addressErrors[index] ? 'border-red-500/60 focus-visible:border-red-500' : ''
                }`}
              />
              {item.address && (
                <button
                  onClick={() => handleChangeAddress(index, '')}
                  className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-100"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => handleScanQR(index)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-purple-400 hover:text-purple-300"
                aria-label="Scan QR"
              >
                <QrCode className="h-3.5 w-3.5" />
              </button>
            </div>

            {addressErrors[index] && (
              <p className="text-red-400 text-[11px]">{t('send.invalidAddress')}</p>
            )}

            <Label className="text-purple-400 text-xs">{t('common.amount')}</Label>

            <div className="relative">
              <Input
                value={item.amount}
                onChange={(e) => handleChangeAmount(index, e.target.value)}
                onBlur={() => validateAmount(index, item.amount)}
                placeholder="0"
                type="number"
                className={`pr-20 text-lg font-semibold tabular-nums ${
                  amountErrors[index] && lastAmountInputIndex === index
                    ? 'border-red-500/60 focus-visible:border-red-500'
                    : ''
                }`}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleMaxAmount(index)}
                  className="px-1.5 py-0.5 text-[10px] font-semibold text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 rounded uppercase tracking-wider"
                >
                  Max
                </button>
                <span className="text-xs text-zinc-400">{NAME_TOKEN}</span>
              </div>
            </div>

            {amountErrors[index] && lastAmountInputIndex === index && (
              <p className="text-red-400 text-[11px]">
                {t('send.amountExceed')} {wallet.usableBalance} {NAME_TOKEN}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* 添加另一位收款人 */}
      <button
        onClick={handleAddAddress}
        className="w-full px-3 py-2 rounded-lg border border-dashed border-zinc-700 hover:border-purple-500/60 hover:bg-zinc-900/40 transition-colors flex items-center justify-between text-xs"
      >
        <span className="text-purple-400">{t('send.addAnother')}</span>
        <ChevronRight className="h-3.5 w-3.5 text-purple-400" />
      </button>

      {/* 网络费 */}
      <Card>
        <CardContent className="space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-purple-400">{t('send.fee')}</span>
            <span className="text-zinc-200 tabular-nums">
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <Spinner size={3} />
                  …
                </span>
              ) : (
                <>
                  {networkFee} {NAME_TOKEN}
                </>
              )}
            </span>
          </div>

          <label className="flex items-center cursor-pointer p-1 rounded hover:bg-zinc-800/40 transition-colors">
            <Checkbox
              disabled={isForcedDeductFeeFromAmount}
              checked={deductFeeFromAmount}
              onCheckedChange={(checked) => setDeductFeeFromAmount(checked === true)}
              className="w-4 h-4 mr-2 shrink-0"
            />
            <span className="text-zinc-300 text-xs select-none">{t('send.feeDeducted')}</span>
          </label>
        </CardContent>
      </Card>

      {/* DAP 留言 */}
      <Card>
        <CardContent className="space-y-2">
          <Label className="text-purple-400 text-xs">{t('send.message') || 'Message'}</Label>
          <textarea
            value={dapMessage}
            onChange={(e) => setDapMessage(e.target.value)}
            placeholder={t('send.messagePlaceholder') || 'Enter your message (optional)'}
            className="w-full bg-zinc-950 text-zinc-100 placeholder-zinc-500 border border-border rounded-md p-2 text-xs resize-none h-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          />

          {dapInfo && (
            <div className="space-y-1 rounded-md bg-zinc-950 p-2 text-[11px] border border-zinc-800/60">
              <Row label={t('send.messageFee') || 'Message fee'}>
                <span className="tabular-nums">
                  {dapInfo.dapAmount} {NAME_TOKEN}{' '}
                  <span className="text-zinc-500">
                    · {dapInfo.chunkCount} {dapInfo.chunkCount === 1 ? 'chunk' : 'chunks'}
                  </span>
                </span>
              </Row>
              <Row label={t('send.messageNetworkFee') || 'Message network fee'}>
                <span className="tabular-nums">
                  {dapNetworkFee} {NAME_TOKEN}
                </span>
              </Row>
              <Row label={t('send.totalFee') || 'Total fee'} bold>
                <span className="tabular-nums">
                  {totalFee} {NAME_TOKEN}
                </span>
              </Row>
            </div>
          )}
        </CardContent>
      </Card>

      {totalAmountError && (
        <div className="text-red-400 text-[11px] text-center bg-red-500/10 border border-red-500/30 rounded-md p-2">
          {totalAmountError}
        </div>
      )}

      <Button
        onClick={handleSendToConfirm}
        disabled={networkFee <= 0 || isLoading || !!totalAmountError}
        variant="default"
        className="w-full h-10"
      >
        {isLoading ? <Spinner /> : t('send.confirm')}
      </Button>

      <QRScannerComponent isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} onScanResult={handleScanResult} />
    </div>
  )
}

// ============================================================
// 工具组件
// ============================================================

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-100`}
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    />
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
