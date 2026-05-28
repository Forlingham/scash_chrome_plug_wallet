'use client'

// 钱包首页（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为与之前完全一致：
//   - 拉取地址交易（getTxs），每 3 分钟一次
//   - 解析 DAP 留言，渲染消息卡片
//   - 根据 unspent 推导 confirmed / pending 状态
//   - 监听登录过期（2h 不操作自动锁仓）
//
// 视觉/交互的桌面化改造：
//   - 删除"滚动驱动 header 缩放动画"（手机沉浸式设计，桌面工具栏应稳定）
//   - 删除滚动时弹出的余额条
//   - 余额卡片：去渐变，单一 zinc-900 卡片 + emerald 强调
//   - 4 个动作按钮：统一中性风格，唯一 Send 用 emerald 高亮（主 CTA 语义）
//   - 交易列表：信息密度更高，图标尺寸收紧到 28px
//   - DAP 消息卡片：替换过重的 purple 为更内敛的 indigo
// ----------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/language-context'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Settings,
  Clock,
  X,
  Database,
  WifiOff,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'
import { calcValue, NAME_TOKEN, onOpenExplorer } from '@/lib/utils'
import { PendingTransaction, Transaction, useWalletActions, useWalletState } from '@/stores/wallet-store'
import { getAddressTxsExtApi } from '@/lib/externalApi'
import { parseDapMessage, type DapMessage } from '@/lib/dap'
import Decimal from 'decimal.js'
import { getRawTransactionApi } from '@/lib/api'
import { DapMessageDisplay } from './dap-message-display'
import { PriceChartCard } from './price-chart-card'

interface WalletHomeProps {
  onNavigate: (view: string) => void
}

// 信号强度计算结果
interface SignalInfo {
  bars: number
  /** Tailwind text-color 类名，例如 "text-emerald-400" */
  color: string
  /** Tailwind bg-color 类名（与 color 对应），用于条状指示器 */
  bg: string
  label: string
}

