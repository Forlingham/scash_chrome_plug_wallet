'use client'

// 发送页面（升级版）
// 与 web 钱包 components/wallet-send.tsx 同源，差异：
//   - 使用 utils 提供的 getWalletPrivateKey，避免在组件里再造一次 BIP32 派生。
//   - 不再依赖 process.env 测试网开关。

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
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/contexts/language-context'
import { useToast } from '@/hooks/use-toast'
import { onBroadcastApi, Unspent } from '@/lib/api'
import {
  calcAppFee,
  calcFee,
  calcValue,
  decryptWallet,
  getDapInstance,
  getWalletPrivateKey,
  hideString,
  NAME_TOKEN,
  onOpenExplorer,
  signTransaction,
  sleep,
  validateScashAddress
} from '@/lib/utils'
import { PendingTransaction, useWalletActions, useWalletState } from '@/stores/wallet-store'
import Decimal from 'decimal.js'
import { ArrowUpDown, ChevronRight, ExternalLink, Lock, QrCode, X } from 'lucide-react'
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
      validSendList.reduce((acc, item) => acc.plus(new Decimal(item.amount || '0')), new Decimal(0))
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
          amount: (output.value / 1e8).toString()
        })),
        dapAmount,
        chunkCount: dapOutputs.length
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
    const validSendList = JSON.parse(
      JSON.stringify(
        sendList.filter((item) => {
          return item.address && validateScashAddress(item.address) && item.amount && Number.parseFloat(item.amount) > 0
        })
      )
    )
    if (validSendList.length === 0) {
      setSendListConfirm([])
      return
    }
    setStep('confirm')

    let feeWithDap = networkFee
    if (dapInfo) feeWithDap = new Decimal(feeWithDap).plus(dapInfo.dapAmount).toNumber()

    if (!deductFeeFromAmount) {
      setSendAmountTotal(+new Decimal(sendAmount).add(feeWithDap).toFixed(8))
    } else {
      let lastIndex = validSendList.length - 1
      while (lastIndex >= 0) {
        if (new Decimal(validSendList[lastIndex].amount || '0').gte(feeWithDap)) {
          validSendList[lastIndex].amount = new Decimal(validSendList[lastIndex].amount || '0').minus(feeWithDap).toString()
          break
        }
        lastIndex--
      }
      if (lastIndex < 0) {
        setTotalAmountError(t('send.inputExceed'))
        return
      }
      setSendAmountTotal(sendAmount)
    }

    setSendListConfirm(validSendList)
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
        appFee: signTransactionResult.appFee
      })

      if (res.data.error) {
        toast({
          title: '错误码:' + res.data.error.error.code,
          description: res.data.error.error.message,
          variant: 'destructive'
        })
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
        status: 'pending'
      }
      await sleep(1533)
      addPendingTransaction(pendingTransaction)
      // 立即重算余额，让用户回到首页能立刻看到"找零已可用 + 输入已扣除"，
      // 而不是等下一次 22 秒刷新。
      setUpdateBalanceByMemPool()
      setCurrentPendingTransaction(pendingTransaction)
      setStep('success')
      setIsSliding(false)
      setPassword('')
      toast({ title: t('send.success'), description: t('send.broadcast'), variant: 'success' })
    } catch (error: any) {
      console.log(error, 'error')
      if (error?.data?.data?.success === false) {
        toast({
          title: t('send.error') + ': 500',
          description: error?.data?.message || t('send.errorInfo'),
          variant: 'destructive'
        })
        return
      }
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

  if (step === 'success') {
    return (
      <div className="flex-1 flex items-center justify-center p-4 min-h-screen">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center mx-auto shadow-2xl border-2 border-purple-400">
                <ArrowUpDown className="h-10 w-10 text-white rotate-90" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">{t('send.success')}</h2>
              <p className="text-purple-300 text-sm">{t('send.broadcast')}</p>
            </div>

            {currentPendingTransaction && (
              <div className="space-y-4">
                <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-600/30 backdrop-blur-sm">
                  <div className="flex flex-col space-y-2">
                    <p className="text-purple-300 text-xs uppercase tracking-wide">Transaction ID</p>
                    <p className="text-white text-sm font-mono break-all">{currentPendingTransaction.id}</p>
                    <button
                      onClick={() => onOpenExplorer('1', 'tx', currentPendingTransaction.id)}
                      className="flex items-center space-x-1 text-purple-300 hover:text-white text-sm transition-colors self-start mt-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>{t('transactions.openExplorer')}</span>
                    </button>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-900/50 to-purple-800/50 rounded-xl p-4 border border-purple-600/30 backdrop-blur-sm">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white mb-1">
                      {sendAmountTotal} {NAME_TOKEN}
                    </p>
                    <p className="text-purple-300 text-sm">${calcValue(sendAmountTotal, coinPrice)} USD</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {currentPendingTransaction?.sendListConfirm.map((item, index) => (
                    <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-600/30 backdrop-blur-sm" key={index}>
                      <div className="flex justify-between items-center">
                        <div className="flex-1 min-w-0">
                          <p className="text-purple-300 text-xs uppercase tracking-wide mb-1">To</p>
                          <p className="text-white text-sm font-mono truncate">{hideString(item.address)}</p>
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-purple-300 text-xs uppercase tracking-wide mb-1">Amount</p>
                          <p className="text-white text-sm font-semibold">
                            {item.amount} {NAME_TOKEN}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {dapMessage && (
                  <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-600/30 backdrop-blur-sm">
                    <p className="text-purple-300 text-xs uppercase tracking-wide mb-1">{t('send.message')}:</p>
                    <DapMessageDisplay
                      content={dapMessage}
                      buttonText={<>{t('dap.preview')}</>}
                      title={t('send.message')}
                      className="p-0 border-none bg-transparent justify-center"
                    />
                  </div>
                )}

                <div className="bg-purple-950/50 rounded-lg p-3 border border-purple-600/30 backdrop-blur-sm">
                  <p className="text-purple-300 text-xs uppercase tracking-wide mb-2">{t('send.rawTransaction')}</p>
                  <div className="bg-black/50 rounded p-2 max-h-20 overflow-y-auto border border-purple-800/30">
                    <p className="text-purple-400 text-xs font-mono break-all leading-relaxed">{currentPendingTransaction?.rawtx}</p>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => onNavigate('home')}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl border border-purple-500/50"
            >
              {t('send.backToHome')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">{t('send.confirm')}</h2>
        </div>

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="px-4 space-y-4">
            <div className="text-center"></div>

            <div className="flex justify-between">
              <span className="text-gray-400">{t('send.from')}:</span>
              <span className="text-white">
                {wallet.address.slice(0, 10)}...{wallet.address.slice(-10)}
              </span>
            </div>

            {sendListConfirm.map((item, index) => (
              <div className="space-y-3 border-t border-gray-600 pt-3" key={index}>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('send.to')}:</span>
                  <span className="text-white font-mono text-sm">
                    {item.address.slice(0, 10)}...{item.address.slice(-10)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('send.amount')}:</span>
                  <span className="text-white font-mono text-sm">{item.amount}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-600 pt-3">
              <span className="text-gray-400">{t('common.fee')}:</span>
              <span className="text-white flex items-center gap-2">
                {networkFee} {NAME_TOKEN}
              </span>
            </div>

            {dapInfo && (
              <div className="flex justify-between border-t border-gray-600 pt-3">
                <span className="text-gray-400">{t('send.messageFee') || 'Message fee'}:</span>
                <span className="text-white flex items-center gap-2">
                  {dapInfo.dapAmount} {NAME_TOKEN}
                </span>
              </div>
            )}

            <div>
              <div className="flex justify-between font-semibold">
                <span className="text-gray-400">{t('send.total')}:</span>
                <div className="text-right">
                  <span className="text-white">
                    {sendAmountTotal} {NAME_TOKEN}
                  </span>
                  <br />
                  <span className="text-white">${calcValue(sendAmountTotal, coinPrice)} USD</span>
                </div>
              </div>
            </div>

            {dapMessage && (
              <div className="bg-gray-900/50 rounded-lg p-3 mt-3">
                <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">{t('send.message') || 'Message'}:</div>
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

        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="px-4 py-4 space-y-4">
            <Label className="text-white flex items-center gap-2">
              <Lock className="h-4 w-4" />
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
              className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
            />
            {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
          </CardContent>
        </Card>

        <AlertDialog open={showConfirmDialog} onOpenChange={(open) => { if (!open) return; setShowConfirmDialog(open) }}>
          <AlertDialogTrigger asChild>
            <Button
              onClick={handlePasswordSubmit}
              disabled={isSliding || !password}
              className="w-full bg-green-500 hover:bg-green-600 text-white h-12"
            >
              {isSliding ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : t('send.confirmPay')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-gray-800 border-gray-700">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">{t('send.confirm')}</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-300">
                {t('send.send')} {sendAmountTotal} {NAME_TOKEN}，{t('send.fee')} {networkFee} {NAME_TOKEN}
                {dapInfo && `，${t('send.messageFee') || 'Message fee'} ${dapInfo.dapAmount} ${NAME_TOKEN}`}。
                <br />
                {t('send.confirmTransactionInfo')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelTransaction} className="bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600">
                {isCancelLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : t('send.cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmTransaction} className="bg-green-500 hover:bg-green-600 text-white">
                {isConfirmLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  t('send.confirmTransactionOn')
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button onClick={() => setStep('form')} variant="outline" className="w-full border-gray-600 text-gray-300 hover:bg-gray-700">
          {t('send.backToEdit')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">
            {t('wallet.available')}: {wallet.usableBalance} {NAME_TOKEN}
          </span>
          <div className="text-right">
            <div className="text-white font-medium">1 {NAME_TOKEN}</div>
            <div className="text-gray-400">${coinPrice} USD</div>
          </div>
        </div>
      </div>

      {sendList.map((item, index) => (
        <Card key={index} className="bg-gray-800 border-gray-700">
          <CardContent className="px-4 space-y-3">
            <Label className="text-green-400">{t('send.to')}</Label>

            <div className="relative">
              <Input
                value={item.address}
                onChange={(e) => handleChangeAddress(index, e.target.value)}
                onBlur={() => handleBlurAddress(index)}
                placeholder={t('send.toInfo')}
                className={`bg-gray-900 text-white pr-20 ${
                  addressErrors[index] ? 'border-red-500 focus:border-red-500' : 'border-gray-600'
                }`}
              />
              {item.address && (
                <Button
                  onClick={() => handleChangeAddress(index, '')}
                  variant="ghost"
                  size="sm"
                  className="absolute right-8 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-green-300"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                onClick={() => handleScanQR(index)}
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 text-green-400 hover:text-green-300"
              >
                <QrCode className="h-4 w-4" />
              </Button>
            </div>

            {addressErrors[index] && <div className="text-red-400 text-sm mt-1">{t('send.invalidAddress')}</div>}

            <Label className="text-green-400">{t('common.amount')}:</Label>

            <div className="space-y-2">
              <div className="relative">
                <Input
                  value={item.amount}
                  onChange={(e) => handleChangeAmount(index, e.target.value)}
                  onBlur={() => validateAmount(index, item.amount)}
                  placeholder="0"
                  type="number"
                  className={`bg-gray-900 text-white text-2xl font-bold pr-20 ${
                    amountErrors[index] && lastAmountInputIndex === index ? 'border-red-500 focus:border-red-500' : 'border-gray-600'
                  }`}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleMaxAmount(index)}
                    className="text-purple-400 hover:text-purple-300 text-sm font-medium"
                  >
                    MAX
                  </button>
                  <span className="text-white font-medium">{NAME_TOKEN}</span>
                </div>
              </div>

              {amountErrors[index] && lastAmountInputIndex === index && (
                <div className="text-red-400 text-sm mt-1">
                  {t('send.amountExceed')} {wallet.usableBalance} {NAME_TOKEN}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add Another */}
      <Card className="bg-gray-800 border-gray-700 cursor-pointer hover:bg-gray-750" onClick={handleAddAddress}>
        <CardContent className="px-4">
          <div className="flex items-center justify-between">
            <span className="text-green-400">{t('send.addAnother')}</span>
            <ChevronRight className="h-4 w-4 text-green-400" />
          </div>
        </CardContent>
      </Card>

      {/* Network Fee */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="px-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-green-400">{t('send.fee')}:</div>
              <div className="text-white flex items-center gap-2">
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400"></div>
                    <span className="text-gray-400">...</span>
                  </>
                ) : (
                  <>
                    {networkFee} {NAME_TOKEN}
                  </>
                )}
              </div>
            </div>
          </div>

          <label className="flex items-center cursor-pointer hover:bg-gray-800/50 p-2 rounded-lg transition-colors">
            <Checkbox
              disabled={isForcedDeductFeeFromAmount}
              checked={deductFeeFromAmount}
              onCheckedChange={(checked) => setDeductFeeFromAmount(checked === true)}
              className="w-4 h-4 min-w-4 max-w-4 min-h-4 max-h-4 flex-shrink-0 mr-3 border-2 border-gray-500 data-[state=unchecked]:border-gray-500 data-[state=unchecked]:bg-transparent"
            />
            <span className="text-gray-300 text-sm select-none">{t('send.feeDeducted')}</span>
          </label>
        </CardContent>
      </Card>

      {/* DAP Message */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="px-4 space-y-3">
          <div className="text-green-400">{t('send.message') || 'Message'}:</div>
          <textarea
            value={dapMessage}
            onChange={(e) => setDapMessage(e.target.value)}
            placeholder={t('send.messagePlaceholder') || 'Enter your message (optional)'}
            className="w-full bg-gray-900 text-white border border-gray-600 rounded-lg p-3 resize-none h-24 focus:outline-none focus:border-green-400"
          />

          {dapInfo && (
            <div className="space-y-2 bg-gray-900/50 rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('send.messageFee') || 'Message fee'}:</span>
                <span className="text-white">
                  {dapInfo.dapAmount} {NAME_TOKEN} ({dapInfo.chunkCount} {dapInfo.chunkCount === 1 ? 'chunk' : 'chunks'})
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t('send.messageNetworkFee') || 'Message network fee'}:</span>
                <span className="text-white">
                  {dapNetworkFee} {NAME_TOKEN}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-300">{t('send.totalFee') || 'Total fee'}:</span>
                <span className="text-white">
                  {totalFee} {NAME_TOKEN}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalAmountError && (
        <div className="text-red-400 text-sm text-center bg-red-900/20 border border-red-700 rounded-lg p-2">{totalAmountError}</div>
      )}

      <Button
        onClick={handleSendToConfirm}
        disabled={networkFee <= 0 || isLoading || !!totalAmountError}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white disabled:bg-gray-600 disabled:text-gray-400"
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span>...</span>
          </div>
        ) : (
          t('send.confirm')
        )}
      </Button>

      <QRScannerComponent isOpen={showQRScanner} onClose={() => setShowQRScanner(false)} onScanResult={handleScanResult} />
    </div>
  )
}
