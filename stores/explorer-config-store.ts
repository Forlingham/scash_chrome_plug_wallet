// Explorer 与币价数据源配置 Store
//
// 职责：
// 1. 提供区块浏览器 API 的 base URL（用于读取地址历史交易等富数据）。
// 2. 提供币价数据源 URL（默认使用 Explorer 的 home/overview 接口）。
// 3. 两个 URL 都允许用户在设置页改成自己的服务，保留默认值。
//
// 与 RPC 节点配置分开管理：因为 Explorer 接口和 JSON-RPC 是两类完全不同的服务，
// 用户大概率会一起用官方默认值，但少数自托管用户希望自己换。

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { DEFAULT_COIN_PRICE_URL, DEFAULT_EXPLORER_BASE_URL } from '@/lib/const'

interface ExplorerConfigState {
  explorerBaseUrl: string
  coinPriceUrl: string
  // 区块浏览器（链接到具体交易/地址展示页）的网址前缀，供 onOpenExplorer 使用
  explorerWebUrl: string

  setExplorerBaseUrl: (url: string) => void
  setCoinPriceUrl: (url: string) => void
  setExplorerWebUrl: (url: string) => void
  resetToDefault: () => void
}

const DEFAULT_EXPLORER_WEB_URL = 'https://explorer.scash.network/'

export const useExplorerConfigStore = create<ExplorerConfigState>()(
  persist(
    immer((set) => ({
      explorerBaseUrl: DEFAULT_EXPLORER_BASE_URL,
      coinPriceUrl: DEFAULT_COIN_PRICE_URL,
      explorerWebUrl: DEFAULT_EXPLORER_WEB_URL,

      setExplorerBaseUrl: (url) => {
        set((state) => {
          state.explorerBaseUrl = url.replace(/\/+$/, '') || DEFAULT_EXPLORER_BASE_URL
        })
      },
      setCoinPriceUrl: (url) => {
        set((state) => {
          state.coinPriceUrl = url || DEFAULT_COIN_PRICE_URL
        })
      },
      setExplorerWebUrl: (url) => {
        set((state) => {
          // 确保以 / 结尾，便于拼接路径
          let v = (url || DEFAULT_EXPLORER_WEB_URL).trim()
          if (!v.endsWith('/')) v = v + '/'
          state.explorerWebUrl = v
        })
      },
      resetToDefault: () => {
        set((state) => {
          state.explorerBaseUrl = DEFAULT_EXPLORER_BASE_URL
          state.coinPriceUrl = DEFAULT_COIN_PRICE_URL
          state.explorerWebUrl = DEFAULT_EXPLORER_WEB_URL
        })
      }
    })),
    {
      name: 'scash-explorer-config',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

// 给非 React 上下文（lib/externalApi、lib/api、lib/utils）使用的 snapshot getters
export function getExplorerBaseUrl(): string {
  return useExplorerConfigStore.getState().explorerBaseUrl
}

export function getCoinPriceUrl(): string {
  return useExplorerConfigStore.getState().coinPriceUrl
}

export function getExplorerWebUrl(): string {
  return useExplorerConfigStore.getState().explorerWebUrl
}
