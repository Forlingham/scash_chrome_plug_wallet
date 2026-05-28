// =============================================================================
// 钱包状态管理（zustand + persist + immer）
//
// 与 web 钱包 stores/wallet-store.ts 同源，主要差异：
//   - 扩展端 coinPrice 不再来自 getblockchaininfo，独立通过 setUpdateCoinPrice 拉取。
//   - 新增 nodeInfo 字段，由 RPC 调用回填，用于驱动 wallet-home 上的"当前节点 / 信号强度"UI。
// =============================================================================

import { BlockchainInfo, CoinPriceData, getBaseFeeApi, getBlockchainInfoApi, getCoinPriceApi, getScantxoutsetApi, Unspent } from '@/lib/api'
import { decryptWallet } from '@/lib/utils'
import Decimal from 'decimal.js'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// 钱包信息接口
interface WalletInfo {
  isHasWallet: boolean
  address: string
  balance: number
  lockBalance: number
  // 内存池中锁定的余额
  memPoolLockBalance: number
  usableBalance: number
  encryptedWallet: string
}

// 交易记录接口
interface Transaction {
  id: string
  type: 'send' | 'receive'
  amount: number
  address: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  height: number
}

// 内存池中的交易接口
export interface PendingTransaction {
  id: string
  rawtx: string
  totalInput: number
  totalOutput: number
  change: number
  feeRate: number
  timestamp: number
  pickUnspents: Unspent[]
  sendListConfirm: SendList[]
  status: 'pending' | 'confirmed' | 'failed'
}

// 钱包状态接口
interface WalletState {
  blockchainInfo: BlockchainInfo
  // 当前最近一次调用 RPC 的节点信息（含连接状态、host、响应耗时）
  nodeInfo: NodeInfo
  // Explorer 接口最近一次响应耗时（用于 UI 信号强度）
  explorerInfo: { endpoint: string; responseTime: number } | null

  wallet: WalletInfo
  unspent: Unspent[]
  transactions: Transaction[]
  pendingTransactions: PendingTransaction[]
  isInitialized: boolean
  isLoading: boolean
  error: string | null
  isLocked: boolean
  coinPrice: string
  // 富币价信息（含 24h/7d/30d 涨跌幅 + 走势数据）。运行时拉取，不持久化。
  coinPriceInfo: CoinPriceData
  confirmations: number
  baseFee: number

  setWallet: (wallet: WalletInfo) => void
  updateBalance: (balance: number) => void
  addTransaction: (transaction: Transaction) => void
  addPendingTransaction: (transaction: PendingTransaction) => void
  setUnspent: (unspent: Unspent[]) => void
  deleteUnspent: (txid: string) => void
  lockWallet: () => void
  unlockWallet: (password: string) => boolean
  clearWallet: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setExplorerInfo: (info: { endpoint: string; responseTime: number } | null) => void

  getBaseFee: (isRemote?: boolean) => Promise<{
    isSuccess: boolean
    status: 'local' | 'remote' | 'error'
    fee: number
  }>

  // 定时更新方法
  unSetUpdate: () => void
  setUpdateBlockchaininfo: () => Promise<void>
  setUpdateBalance: () => Promise<void>
  setUpdateBalanceByMemPool: () => void
  setUpdateCoinPrice: () => Promise<void>
}

