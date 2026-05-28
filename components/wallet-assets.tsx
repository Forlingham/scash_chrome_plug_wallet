'use client'

// 资产列表页（Chrome 插件桌面化重塑）
// 注意：当前数据为 mock，待后端接入真实资产 / 历史 / 价格走势接口后替换。
// 这里只做视觉重塑，结构上保留搜索 + 筛选 + 列表 + 详情子页的分层。

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/contexts/language-context'
import { ArrowDown, ArrowUp, Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { TransactionDetails } from '@/components/transaction-details'
import { NAME_TOKEN } from '@/lib/utils'

interface Transaction {
  id: string
  type: 'received' | 'sent'
  amount: string
  usd: string
  date: string
  status: 'completed' | 'pending' | 'failed'
  sender?: string
  recipient?: string
  wallet: string
  category: string
  note?: string
  currentPrice: string
  priceChange: string
}

interface WalletAssetsProps {
  onNavigate: (view: string) => void
}

export function WalletAssets({ onNavigate }: WalletAssetsProps) {
  const { t } = useLanguage()
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'received' | 'sent'>('all')

  const transactions: Transaction[] = [
    {
      id: 'tx_001',
      type: 'received',
      amount: '+R 770.01',
      usd: '$10.95',
      date: '2025-08-25 03:59:58',
      status: 'completed',
      wallet: '我的渡鸦币 (RVN)',
      category: '收入',
      currentPrice: '$ 10.65',
      priceChange: '-2.69%',
      note: 'Payment received',
    },
    {
      id: 'tx_002',
      type: 'sent',
      amount: '-R 12,790.26',
      usd: '$188.93',
      date: '2025-07-11 3:38 PM',
      status: 'completed',
      wallet: '我的渡鸦币 (RVN)',
      category: '支出',
      currentPrice: '$ 188.93',
      priceChange: '-1.25%',
    },
    {
      id: 'tx_003',
      type: 'received',
      amount: '+R 25.88',
      usd: '$0.33',
      date: '2025-07-09 4:29 PM',
      status: 'completed',
      wallet: '我的渡鸦币 (RVN)',
      category: '收入',
      currentPrice: '$ 0.33',
      priceChange: '+0.15%',
    },
    {
      id: 'tx_004',
      type: 'received',
      amount: '+R 30.04',
      usd: '$0.38',
      date: '2025-07-09 1:28 PM',
      status: 'completed',
      wallet: '我的渡鸦币 (RVN)',
      category: '收入',
      currentPrice: '$ 0.38',
      priceChange: '+0.22%',
    },
    {
      id: 'tx_005',
      type: 'received',
      amount: '+R 127.18',
      usd: '$1.61',
      date: '2025-07-09 10:29 AM',
      status: 'completed',
      wallet: '我的渡鸦币 (RVN)',
      category: '收入',
      currentPrice: '$ 1.61',
      priceChange: '+0.08%',
    },
  ]

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      tx.amount.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.date.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.wallet.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesFilter = filterType === 'all' || tx.type === filterType

    return matchesSearch && matchesFilter
  })

  if (selectedTransaction) {
    return (
      <TransactionDetails
        transaction={selectedTransaction}
        onNavigate={(view) => {
          if (view === 'back') {
            setSelectedTransaction(null)
          } else {
            onNavigate(view)
          }
        }}
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* 价格走势（mock） */}
      <Card>
        <CardContent>
          <div className="h-32 bg-zinc-950 rounded-md flex items-end justify-between p-3 relative overflow-hidden border border-zinc-800/60">
            <div className="text-emerald-400 text-[10px] absolute top-2 left-2 tabular-nums">$0.0163</div>
            <div className="text-emerald-400 text-[10px] absolute bottom-2 right-2 tabular-nums">$0.0130</div>
            <div className="text-zinc-500 text-[10px] absolute bottom-2 left-2">25-07-26</div>
            <div className="text-zinc-500 text-[10px] absolute bottom-2 right-16">25-08-25</div>

            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 180" preserveAspectRatio="none">
              <path
                d="M20,120 Q60,100 100,110 T180,90 T260,105 T340,85 T400,95"
                stroke="#10b981"
                strokeWidth="2"
                fill="none"
              />
              <path
                d="M20,120 Q60,100 100,110 T180,90 T260,105 T340,85 T400,95 L400,180 L20,180 Z"
                fill="url(#assetGradient)"
                opacity="0.3"
              />
              <defs>
                <linearGradient id="assetGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* 搜索 + 筛选 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder={t('assets.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const nextFilter =
              filterType === 'all' ? 'received' : filterType === 'received' ? 'sent' : 'all'
            setFilterType(nextFilter)
          }}
        >
          <Filter className="h-3.5 w-3.5" />
          {filterType === 'all' && 'All'}
          {filterType === 'received' && 'In'}
          {filterType === 'sent' && 'Out'}
        </Button>
      </div>

      {/* 列表标题 */}
      <div className="flex justify-between items-center px-1">
        <h3 className="text-xs text-zinc-100 font-medium">{t('transactions.recent')}</h3>
        <span className="text-[10px] text-zinc-500 tabular-nums">
          {filteredTransactions.length} txs
        </span>
      </div>

      {/* 列表 */}
      <div className="space-y-2">
        {filteredTransactions.map((tx) => (
          <button
            key={tx.id}
            onClick={() => setSelectedTransaction(tx)}
            className="w-full text-left rounded-lg border border-border bg-card hover:bg-zinc-800 transition-colors px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-1 ${
                    tx.type === 'received'
                      ? 'bg-emerald-500/15 ring-emerald-500/30'
                      : 'bg-red-500/15 ring-red-500/30'
                  }`}
                >
                  {tx.type === 'received' ? (
                    <ArrowDown className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5 text-red-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-zinc-100 font-medium leading-tight">
                    {tx.type === 'received' ? t('transactions.received') : t('transactions.sent')}{' '}
                    {NAME_TOKEN}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{tx.date}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`text-xs font-medium tabular-nums ${
                    tx.type === 'received' ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {tx.amount}
                </p>
                <p className="text-[10px] text-zinc-500 tabular-nums">{tx.usd}</p>
              </div>
            </div>

            {/* 状态指示 */}
            <div className="mt-1.5 pt-1.5 border-t border-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    tx.status === 'completed'
                      ? 'bg-emerald-400'
                      : tx.status === 'pending'
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                  }`}
                />
                <span className="text-[10px] text-zinc-500 capitalize">{tx.status}</span>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">{tx.id}</span>
            </div>
          </button>
        ))}
      </div>

      {filteredTransactions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-xs text-zinc-400">{t('transaction.noTransactions')}</p>
          <p className="text-[10px] text-zinc-500 mt-1">{t('transaction.adjustFilter')}</p>
        </div>
      )}
    </div>
  )
}
