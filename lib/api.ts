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
// 期望返回中包含 USD 价格字段。我们对返回结构做了宽松解析：兼容
//   - { price: number }
//   - { coinPrice: number }
//   - { data: { price: number } }
//   - { usd: number }
// 任何一种命中即可。
// =============================================================================
function pickPrice(payload: any): number {
  if (!payload || typeof payload !== 'object') return 0
  const candidates = [
    payload.price,
    payload.coinPrice,
    payload.usd,
    payload?.data?.price,
    payload?.data?.coinPrice,
    payload?.data?.usd
  ]
  for (const v of candidates) {
    const num = Number(v)
    if (Number.isFinite(num) && num > 0) return num
  }
  return 0
}

export function getCoinPriceApi(debounceMs: number = 300): Promise<ApiData<RpcRes<{ price: number }>>> {
  return debounceCall('coinPrice', debounceMs, async () => {
    const url = getCoinPriceUrl()
    const start = Date.now()
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' })
      if (!res.ok) {
        return {
          code: res.status,
          message: `获取币价失败：HTTP ${res.status}`,
          data: {
            success: false,
            rpcData: { price: 0 },
            error: { error: { code: res.status, message: `HTTP ${res.status}` } }
          }
        } as ApiData<RpcRes<{ price: number }>>
      }
      const json = await res.json()
      const price = pickPrice(json)
      return {
        code: 200,
        message: 'OK',
        data: {
          success: true,
          rpcData: { price },
          nodeInfo: { status: 'connected', endpoint: url, responseTime: Date.now() - start }
        }
      } as ApiData<RpcRes<{ price: number }>>
    } catch (e: any) {
      return {
        code: 500,
        message: e?.message ?? '获取币价失败',
        data: {
          success: false,
          rpcData: { price: 0 },
          error: { error: { code: 500, message: e?.message ?? '获取币价失败' } }
        }
      } as ApiData<RpcRes<{ price: number }>>
    }
  })
}
