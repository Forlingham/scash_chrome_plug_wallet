'use client'

// 币价走势卡片
// 数据源：wallet-store 中的 coinPriceInfo（来自 Explorer 的 home/overview）
// 设计：
//   顶部：当前价格 + 24h 涨跌幅 badge（绿/红）
//   底部：80px 高的简洁区域图（无坐标轴、无网格、悬浮提示）
//   priceChart 为空时显示占位文案。

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
        price: Number(p.price)
      }))
      .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price))
      .sort((a, b) => a.ts - b.ts)
  }, [coinPriceInfo])

  const change = coinPriceInfo?.changePercent24h ?? 0
  const isUp = change >= 0
  const color = isUp ? '#10b981' /* green-500 */ : '#ef4444' /* red-500 */
  const colorClass = isUp ? 'text-green-400' : 'text-red-400'
  const bgClass = isUp ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'

  const priceText = coinPriceInfo?.price && coinPriceInfo.price > 0 ? `$${coinPriceInfo.price.toFixed(6)}` : '—'

  // 多周期涨跌幅一行展示
  const periods = [
    { label: t('wallet.price.period.24h'), value: coinPriceInfo?.changePercent24h ?? 0 },
    { label: t('wallet.price.period.7d'), value: coinPriceInfo?.changePercent7d ?? 0 },
    { label: t('wallet.price.period.30d'), value: coinPriceInfo?.changePercent30d ?? 0 }
  ]

  return (
    <Card className="bg-gray-800 border-gray-700 pt-0">
      <CardContent className="px-4 pt-3 pb-3">
        {/* 顶栏：左侧标题 + 价格，右侧 24h 涨跌徽标 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t('wallet.priceChart')}</span>
            <span className="text-white font-semibold">{priceText}</span>
            <span className="text-[10px] text-gray-500">SCASH/USD</span>
          </div>
          <div
            className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${bgClass} ${colorClass}`}
            title={t('wallet.price.period.24h')}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>
              {isUp ? '+' : ''}
              {change.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 区域图 */}
        {points.length >= 2 ? (
          <div className="h-20 w-full -mx-4">
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
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    fontSize: 11,
                    padding: '4px 8px'
                  }}
                  itemStyle={{ color: '#e5e7eb' }}
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
          <div className="h-20 w-full flex items-center justify-center text-xs text-gray-500">{t('wallet.noPriceData')}</div>
        )}

        {/* 多周期涨跌幅 */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          {periods.map((p) => {
            const up = (p.value ?? 0) >= 0
            return (
              <div
                key={p.label}
                className={`text-center rounded-md py-1 text-xs ${
                  up ? 'bg-green-500/5 text-green-400/90' : 'bg-red-500/5 text-red-400/90'
                }`}
              >
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{p.label}</div>
                <div className="font-medium">
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
