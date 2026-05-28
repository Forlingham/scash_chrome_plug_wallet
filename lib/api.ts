// =============================================================================
// 统一对外 API 入口
//
// 与 web 钱包 lib/api.ts 接口签名保持一致，方便业务组件双端共用。
// 实现层面差异：
//   - web 钱包：axios → /api/* → Next.js server runtime → scashd
//   - 扩展插件：rpc-client → 直接 fetch 用户配置的 RPC 节点
// 上层组件感知不到这个差异。
//
// 防抖逻辑保留：每个方法都有按 key 取消重排的能力，避免相同请求短时间内多次触发。
// =============================================================================

import { rpcCall } from './rpc-client'
import { getCoinPriceUrl } from '@/stores/explorer-config-store'

// 防抖相关（保持与 web 钱包同一份逻辑）
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function debounceCall<T>(key: string, debounceMs: number, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (debounceTimers.has(key)) {
      clearTimeout(debounceTimers.get(key)!)
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fn()
        debounceTimers.delete(key)
        resolve(r)
      } catch (e) {
        debounceTimers.delete(key)
        reject(e)
      }
    }, debounceMs)
    debounceTimers.set(key, timer)
  })
}

// =============================================================================
// 旧后端遗留接口：仅用于地址使用统计，扩展端无后端，no-op 即可
// =============================================================================
export function onUserCreateApi(_address: string): Promise<ApiData<RpcRes<{ ok: true }>>> {
  return Promise.resolve({
    code: 200,
    message: 'OK',
    data: { success: true, rpcData: { ok: true } }
  })
}

// =============================================================================
// 区块链状态
// =============================================================================
export interface BlockchainInfo {
  chain: string
  blocks: number
  headers: number
  bestblockhash: string
  difficulty: number
  time: number
  mediantime: number
  verificationprogress: number
  initialblockdownload: boolean
  chainwork: string
  size_on_disk: number
  pruned: boolean
  warnings: string
  // 兼容旧前端：扩展端 coinPrice 不再来自这条 RPC，但保留字段，由调用方在外部填充
  coinPrice?: string
}

export function getBlockchainInfoApi(debounceMs: number = 300): Promise<ApiData<RpcRes<BlockchainInfo>>> {
  return debounceCall('getblockchaininfo', debounceMs, () => rpcCall<BlockchainInfo>('getblockchaininfo', []))
}

// =============================================================================
// UTXO 扫描
// =============================================================================
export interface Scantxoutset {
  success: boolean
  txouts: number
  height: number
  bestblock: string
  unspents: Unspent[]
  total_amount: number
}

export interface Unspent {
  txid: string
  vout: number
  scriptPubKey: string
  desc: string
  amount: number
  coinbase: boolean
  height: number

  // 前端计算字段
  isUsable?: boolean
  isHasMemPool?: boolean
}

export function getScantxoutsetApi(address: string, debounceMs: number = 300): Promise<ApiData<RpcRes<Scantxoutset>>> {
  const desc = `addr(${address})`
  return debounceCall(`scantxoutset_${address}`, debounceMs, () => rpcCall<Scantxoutset>('scantxoutset', ['start', [{ desc }]]))
}

// =============================================================================
// 手续费估算
// =============================================================================
interface BaseFee {
  feerate: number
  blocks: number
}

export function getBaseFeeApi(confTarget: number = 6, debounceMs: number = 300): Promise<ApiData<RpcRes<BaseFee>>> {
  return debounceCall(`estimatesmartfee_${confTarget}`, debounceMs, () => rpcCall<BaseFee>('estimatesmartfee', [confTarget]))
}

// =============================================================================
// 原始交易查询
// =============================================================================
export interface RawTransaction {
  txid: string
  hash: string
  blockhash?: string
  confirmations?: number
  time?: number
  blocktime?: number
}

export function getRawTransactionApi(txid: string, debounceMs: number = 300): Promise<ApiData<RpcRes<RawTransaction>>> {
  return debounceCall(`getrawtransaction_${txid}`, debounceMs, () => rpcCall<RawTransaction>('getrawtransaction', [txid, true]))
}

// =============================================================================
// 广播交易
// =============================================================================
type SendRawTransactionDto = {
  address: string
  txid: string
  rawtx: string
  totalInput: number
  totalOutput: number
  change: number
  feeRate: number
  appFee: number
}

/**
 * 广播交易
 *
 * 注意：原后端会在 sendrawtransaction 之后顺带把交易元数据写入 DB（用于统计 app fee 等）。
 * 切到直连模式后这部分逻辑被移除，sendRawTransactionDto 中的辅助字段（appFee、feeRate 等）
 * 仅作上层 UI 展示参考，对节点本身没有副作用。
 */
