'use client'

// 交易详情页（Chrome 插件桌面化重塑）
// 注意：当前为 mock 数据展示，待真实交易详情接口对接后保留结构、替换字段。

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/contexts/language-context'
import { NAME_TOKEN } from '@/lib/utils'
import { ArrowDown, ArrowUp, Edit3, User } from 'lucide-react'

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

interface TransactionDetailsProps {
  transaction: Transaction
  onNavigate: (view: string) => void
}

export function TransactionDetails({ transaction, onNavigate }: TransactionDetailsProps) {
  const { t } = useLanguage()
  const isReceive = transaction.type === 'received'

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-2.5">
      {/* 头部：发送/接收方头像 + 标题 */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center shrink-0 ring-1 ring-zinc-700/40">
                <User className="h-4 w-4 text-zinc-300" />
              </div>
              <div className="min-w-0">
                <Label className="text-emerald-400 text-[10px] uppercase tracking-wider">
                  {t('transaction.sender')}
                </Label>
                <p className="text-xs text-zinc-100 font-medium truncate">
                  {isReceive ? `${t('transactions.received')} ${NAME_TOKEN}` : `${t('transactions.sent')} ${NAME_TOKEN}`}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Edit">
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 字段们 —— 抽出为 InfoRow 模式（类 key/value 列表） */}
      <Card>
        <CardContent className="space-y-2.5">
          <Field label={`${NAME_TOKEN} ${t('common.amount')}`}>
            <span className="text-base font-semibold text-zinc-100 tabular-nums">
              {transaction.amount.replace('+', '').replace('-', '')}
            </span>
          </Field>

          <Field label={t('transaction.amountUsd')} editable>
            <span className="text-sm font-medium text-zinc-100 tabular-nums">{transaction.usd}</span>
          </Field>

          <Field label={t('transaction.currentPrice')}>
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-zinc-100 tabular-nums">
                {transaction.currentPrice}
              </span>
              <span
                className={`text-[10px] tabular-nums ${
                  transaction.priceChange.startsWith('-') ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                ({transaction.priceChange})
              </span>
            </span>
          </Field>

          <Field label="Date">
            <span className="text-xs text-zinc-200 font-mono">{transaction.date}</span>
          </Field>

          <Field label={t('transaction.wallet')}>
            <span className="text-xs text-zinc-200">{transaction.wallet}</span>
          </Field>

          <Field label={t('transaction.category') || '类别'} editable>
            <span className="text-xs text-zinc-200">{transaction.category}</span>
          </Field>
        </CardContent>
      </Card>

      {/* 备注（可编辑） */}
      <Card>
        <CardContent className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-emerald-400 text-[10px] uppercase tracking-wider">
              {t('transaction.note') || '备注'}
            </Label>
            <Button variant="ghost" size="icon-sm" aria-label="Edit">
              <Edit3 className="h-3 w-3" />
            </Button>
          </div>
          <Input
            defaultValue={transaction.note || ''}
            placeholder={t('transaction.addNote') || 'Tap to add a note (optional)'}
            className="text-xs"
          />
        </CardContent>
      </Card>

      {/* 状态汇总 */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2.5">
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
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-100 font-medium leading-tight">
                {transaction.status === 'completed' && (t('transaction.completed') || 'Completed')}
                {transaction.status === 'pending' && (t('transaction.pending') || 'Pending')}
                {transaction.status === 'failed' && (t('transaction.failed') || 'Failed')}
              </p>
              <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                {transaction.id}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => onNavigate('back')} variant="ghost" size="sm" className="w-full">
        {t('common.back')}
      </Button>
    </div>
  )
}

// 内部组件：key/value 字段行
function Field({
  label,
  editable,
  children,
}: {
  label: string
  editable?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-1 shrink-0">
        <Label className="text-emerald-400 text-[10px] uppercase tracking-wider">{label}</Label>
        {editable && (
          <Button variant="ghost" size="icon-sm" className="h-4 w-4" aria-label="Edit">
            <Edit3 className="h-2.5 w-2.5" />
          </Button>
        )}
      </div>
      <div className="text-right min-w-0">{children}</div>
    </div>
  )
}
