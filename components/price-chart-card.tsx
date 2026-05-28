'use client'

// 币价走势卡片（Chrome 插件桌面化重塑）
// 数据源：wallet-store 中的 coinPriceInfo
// 设计：
//   顶部：当前价格 + 24h 涨跌幅 badge（emerald / red）
//   中部：80px 高的简洁区域图（无坐标轴、无网格、悬浮提示）
//   底部：3 列多周期涨跌幅（24h / 7d / 30d）

import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/contexts/language-context'
import { useWalletState } from '@/stores/wallet-store'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'

export function PriceChartCard() {
  const { coinPriceInfo } = useWalletState()
  const { t } = useLanguage()

  const points = useMemo(() => {
    if (!coinPriceInfo?.priceChart || coinPriceInfo.priceChart.length === 0) return []
    return [...coinPriceInfo.priceChart]
      .map((p) => ({
        ts: new Date(p.timestamp).getTime(),
        timestamp: p.timestamp,
        price: Number(p.price),
      }))
      .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price))
      .sort((a, b) => a.ts - b.ts)
  }, [coinPriceInfo])

  const change = coinPriceInfo?.changePercent24h ?? 0
  const isUp = change >= 0
  // emerald-500 / red-500 hex（与全局主色保持一致）
  const color = isUp ? '#10b981' : '#ef4444'
  const colorClass = isUp ? 'text-emerald-400' : 'text-red-400'
  const bgClass = isUp
    ? 'bg-emerald-500/10 border-emerald-500/30'
    : 'bg-red-500/10 border-red-500/30'

  const priceText =
    coinPriceInfo?.price && coinPriceInfo.price > 0 ? `$${coinPriceInfo.price.toFixed(6)}` : '—'

  const periods = [
    { label: t('wallet.price.period.24h'), value: coinPriceInfo?.changePercent24h ?? 0 },
    { label: t('wallet.price.period.7d'), value: coinPriceInfo?.changePercent7d ?? 0 },
    { label: t('wallet.price.period.30d'), value: coinPriceInfo?.changePercent30d ?? 0 },
  ]

  return (
    <Card className="pt-0 gap-0">
      <CardContent className="px-3 pt-2.5 pb-2.5">
        {/* 顶栏 */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
              {t('wallet.priceChart')}
            </span>
            <span className="text-xs text-zinc-100 font-semibold tabular-nums">{priceText}</span>
          </div>
          <div
            className={`flex items-center gap-1 rounded-md border px-1.5 py-px text-[10px] font-medium ${bgClass} ${colorClass}`}
            title={t('wallet.price.period.24h')}
          >
            {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            <span className="tabular-nums">
              {isUp ? '+' : ''}
              {change.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 区域图 */}
        {points.length >= 2 ? (
          <div className="h-16 w-full -mx-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{
                    background: '#18181b', // zinc-900
                    border: '1px solid #3f3f46', // zinc-700
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '4px 8px',
                  }}
                  itemStyle={{ color: '#e4e4e7' }} // zinc-200
                  labelStyle={{ display: 'none' }}
                  formatter={(value: number, _name, ctx: any) => {
                    const ts = ctx?.payload?.timestamp
                    const date = ts ? new Date(ts).toLocaleString() : ''
                    return [`$${Number(value).toFixed(6)}`, date] as any
                  }}
                  separator=" · "
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={color}
                  strokeWidth={1.6}
                  fill="url(#priceGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-16 w-full flex items-center justify-center text-[10px] text-zinc-500">
            {t('wallet.noPriceData')}
          </div>
        )}

        {/* 多周期涨跌幅 */}
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {periods.map((p) => {
            const up = (p.value ?? 0) >= 0
            return (
              <div
                key={p.label}
                className={`text-center rounded-md py-1 ${
                  up ? 'bg-emerald-500/5' : 'bg-red-500/5'
                }`}
              >
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{p.label}</div>
                <div
                  className={`text-[10px] font-medium tabular-nums ${
                    up ? 'text-emerald-400/90' : 'text-red-400/90'
                  }`}
                >
                  {up ? '+' : ''}
                  {(p.value ?? 0).toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