export const useWalletStore = create<WalletState>()(
  persist(
    immer((set, get) => ({
      blockchainInfo: {
        chain: '',
        blocks: 0,
        headers: 0,
        bestblockhash: '',
        difficulty: 0,
        time: 0,
        mediantime: 0,
        verificationprogress: 0,
        initialblockdownload: false,
        chainwork: '',
        size_on_disk: 0,
        pruned: false,
        warnings: '',
        coinPrice: '0'
      },
      nodeInfo: { status: 'checking', endpoint: '', responseTime: 0 },
      explorerInfo: null,
      wallet: {
        isHasWallet: false,
        address: '',
        balance: 0,
        lockBalance: 0,
        memPoolLockBalance: 0,
        usableBalance: 0,
        encryptedWallet: ''
      },
      unspent: [],
      transactions: [],
      pendingTransactions: [],
      isInitialized: false,
      isLoading: false,
      error: null,
      isLocked: false,
      coinPrice: '0',
      coinPriceInfo: {
        price: 0,
        change24h: 0,
        changePercent24h: 0,
        changePercent7d: 0,
        changePercent30d: 0,
        priceChart: []
      },
      confirmations: 1,
      baseFee: 0,

      setWallet: (wallet: WalletInfo) => {
        set((state) => {
          state.wallet = wallet
          state.error = null
        })
      },

      updateBalance: (balance: number) => {
        set((state) => {
          if (state.wallet) {
            state.wallet.balance = balance
          }
        })
      },

      addTransaction: (transaction: Transaction) => {
        set((state) => {
          const existingTransaction = state.transactions.find((tx) => tx.id === transaction.id)
          if (existingTransaction) {
            Object.assign(existingTransaction, transaction)
            return
          }
          state.transactions.unshift(transaction)
          if (state.transactions.length > 100) {
            state.transactions = state.transactions.slice(0, 100)
          }
        })
      },

      addPendingTransaction: (transaction: PendingTransaction) => {
        set((state) => {
          const existingTransaction = state.pendingTransactions.find((tx) => tx.id === transaction.id)
          if (existingTransaction) {
            Object.assign(existingTransaction, transaction)
            return
          }
          state.pendingTransactions.push(transaction)
        })
      },

      setUnspent: (unspent: Unspent[]) => {
        set((state) => {
          unspent.forEach((item) => {
            const existingTransaction = state.unspent.find((tx) => tx.txid === item.txid)
            if (existingTransaction) {
              Object.assign(existingTransaction, item)
            } else {
              state.unspent.push(item)
            }
          })
        })
      },
      deleteUnspent: (txid: string) => {
        set((state) => {
          state.unspent = state.unspent.filter((item) => item.txid !== txid)
        })
      },

      lockWallet: () => {
        set((state) => {
          state.isLocked = true
        })
      },

      unlockWallet: (password: string) => {
        if (!password) return false
        const walletObj = decryptWallet(get().wallet.encryptedWallet, password)
        if (!walletObj || !walletObj.isSuccess) return false

        set((state) => {
          state.isLocked = false
        })
        return true
      },

      clearWallet: () => {
        set((state) => {
          state.wallet = {
            isHasWallet: false,
            address: '',
            balance: 0,
            lockBalance: 0,
            memPoolLockBalance: 0,
            usableBalance: 0,
            encryptedWallet: ''
          }
          state.transactions = []
          state.error = null
        })
      },

      setLoading: (loading: boolean) => {
        set((state) => {
          state.isLoading = loading
        })
      },

      setError: (error: string | null) => {
        set((state) => {
          state.error = error
        })
      },

      setExplorerInfo: (info) => {
        set((state) => {
          state.explorerInfo = info
        })
      },

      getBaseFee: async (isRemote = false) => {
        const localFee = get().baseFee
        if (localFee && !isRemote) {
          return { isSuccess: true, status: 'local', fee: localFee }
        }
        try {
          const res = await getBaseFeeApi()
          if (res.data.success) {
            const fee = res.data.rpcData.feerate
            set((state) => {
              state.baseFee = fee
              if (res.data.nodeInfo) {
                state.nodeInfo = {
                  status: 'connected',
                  endpoint: res.data.nodeInfo.endpoint,
                  responseTime: res.data.nodeInfo.responseTime
                }
              }
            })
            return { isSuccess: true, status: 'remote', fee }
          }
          return { isSuccess: false, status: 'error', fee: 0 }
        } catch (error) {
          console.log('获取基础交易手续费 错误：', error)
          return { isSuccess: false, status: 'error', fee: 0 }
        }
      },

      // ===== 定时更新链 =====
      // 注意：实际定时调度在组件层（wallet-dashboard）做，store 这里只暴露方法。
      unSetUpdate: () => {
        setTimeout(() => {
          get().setUpdateBlockchaininfo()
          get().setUpdateBalance()
          get().setUpdateCoinPrice()
        }, 10 * 1000)
      },

      setUpdateBlockchaininfo: async () => {
        // 进入 checking 态，UI 立即显示"检测中"
        set((state) => {
          if (state.nodeInfo.status !== 'connected') {
            state.nodeInfo = { ...state.nodeInfo, status: 'checking' }
          }
        })
        try {
          const res = await getBlockchainInfoApi()
          if (res.data.success) {
            set((state) => {
              state.blockchainInfo = {
                ...res.data.rpcData,
                coinPrice: state.coinPrice
              }
              if (res.data.nodeInfo) {
                state.nodeInfo = {
                  status: 'connected',
                  endpoint: res.data.nodeInfo.endpoint,
                  responseTime: res.data.nodeInfo.responseTime
                }
              }
            })
          } else {
            set((state) => {
              state.nodeInfo = { status: 'disconnected', endpoint: '', responseTime: 0 }
            })
          }
        } catch (error) {
          console.log('获取当前节点状态 错误：', error)
          set((state) => {
            state.nodeInfo = { status: 'disconnected', endpoint: '', responseTime: 0 }
          })
        }
      },

      setUpdateBalance: async () => {
        const address = get().wallet.address
        const pendingTransactions = get().pendingTransactions
        if (!address) return
        try {
          const res = await getScantxoutsetApi(address)
          if (res.data.success) {
            const resData = res.data.rpcData
            const currentHeight = resData.height

            const unspents = resData.unspents
            for (const unspent of unspents) {
              unspent.isHasMemPool = false
              const isFindZero = pendingTransactions.find((tx) => tx.id === unspent.txid)
              if (unspent.height < currentHeight - get().confirmations || isFindZero) {
                unspent.isUsable = true
              } else {
                unspent.isUsable = false
              }
            }

            const usableBalance = unspents.reduce((acc, cur) => {
              if (cur.isUsable) return acc.plus(new Decimal(cur.amount))
              return acc
            }, new Decimal(0))

            const lockBalance = new Decimal(resData.total_amount).minus(usableBalance)

            set((state) => {
              state.wallet.balance = resData.total_amount
              state.wallet.usableBalance = usableBalance.toNumber()
              state.wallet.lockBalance = lockBalance.toNumber()
              if (res.data.nodeInfo) {
                state.nodeInfo = {
                  status: 'connected',
                  endpoint: res.data.nodeInfo.endpoint,
                  responseTime: res.data.nodeInfo.responseTime
                }
              }
            })
            get().setUnspent(unspents)
          }
        } catch (error) {
          console.log('获取当前账号余额 错误：', error)
        }
      },

      setUpdateBalanceByMemPool: () => {
        set((state) => {
          for (const tx of state.pendingTransactions) {
            if (tx.status === 'pending') {
              for (const pickUnspent of tx.pickUnspents) {
                const unspent = state.unspent.find((item) => item.txid === pickUnspent.txid)
                if (unspent) unspent.isHasMemPool = true
              }
            } else if (tx.status === 'confirmed') {
              for (const pickUnspent of tx.pickUnspents) {
                const unspent = state.unspent.find((item) => item.txid === pickUnspent.txid)
                if (unspent) {
                  state.unspent = state.unspent.filter((item) => item.txid !== unspent.txid)
                }
              }
            }
          }

          state.wallet.usableBalance = state.unspent
            .reduce((acc, cur) => {
              if (cur.isUsable && !cur.isHasMemPool) return acc.plus(new Decimal(cur.amount))
              return acc
            }, new Decimal(0))
            .toNumber()

          state.wallet.memPoolLockBalance = state.unspent
            .reduce((acc, cur) => {
              if (cur.isHasMemPool) return acc.plus(new Decimal(cur.amount))
              return acc
            }, new Decimal(0))
            .toNumber()
        })
      },

      // 币价：直连 Explorer 公共接口
      setUpdateCoinPrice: async () => {
        try {
          const res = await getCoinPriceApi()
          if (res.data.success) {
            const info = res.data.rpcData
            set((state) => {
              state.coinPriceInfo = info
              state.coinPrice = String(info.price ?? 0)
              state.blockchainInfo.coinPrice = String(info.price ?? 0)
            })
          }
        } catch (error) {
          console.log('获取币价 错误：', error)
        }
      }
    })),
    {
      name: 'wallet-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        wallet: state.wallet,
        pendingTransactions: state.pendingTransactions,
        transactions: state.transactions,
        isInitialized: state.isInitialized,
        isLocked: state.isLocked,
        coinPrice: state.coinPrice
      })
    }
  )
)

