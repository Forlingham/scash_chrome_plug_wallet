// 区块浏览器（Explorer）富数据接口
// 主要用于：地址历史交易（含 senders/receivers/changeOutputs/vouts，用于 DAP 解析与交易类型识别）
//
// 设计：
// 1. base URL 从 stores/explorer-config-store 动态读取，允许用户改成自托管 Explorer。
// 2. 防抖 + 节流缓存：相同入参 30s 内复用上次结果，避免频繁打公共接口。
// 3. 同时输出 analyzeTransaction 的结果与原始交易，方便上层做 DAP 解析。

import axios from 'axios'
import { analyzeTransaction } from './utils'
import { getExplorerBaseUrl } from '@/stores/explorer-config-store'

// 防抖+节流缓存
const cache = new Map<string, { data: any; timestamp: number }>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 防抖+节流包装：debounce 用于折叠快速重复调用，throttle 用于限制实际请求频率。
 */
function debounceThrottle<T extends (...args: any[]) => Promise<any>>(fn: T, debounceMs: number, throttleMs: number): T {
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args)

    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < throttleMs) {
      return Promise.resolve(cached.data)
    }

    const existingTimer = debounceTimers.get(key)
    if (existingTimer) clearTimeout(existingTimer)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        try {
          const result = await fn(...args)
          cache.set(key, { data: result, timestamp: Date.now() })
          debounceTimers.delete(key)
          resolve(result)
        } catch (error) {
          debounceTimers.delete(key)
          reject(error)
        }
      }, debounceMs)

      debounceTimers.set(key, timer)
    }) as ReturnType<T>
  }) as T
}

/**
 * 主动清除指定地址的历史缓存，让"刷新"按钮可以立即拿到新数据。
 */
export function invalidateAddressTxsCache(address: string) {
  for (const k of Array.from(cache.keys())) {
    if (k.includes(`"${address}"`)) cache.delete(k)
  }
}

// 临时 axios 实例：base URL 每次都从 store 取（避免缓存旧值）
function getAxios() {
  return axios.create({
    baseURL: getExplorerBaseUrl(),
    timeout: 60000
  })
}

/**
 * 获取地址交易记录（原始函数）
 * 返回：每条 = analyzeTransaction 结果 + 原始 vouts（DAP 解析用）
 */
const _getAddressTxsExtApi = async (address: string) => {
  const res = await getAxios().get<PageType<TransactionType> & AddressTransactionsType>(`/address/${address}/txs`)
  const transactions = res.data.list || []

  const analyzedTransactions = transactions.map((tx) => analyzeTransaction(tx, address))

  // 每条交易同时附带原始数据，便于上层做 DAP 解析
  const transactionsWithRaw = analyzedTransactions.map((analyzed, index) => ({
    ...analyzed,
    rawTransaction: transactions[index]
  }))

  return transactionsWithRaw
}

/**
 * 获取地址交易记录（带防抖+节流）。
 */
export const getAddressTxsExtApi = debounceThrottle(_getAddressTxsExtApi, 300, 30000)