export function onBroadcastApi(
  sendRawTransactionDto: SendRawTransactionDto,
  debounceMs: number = 300
): Promise<ApiData<RpcRes<{ txid: string }>>> {
  const key = `sendrawtransaction_${sendRawTransactionDto.rawtx.slice(0, 20)}`
  return debounceCall(key, debounceMs, async () => {
    // sendrawtransaction 返回的是 txid 字符串，统一包装成 { txid } 以贴近 web 钱包 server 端 shape
    const res = await rpcCall<string>('sendrawtransaction', [sendRawTransactionDto.rawtx])
    if (!res.data.success) {
      // 失败原样向上抛
      return res as unknown as ApiData<RpcRes<{ txid: string }>>
    }
    return {
      ...res,
      data: {
        ...res.data,
        rpcData: { txid: res.data.rpcData as unknown as string }
      }
    } as ApiData<RpcRes<{ txid: string }>>
  })
}

// =============================================================================
// 币价（直连 Explorer 公共接口，避免走任何后端）
//
// 默认地址：https://explorer.scash.network/api/explorer/home/overview
//
// 返回结构（仅列出我们关心的字段）：
//   {
//     price: {
//       price: "0.047606",
//       change24h: "-0.00014521",
//       changePercent24h: "-0.304097...",
//       changePercent7d: "...",
//       changePercent30d: "..."
//     },
//     priceChart: [
//       { timestamp: "...", price: "0.053351" },
//       ...
//     ]
//   }
//
// 解析时同时兼容老结构（{ price: number }），保证用户改成自定义币价 URL
// 时也能 fallback。
// =============================================================================

export interface PricePoint {
  timestamp: string
  price: string
}

export interface CoinPriceData {
  price: number
  change24h: number
  changePercent24h: number
  changePercent7d: number
  changePercent30d: number
  priceChart: PricePoint[]
}

function parseNumber(v: any, fallback: number = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function extractCoinPriceData(payload: any): CoinPriceData {
  // 新格式：payload.price 是对象，含嵌套 .price 字段
  // 老格式（兼容）：payload.price 直接是数字 / payload.coinPrice / payload.usd
  const priceObj = payload?.price
  let price = 0
  if (priceObj && typeof priceObj === 'object') {
    price = parseNumber(priceObj.price)
  } else {
    price = parseNumber(priceObj ?? payload?.coinPrice ?? payload?.usd ?? payload?.data?.price)
  }

  const change24h = priceObj && typeof priceObj === 'object' ? parseNumber(priceObj.change24h) : 0
  const changePercent24h = priceObj && typeof priceObj === 'object' ? parseNumber(priceObj.changePercent24h) : 0
  const changePercent7d = priceObj && typeof priceObj === 'object' ? parseNumber(priceObj.changePercent7d) : 0
  const changePercent30d = priceObj && typeof priceObj === 'object' ? parseNumber(priceObj.changePercent30d) : 0

  const rawChart = payload?.priceChart
  const priceChart: PricePoint[] = Array.isArray(rawChart)
    ? rawChart
        .filter((p: any) => p && p.timestamp && p.price !== undefined && p.price !== null)
        .map((p: any) => ({ timestamp: String(p.timestamp), price: String(p.price) }))
    : []

  return { price, change24h, changePercent24h, changePercent7d, changePercent30d, priceChart }
}

export function getCoinPriceApi(debounceMs: number = 300): Promise<ApiData<RpcRes<CoinPriceData>>> {
  return debounceCall('coinPrice', debounceMs, async () => {
    const url = getCoinPriceUrl()
    const start = Date.now()
    const empty: CoinPriceData = {
      price: 0,
      change24h: 0,
      changePercent24h: 0,
      changePercent7d: 0,
      changePercent30d: 0,
      priceChart: []
    }
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' })
      if (!res.ok) {
        return {
          code: res.status,
          message: `获取币价失败：HTTP ${res.status}`,
          data: {
            success: false,
            rpcData: empty,
            error: { error: { code: res.status, message: `HTTP ${res.status}` } }
          }
        } as ApiData<RpcRes<CoinPriceData>>
      }
      const json = await res.json()
      const parsed = extractCoinPriceData(json)
      return {
        code: 200,
        message: 'OK',
        data: {
          success: true,
          rpcData: parsed,
          nodeInfo: { status: 'connected', endpoint: url, responseTime: Date.now() - start }
        }
      } as ApiData<RpcRes<CoinPriceData>>
    } catch (e: any) {
      return {
        code: 500,
        message: e?.message ?? '获取币价失败',
        data: {
          success: false,
          rpcData: empty,
          error: { error: { code: 500, message: e?.message ?? '获取币价失败' } }
        }
      } as ApiData<RpcRes<CoinPriceData>>
    }
  })
}