export type { WalletInfo, Transaction, WalletState }

export const useWalletActions = () => {
  const store = useWalletStore()

  return {
    setWallet: store.setWallet,
    updateBalance: store.updateBalance,
    addTransaction: store.addTransaction,
    addPendingTransaction: store.addPendingTransaction,
    lockWallet: store.lockWallet,
    unlockWallet: store.unlockWallet,
    clearWallet: store.clearWallet,
    setLoading: store.setLoading,
    setError: store.setError,
    setExplorerInfo: store.setExplorerInfo,

    getBaseFee: store.getBaseFee,

    unSetUpdate: store.unSetUpdate,
    setUpdateBlockchaininfo: store.setUpdateBlockchaininfo,
    setUpdateBalance: store.setUpdateBalance,
    setUpdateBalanceByMemPool: store.setUpdateBalanceByMemPool,
    setUpdateCoinPrice: store.setUpdateCoinPrice
  }
}

export const useWalletState = () => {
  const blockchainInfo = useWalletStore((state) => state.blockchainInfo)
  const nodeInfo = useWalletStore((state) => state.nodeInfo)
  const explorerInfo = useWalletStore((state) => state.explorerInfo)
  const wallet = useWalletStore((state) => state.wallet)
  const unspent = useWalletStore((state) => state.unspent)
  const transactions = useWalletStore((state) => state.transactions)
  const pendingTransactions = useWalletStore((state) => state.pendingTransactions)
  const confirmations = useWalletStore((state) => state.confirmations)
  const coinPrice = useWalletStore((state) => state.coinPrice)
  const coinPriceInfo = useWalletStore((state) => state.coinPriceInfo)
  const isInitialized = useWalletStore((state) => state.isInitialized)
  const isLoading = useWalletStore((state) => state.isLoading)
  const error = useWalletStore((state) => state.error)
  const isLocked = useWalletStore((state) => state.isLocked)

  return {
    blockchainInfo,
    nodeInfo,
    explorerInfo,
    wallet,
    unspent,
    transactions,
    pendingTransactions,
    confirmations,
    coinPrice,
    coinPriceInfo,
    isInitialized,
    isLoading,
    error,
    isLocked
  }
}
