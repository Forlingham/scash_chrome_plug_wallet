// =============================================================================
// 钱包状态管理（zustand + persist + immer）
//
// 与 web 钱包 stores/wallet-store.ts 同源，主要差异：
//   - 扩展端 coinPrice 不再来自 getblockchaininfo，独立通过 setUpdateCoinPrice 拉取。
//   - 新增 nodeInfo 字段，由 RPC 调用回填，用于驱动 wallet-home 上的"当前节点 / 信号强度"UI。
// =============================================================================

import { BlockchainInfo, CoinPriceData, getBaseFeeApi, getBlockchainInfoApi, getCoinPriceApi, getScantxoutsetApi, Unspent } from '@/lib/api'
import { decryptWallet, extractMyOutputsFromRawtx } from '@/lib/utils'
import Decimal from 'decimal.js'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface WalletInfo {
  isHasWallet: boolean
  address: string
  balance: number
  // 别人发给我但确认数不够的（已上链）金额
  lockBalance: number
  // 别人发给我但还没上链的金额（来自 Explorer）
  memPoolBalance: number
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
  setMemPoolBalance: (memPool: number) => void
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
        memPoolBalance: 0,
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
        // 多重防御保证错误密码绝对解锁不了：
        //   1. 空密码直接拒
        //   2. decryptWallet 内部已 try/catch，错误密码会返回 isSuccess: false
        //   3. 这里再包一层 try/catch，万一 decryptWallet 因任何意外抛错，都视为失败
        if (!password) return false
        try {
          const walletObj = decryptWallet(get().wallet.encryptedWallet, password)
          if (!walletObj || !walletObj.isSuccess || !walletObj.wallet) return false

          set((state) => {
            state.isLocked = false
          })
          return true
        } catch (e) {
          console.warn('解锁钱包异常：', e)
          return false
        }
      },

      clearWallet: () => {
        set((state) => {
          state.wallet = {
            isHasWallet: false,
            address: '',
            balance: 0,
            lockBalance: 0,
            memPoolBalance: 0,
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

      // ===== 余额计算（atomic & 自洽）=====
      // 设计目标：每次 setUpdateBalance 算出来的 4 个余额字段必须满足
      //   balance = usableBalance + lockBalance + memPoolBalance
      // 分类规则：
      //   1. 自己 pending tx 正在花的输入（pickUnspents 命中）→ 隐藏，不计入任何余额
      //      （这些 UTXO 即将离开钱包）
      //   2. 自己 pending tx 的找零（解析 rawtx 得到，可能尚未上链）→ 可用
      //   3. on-chain UTXO 的 txid 是自己历史发出的某笔交易 → 可用（自己找零，跳过确认数）
      //   4. 别人发给我的 UTXO，确认数 ≥ confirmations → 可用
      //   5. 别人发给我的 UTXO，确认数不足 → 待确认（lockBalance）
      //   6. 内存池中别人发给我的（不在 scantxoutset，由 Explorer 检测） → memPoolBalance
      //      该项不在 setUpdateBalance 中维护，由 wallet-home 调 setMemPoolBalance 写入
      setUpdateBalance: async () => {
        const address = get().wallet.address
        if (!address) return
        try {
          const res = await getScantxoutsetApi(address)
          if (!res.data.success) return

          const resData = res.data.rpcData
          const currentHeight = resData.height
          const confirmations = get().confirmations

          // 当前所有 pendingTransaction 占用的输入集合（只算 pending 状态的——
          // confirmed 的虽然还在数组里但其 input 早已不在 UTXO 集中）
          const pendingPicked = new Set<string>()
          // 历史发出过的所有 txid（pending + 较新的 confirmed）—— 用作"自己找零"判定
          const ownSentTxids = new Set<string>()
          for (const tx of get().pendingTransactions) {
            ownSentTxids.add(tx.id)
            if (tx.status === 'pending') {
              for (const u of tx.pickUnspents) {
                pendingPicked.add(`${u.txid}:${u.vout}`)
              }
            }
          }

          // ===== 第一步：处理 scantxoutset 返回的链上 UTXO =====
          const unifiedUnspents: Unspent[] = []
          for (const u of resData.unspents) {
            const key = `${u.txid}:${u.vout}`
            // 1. 自己 pending tx 正在花的，跳过（隐藏）
            if (pendingPicked.has(key)) continue

            // 2. 判断"自己找零"：UTXO 来自自己发出过的交易
            const isOwnChange = ownSentTxids.has(u.txid)
            // 3. 否则按确认数判定
            const meetsConfirmations = u.height < currentHeight - confirmations

            unifiedUnspents.push({
              ...u,
              isUsable: isOwnChange || meetsConfirmations,
              isHasMemPool: false
            })
          }

          // ===== 第二步：从自己 pending tx 的 rawtx 中解析虚拟找零 UTXO =====
          // 这些 UTXO 还没在 scantxoutset 里出现（因为对应交易在内存池中尚未上链），
          // 但用户应该可以立即看到 / 立即花。
          // 注意：必须检查 pendingPicked，因为虚拟 UTXO 自己也可能被另一笔 pending
          // tx 花掉（比如 tx1 的找零被 tx2 当成输入），那种情况下绝不能再加回来，
          // 否则下一轮选 UTXO 会选到一个已经被 mempool 锁定的输入，广播必然命中
          // txn-mempool-conflict (-26)。
          const onchainKeys = new Set(unifiedUnspents.map((u) => `${u.txid}:${u.vout}`))
          for (const tx of get().pendingTransactions) {
            if (tx.status !== 'pending' || !tx.rawtx) continue
            const myOuts = extractMyOutputsFromRawtx(tx.rawtx, address, tx.id)
            for (const out of myOuts) {
              const key = `${out.txid}:${out.vout}`
              if (onchainKeys.has(key)) continue // 已经在 scantxoutset 里了
              if (pendingPicked.has(key)) continue // 自己已被另一笔 pending tx 花掉
              unifiedUnspents.push({
                ...out,
                isUsable: true,
                isHasMemPool: false
              })
              onchainKeys.add(key)
            }
          }

          // ===== 第三步：算 4 个余额字段（守恒）=====
          let usable = new Decimal(0)
          let lock = new Decimal(0)
          for (const u of unifiedUnspents) {
            if (u.isUsable) usable = usable.plus(u.amount)
            else lock = lock.plus(u.amount)
          }

          // ===== 第四步：清理已不需要的 confirmed pendingTransaction =====
          // 一笔 confirmed 的 pending tx 被保留下来主要是为了"自己找零跳过确认数"判定。
          // 当其所有产物都已在 scantxoutset 中且确认数足够，就没必要再保留了。
          const onchainTxids = new Set(resData.unspents.map((u) => u.txid))
          const keepPendingTxs = get().pendingTransactions.filter((ptx) => {
            if (ptx.status === 'pending') return true
            // confirmed：检查这笔 tx 的所有产物是否都已经"够老了"
            if (!onchainTxids.has(ptx.id)) {
              // 链上已经看不到这笔 tx 的任何产物了（被花光了），可以丢
              return false
            }
            // 还在链上，看看是不是已经够老
            const stillYoung = resData.unspents.some(
              (u) => u.txid === ptx.id && u.height >= currentHeight - confirmations
            )
            return stillYoung
          })

          set((state) => {
            state.unspent = unifiedUnspents
            state.wallet.balance = usable.plus(lock).plus(state.wallet.memPoolBalance ?? 0).toNumber()
            state.wallet.usableBalance = usable.toNumber()
            state.wallet.lockBalance = lock.toNumber()
            // memPoolBalance 由 wallet-home 的 Explorer 检测维护，不在此处覆盖
            if (keepPendingTxs.length !== state.pendingTransactions.length) {
              state.pendingTransactions = keepPendingTxs
            }
            if (res.data.nodeInfo) {
              state.nodeInfo = {
                status: 'connected',
                endpoint: res.data.nodeInfo.endpoint,
                responseTime: res.data.nodeInfo.responseTime
              }
            }
          })
        } catch (error) {
          console.log('获取当前账号余额 错误：', error)
        }
      },

      // ===== 广播完交易后立即调用，不等下次 setUpdateBalance =====
      // 用现有的 state.unspent + state.pendingTransactions 重新分类，
      // 给用户即时反馈"刚发的钱不见了 + 找零马上可用"。
      // 注意：本函数不发起任何网络请求，纯本地计算。
      setUpdateBalanceByMemPool: () => {
        set((state) => {
          if (!state.wallet.address) return
          if (state.unspent.length === 0 && state.pendingTransactions.length === 0) return

          const pendingPicked = new Set<string>()
          const ownSentTxids = new Set<string>()
          for (const tx of state.pendingTransactions) {
            ownSentTxids.add(tx.id)
            if (tx.status === 'pending') {
              for (const u of tx.pickUnspents) {
                pendingPicked.add(`${u.txid}:${u.vout}`)
              }
            }
          }

          // 在现有 state.unspent 基础上：
          //   - 移除被 pending tx 占用的 UTXO（即将离开钱包）
          //   - 加入新 pending tx 的找零虚拟 UTXO（如果还没在数组里）
          const filtered = state.unspent.filter((u) => !pendingPicked.has(`${u.txid}:${u.vout}`))
          const existingKeys = new Set(filtered.map((u) => `${u.txid}:${u.vout}`))

          for (const tx of state.pendingTransactions) {
            if (tx.status !== 'pending' || !tx.rawtx) continue
            const myOuts = extractMyOutputsFromRawtx(tx.rawtx, state.wallet.address, tx.id)
            for (const out of myOuts) {
              const key = `${out.txid}:${out.vout}`
              if (existingKeys.has(key)) continue
              if (pendingPicked.has(key)) continue // 自己已被另一笔 pending tx 花掉，跳过
              filtered.push({ ...out, isUsable: true, isHasMemPool: false })
              existingKeys.add(key)
            }
          }

          state.unspent = filtered

          // 重新算余额。注意：state.unspent 中条目的 isUsable 已经在 setUpdateBalance
          // 时按"自己找零 / 确认数"规则确定好了；这里只做求和。
          let usable = new Decimal(0)
          let lock = new Decimal(0)
          for (const u of filtered) {
            if (u.isUsable) usable = usable.plus(u.amount)
            else lock = lock.plus(u.amount)
          }

          state.wallet.usableBalance = usable.toNumber()
          state.wallet.lockBalance = lock.toNumber()
          state.wallet.balance = usable.plus(lock).plus(state.wallet.memPoolBalance ?? 0).toNumber()
        })
      },

      // ===== 内存池中"别人发给我"的金额 =====
      // 由 wallet-home 拉 Explorer 的地址交易历史时调用——过滤出 type=income &&
      // confirmations=0 的，把 netAmount 加起来传过来。
      setMemPoolBalance: (memPool: number) => {
        set((state) => {
          state.wallet.memPoolBalance = memPool
          state.wallet.balance = new Decimal(state.wallet.usableBalance)
            .plus(state.wallet.lockBalance)
            .plus(memPool)
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
      // 余额相关字段全部不持久化：每次启动从 RPC + Explorer 重新拉取
      // （旧版本会持久化 balance/usable/lock/memPool，导致重启时一段时间显示
      //   过时数据；既然首次拉取很快，干脆都不持久化）
      partialize: (state) => ({
        wallet: {
          isHasWallet: state.wallet.isHasWallet,
          address: state.wallet.address,
          encryptedWallet: state.wallet.encryptedWallet,
          balance: 0,
          usableBalance: 0,
          lockBalance: 0,
          memPoolBalance: 0
        },
        pendingTransactions: state.pendingTransactions,
        transactions: state.transactions,
        isInitialized: state.isInitialized,
        isLocked: state.isLocked
        // 不再持久化 coinPrice、coinPriceInfo（每次启动 22 秒内会刷新一次）
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
    setUpdateCoinPrice: store.setUpdateCoinPrice,
    setMemPoolBalance: store.setMemPoolBalance
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