export function WalletHome({ onNavigate }: WalletHomeProps) {
  const {
    wallet,
    coinPrice,
    unspent,
    transactions,
    pendingTransactions,
    blockchainInfo,
    confirmations,
    isLocked,
    nodeInfo,
  } = useWalletState()
  const { addTransaction, addPendingTransaction, lockWallet, setMemPoolBalance } = useWalletActions()
  const { t } = useLanguage()

  const [getAddressTxsLoading, setGetAddressTxsLoading] = useState<boolean>(false)
  const [explorerConnectionStatus, setExplorerConnectionStatus] =
    useState<'connected' | 'disconnected' | 'checking'>('checking')
  const [explorerResponseTime, setExplorerResponseTime] = useState<number>(0)
  const [dapMessages, setDapMessages] = useState<Map<string, DapMessage>>(new Map())

  async function getTxs() {
    if (!wallet.address) return
    if (getAddressTxsLoading) return

    const startTime = Date.now()

    try {
      setGetAddressTxsLoading(true)
      setExplorerConnectionStatus('checking')

      const res = await getAddressTxsExtApi(wallet.address)

      const responseTime = Date.now() - startTime
      setExplorerResponseTime(responseTime)
      setExplorerConnectionStatus('connected')

      if (!res || !res.length) {
        setMemPoolBalance(0)
        return
      }

      // 内存池入账：只计算别人转给我、还没上链的部分
      let memPoolIncoming = new Decimal(0)
      for (const tx of res) {
        if ((tx.confirmations ?? 0) === 0 && tx.type === 'income') {
          memPoolIncoming = memPoolIncoming.plus(new Decimal(tx.netAmount || 0))
        }
      }
      setMemPoolBalance(memPoolIncoming.toNumber())

      // DAP 留言解析
      const newDapMessages = new Map<string, DapMessage>()
      for (const tx of res) {
        if (tx.rawTransaction) {
          const outputs = (tx.rawTransaction.vouts || tx.rawTransaction.receivers || []) as any[]
          const senderAddress = tx.rawTransaction.senders?.[0]?.address || ''
          const dapMessage = parseDapMessage(outputs, senderAddress, wallet.address)
          if (dapMessage) newDapMessages.set(tx.txid, dapMessage)
        }
      }
      setDapMessages(newDapMessages)

      for (const tx of [...res].reverse()) {
        let txInfo: Transaction
        const unspentTx = unspent.find((item) => item.txid === tx.txid)
        const type = ['income', 'mining'].includes(tx.type) ? 'receive' : 'send'
        let amount = 0
        if (type === 'send') {
          amount = new Decimal(tx.netAmount).toNumber() * -1
        } else {
          amount = tx.netAmount
        }
        if (unspentTx) {
          txInfo = {
            id: tx.txid,
            type,
            amount,
            address: '',
            timestamp: new Date(tx.timestamp).getTime(),
            status: unspentTx.isUsable ? 'confirmed' : 'pending',
            height: unspentTx.height,
          }
        } else {
          txInfo = {
            id: tx.txid,
            type,
            amount,
            address: '',
            timestamp: new Date(tx.timestamp).getTime(),
            status: 'confirmed',
            height: 0,
          }
        }
        addTransaction(txInfo)
      }
    } catch (error) {
      console.log(error, 'error')
      setExplorerConnectionStatus('disconnected')
    } finally {
      setGetAddressTxsLoading(false)
    }
  }

  // ===== 信号强度统一推导器（节点 / 浏览器都用） =====
  // 从 ms 响应时间映射到 4 档信号；颜色用 emerald → amber → red 渐进，
  // 而不是之前的红绿黄混搭，更符合金融工具的克制感。
  function buildSignal(
    status: 'connected' | 'disconnected' | 'checking',
    responseTime: number,
  ): SignalInfo {
    if (status === 'disconnected') {
      return {
        bars: 0,
        color: 'text-red-400',
        bg: 'bg-red-400',
        label: t('node.signal.disconnected'),
      }
    }
    if (status === 'checking') {
      return {
        bars: 0,
        color: 'text-amber-400',
        bg: 'bg-amber-400',
        label: t('explorer.status.checking'),
      }
    }
    if (responseTime < 500) {
      return {
        bars: 3,
        color: 'text-emerald-400',
        bg: 'bg-emerald-400',
        label: `${t('node.signal.excellent')} (${responseTime}ms)`,
      }
    }
    if (responseTime < 1500) {
      return {
        bars: 2,
        color: 'text-emerald-300',
        bg: 'bg-emerald-300',
        label: `${t('node.signal.good')} (${responseTime}ms)`,
      }
    }
    if (responseTime < 3000) {
      return {
        bars: 1,
        color: 'text-amber-400',
        bg: 'bg-amber-400',
        label: `${t('node.signal.fair')} (${responseTime}ms)`,
      }
    }
    return {
      bars: 1,
      color: 'text-amber-500',
      bg: 'bg-amber-500',
      label: `${t('node.signal.slow')} (${responseTime}ms)`,
    }
  }

  const explorerSignal = buildSignal(explorerConnectionStatus, explorerResponseTime)
  const nodeSignal = buildSignal(nodeInfo.status, nodeInfo.responseTime)

  async function getRawTransaction(pendingTx: PendingTransaction) {
    try {
      const res = await getRawTransactionApi(pendingTx.id)
      if (!res.data.success) return
      if (res.data.rpcData.blockhash) {
        addPendingTransaction({ ...pendingTx, status: 'confirmed' })
      }
    } catch (error) {
      console.log(error, 'error')
    }
  }
  async function getPendingTxs() {
    for (const tx of pendingTransactions) {
      if (tx.status === 'pending') await getRawTransaction(tx)
    }
  }

  const onLoginExpired = () => {
    if (!isLocked) {
      const loginTime = localStorage.getItem('loginTime')
      if (!loginTime) {
        localStorage.setItem('loginTime', new Date().getTime().toString())
        return
      }
      const currentTime = new Date().getTime()
      const timeDiff = currentTime - Number(loginTime)
      const time = 1000 * 60 * 60 * 2
      if (timeDiff > time) {
        localStorage.setItem('loginTime', '')
        lockWallet()
      } else {
        localStorage.setItem('loginTime', new Date().getTime().toString())
      }
    }
  }

  useEffect(() => {
    const txsIntervalTime = 1000 * 60 * 3
    getTxs()
    const txsInterval = setTimeout(() => {
      getTxs()
    }, txsIntervalTime)

    getPendingTxs()
    onLoginExpired()

    return () => {
      clearTimeout(txsInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.balance, unspent])

  // ===== 余额数字渲染：整数加千分位、保留小数部分小一号 =====
  const balanceStr = wallet.balance.toString()
  const balanceInt = balanceStr.split('.')[0]
  const balanceFrac = balanceStr.includes('.') ? balanceStr.split('.')[1] : ''

  return (
    <>
      {/* ============================================================
          顶部工具栏（固定）
          - 静态布局，无滚动动画
          - 左：Logo + 品牌名（短版 SCASH，原 wallet.title 在 360 太长）
          - 右：当前区块高度 + 设置入口
          ============================================================ */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-b border-zinc-800/60">
        <div className="flex items-center justify-between px-3 h-12">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative shrink-0">
              <img
                src="/logo.png"
                alt="SCASH"
                className="w-7 h-7 rounded-full ring-1 ring-zinc-700/60"
              />
              {/* 在线指示点 */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-background ${
                  nodeInfo.status === 'connected'
                    ? 'bg-emerald-400'
                    : nodeInfo.status === 'checking'
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                }`}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-zinc-100 leading-none">SCASH</h1>
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{t('wallet.subtitle')}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* 区块高度 chip */}
            <div className="flex flex-col items-end px-2 py-0.5 rounded-md bg-zinc-800/60">
              <span className="text-[9px] text-zinc-500 leading-none uppercase tracking-wider">
                {t('wallet.blockHeight')}
              </span>
              <span className="text-[11px] text-zinc-200 font-medium font-mono leading-tight mt-0.5">
                {blockchainInfo.headers ? blockchainInfo.headers.toLocaleString() : '—'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-zinc-400 hover:text-zinc-100"
              onClick={() => onNavigate('settings')}
              aria-label={t('settings.title')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ============================================================
          主滚动容器
          ============================================================ */}
      <div
        id="wallet-scroll-container"
        className="pt-12 h-full overflow-y-auto px-3 pb-3 space-y-3"
      >
        {/* ========== 余额卡片 ========== */}
        <div className="relative rounded-lg border border-zinc-800/80 bg-gradient-to-b from-zinc-900 to-zinc-950 overflow-hidden">
          {/* 节点状态条（顶部内联） */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-1.5 min-w-0">
              {nodeInfo.status === 'disconnected' && (
                <WifiOff className="h-3 w-3 text-red-400 shrink-0" />
              )}
              {nodeInfo.status === 'checking' && (
                <span className="h-3 w-3 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin shrink-0" />
              )}
              {nodeInfo.status === 'connected' && (
                <span className="flex items-end gap-px shrink-0">
                  {[1, 2, 3].map((bar) => (
                    <span
                      key={bar}
                      className={`w-0.5 rounded-sm ${
                        bar <= nodeSignal.bars ? nodeSignal.bg : 'bg-zinc-700'
                      }`}
                      style={{ height: `${bar * 3}px` }}
                    />
                  ))}
                </span>
              )}
              {nodeInfo.status === 'disconnected' ? (
                <button
                  className="text-[10px] text-red-400 hover:underline"
                  onClick={() => onNavigate('settings')}
                >
                  {t('node.status.disconnected')}
                </button>
              ) : nodeInfo.status === 'checking' ? (
                <span className="text-[10px] text-amber-400">{t('node.status.checking')}</span>
              ) : (
                <span className={`text-[10px] truncate ${nodeSignal.color}`}>{nodeSignal.label}</span>
              )}
            </div>
          </div>

          {/* 主余额数字 */}
          <div className="px-4 pt-4 pb-3 text-center">
            <div className="text-2xl font-semibold text-zinc-50 tracking-tight tabular-nums leading-none">
              {balanceInt && Number(balanceInt).toLocaleString()}
              {balanceFrac && (
                <span className="text-base text-zinc-400">.{balanceFrac}</span>
              )}
              <span className="ml-1.5 text-xs text-zinc-500 font-normal align-baseline">
                {NAME_TOKEN}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-zinc-500 tabular-nums">
              ≈ ${calcValue(wallet.balance, coinPrice)} USD
            </div>
          </div>

          {/* 三联余额细分 */}
          <div className="grid grid-cols-3 gap-px bg-zinc-800/60 border-t border-zinc-800/60">
            <div className="px-2 py-2 text-center bg-zinc-900">
              <div className="text-[9px] text-emerald-400/80 font-medium uppercase tracking-wider">
                {t('wallet.available')}
              </div>
              <div className="text-xs text-zinc-100 font-medium font-mono mt-0.5 tabular-nums">
                {wallet.usableBalance}
              </div>
            </div>
            <div className="px-2 py-2 text-center bg-zinc-900">
              <div className="text-[9px] text-amber-400/80 font-medium uppercase tracking-wider">
                {t('wallet.locked')}
              </div>
              <div className="text-xs text-zinc-100 font-medium font-mono mt-0.5 tabular-nums">
                {wallet.lockBalance}
              </div>
            </div>
            <div className="px-2 py-2 text-center bg-zinc-900">
              <div className="text-[9px] text-sky-400/80 font-medium uppercase tracking-wider">
                {t('wallet.memPool')}
              </div>
              <div className="text-xs text-zinc-100 font-medium font-mono mt-0.5 tabular-nums">
                {wallet.memPoolBalance}
              </div>
            </div>
          </div>
        </div>

        {/* ========== 4 个操作按钮 ==========
            视觉策略：
            - 不再 4 种渐变背景，统一 zinc-900 卡片 + zinc-800/60 边框
            - 唯一 "Send" 用 emerald 强调（主 CTA 语义）
            - hover 时整卡背景从 zinc-900 → zinc-800
            - 去掉 active:scale-95（手机点按反馈，桌面用 hover 反馈替代）
        */}
        <div className="grid grid-cols-4 gap-2">
          <ActionButton
            icon={<ArrowUp className="h-4 w-4" />}
            label={t('action.send')}
            onClick={() => onNavigate('send')}
            primary
          />
          <ActionButton
            icon={<ArrowDown className="h-4 w-4" />}
            label={t('action.receive')}
            onClick={() => onNavigate('receive')}
          />
          <ActionButton
            icon={<MessageSquare className="h-4 w-4" />}
            label={t('action.engrave')}
            onClick={() => onNavigate('engrave')}
          />
          <ActionButton
            icon={<ArrowUpDown className="h-4 w-4" />}
            label={t('action.trade')}
            onClick={() => onNavigate('trade')}
          />
        </div>

        {/* ========== 币价走势 ========== */}
        <PriceChartCard />

        {/* ========== 交易记录 ========== */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900">
          {/* 区块浏览器状态 + 标题 + 在浏览器查看 */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-1.5 min-w-0">
              {explorerConnectionStatus === 'disconnected' && (
                <WifiOff className="h-3 w-3 text-red-400 shrink-0" />
              )}
              {explorerConnectionStatus === 'checking' && (
                <span className="h-3 w-3 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin shrink-0" />
              )}
              {explorerConnectionStatus === 'connected' && (
                <span className="flex items-end gap-px shrink-0">
                  {[1, 2, 3].map((bar) => (
                    <span
                      key={bar}
                      className={`w-0.5 rounded-sm ${
                        bar <= explorerSignal.bars ? explorerSignal.bg : 'bg-zinc-700'
                      }`}
                      style={{ height: `${bar * 3}px` }}
                    />
                  ))}
                </span>
              )}
              <span className="text-[10px] font-medium text-zinc-300">
                {t('transactions.recent')}
              </span>
              <span className={`text-[10px] truncate ${explorerSignal.color}`}>
                · {explorerSignal.label}
              </span>
            </div>
            <button
              onClick={() => onOpenExplorer('2', 'address', wallet.address)}
              className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors shrink-0"
            >
              {t('transactions.openExplorer')}
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>

          {/* 列表本体 */}
          <div className="divide-y divide-zinc-800/50">
            {/* 待广播交易（自己发出但还在 mempool） */}
            {pendingTransactions
              .filter((tx) => tx.status === 'pending')
              .map((tx) => (
                <div key={tx.id} className="px-3 py-2.5 hover:bg-zinc-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-500/15 ring-1 ring-amber-500/30 shrink-0">
                        <Database className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-100 font-medium leading-tight">
                          {t('transactions.sent')} {NAME_TOKEN}
                        </p>
                        {tx.id && (
                          <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                            {tx.id.slice(0, 8)}…{tx.id.slice(-6)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-red-400 tabular-nums">−{tx.totalOutput}</p>
                      <p className="text-[10px] text-zinc-500 tabular-nums">
                        ${calcValue(tx.totalOutput, coinPrice)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 min-w-0">
                      <span className="truncate">{new Date(tx.timestamp).toLocaleString()}</span>
                      <span className="text-amber-400 shrink-0">· {t('transactions.memPool')}</span>
                    </div>
                    <button
                      onClick={() => onOpenExplorer('1', 'tx', tx.id)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0"
                    >
                      {t('transactions.particulars')}
                    </button>
                  </div>
                </div>
              ))}

            {/* 已确认/历史交易 */}
            {transactions.map((tx) => {
              const dapMessage = dapMessages.get(tx.id)
              const isReceive = tx.type === 'receive'
              const isPending = tx.status === 'pending'
              const isFailed = tx.status === 'failed'

              return (
                <div key={tx.id} className="px-3 py-2.5 hover:bg-zinc-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* 状态图标 */}
                      {isPending && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-500/15 ring-1 ring-amber-500/30 shrink-0">
                          <Clock className="h-3.5 w-3.5 text-amber-400" />
                        </div>
                      )}
                      {!isPending && !isFailed && (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-1 ${
                            isReceive
                              ? 'bg-emerald-500/15 ring-emerald-500/30'
                              : 'bg-red-500/15 ring-red-500/30'
                          }`}
                        >
                          {isReceive ? (
                            <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 text-red-400" />
                          )}
                        </div>
                      )}
                      {isFailed && (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center bg-zinc-700/40 ring-1 ring-zinc-600/40 shrink-0">
                          <X className="h-3.5 w-3.5 text-zinc-400" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-xs text-zinc-100 font-medium leading-tight">
                          {isReceive ? t('transactions.received') : t('transactions.sent')} {NAME_TOKEN}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                          {tx.id.slice(0, 8)}…{tx.id.slice(-6)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-xs font-medium tabular-nums ${
                          isReceive ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {tx.amount > 0 ? '+' : ''}
                        {tx.amount}
                      </p>
                      <p className="text-[10px] text-zinc-500 tabular-nums">
                        ${calcValue(tx.amount, coinPrice)}
                      </p>
                    </div>
                  </div>

                  {/* DAP 消息：换为 indigo 系，比 purple 更内敛 */}
                  {dapMessage && (
                    <div className="mt-2 p-2 rounded-md bg-indigo-500/10 border border-indigo-500/25">
                      <div className="flex items-start gap-1.5 mb-1">
                        <MessageSquare className="h-3 w-3 text-indigo-300 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-indigo-200 font-medium leading-tight">
                          {dapMessage.isFromSelf
                            ? dapMessage.isPureMessage
                              ? t('dap.myNote')
                              : t('dap.transferNote')
                            : dapMessage.isPureMessage
                              ? t('dap.receivedNote')
                              : t('dap.senderNote')}
                        </p>
                      </div>
                      <DapMessageDisplay content={dapMessage.content} />
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-zinc-800/50">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 min-w-0">
                      <span className="truncate">{new Date(tx.timestamp).toLocaleString()}</span>
                      {isPending && (
                        <span className="text-amber-400 shrink-0 whitespace-nowrap">
                          · {t('transactions.confirmations')} {confirmations}/
                          {blockchainInfo.headers - tx.height}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onOpenExplorer('2', 'tx', tx.id)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 shrink-0"
                    >
                      {t('transactions.particulars')}
                    </button>
                  </div>
                </div>
              )
            })}

            {/* 空状态 */}
            {transactions.length === 0 &&
              pendingTransactions.filter((tx) => tx.status === 'pending').length === 0 && (
                <div className="px-3 py-8 text-center">
                  <p className="text-xs text-zinc-500">—</p>
                </div>
              )}
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================
// 内部组件：动作按钮（首页四方格之一）
// ------------------------------------------------------------
// primary=true 时使用 emerald 主色调（仅 Send 按钮使用），
// 其余按钮走中性 zinc，避免 4 色彩虹混搭。
// ============================================================
function ActionButton({
  icon,
  label,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        primary
          ? 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15 hover:border-emerald-500/60'
          : 'bg-zinc-900 border-zinc-800/80 hover:bg-zinc-800 hover:border-zinc-700'
      }`}
    >
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
          primary
            ? 'bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500/30'
            : 'bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700 group-hover:text-zinc-100'
        }`}
      >
        {icon}
      </span>
      <span
        className={`text-[10px] font-medium tracking-wide ${
          primary ? 'text-emerald-300' : 'text-zinc-400 group-hover:text-zinc-200'
        }`}
      >
        {label}
      </span>
    </button>
  )
}
