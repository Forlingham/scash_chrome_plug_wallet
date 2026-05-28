// 全局类型定义。与 web 钱包 (scash_web_wallet_next.js) 保持同源结构，
// 方便两端共用业务组件。

interface ApiData<T> {
  message: string
  code: number
  data: T
}

// 节点连接信息：每次成功调用 RPC 都会附带，用于驱动 UI 信号强度展示。
// status 字段由 wallet-store 维护（rpc-client 不直接写）：
//   - 'checking'：尚未发起任何调用 / 正在调用中
//   - 'connected'：最近一次调用成功
//   - 'disconnected'：最近一次调用全部节点都失败
interface NodeInfo {
  status: 'connected' | 'checking' | 'disconnected'
  endpoint: string
  responseTime: number
}

interface RpcRes<T> {
  success: boolean
  rpcData: T
  nodeInfo?: NodeInfo
  error?: {
    error: {
      code: number
      message: string
    }
  }
}

type WalletFile = {
  mnemonic: string
  path: string
  address: string
  privateKey: string
  passwordHash: string
}

type WalletFileData = {
  version: string
  encrypted: boolean
  data: string
  timestamp: number
}

interface SendList {
  address: string
  amount: string
}

// ========== 区块浏览器 (Explorer) 富交易历史相关类型 ==========

interface PageType<T> {
  list: T[]
  pagination: Pagination
}

interface Pagination {
  page: number
  pageSize: number
  total: number
}

interface Sender {
  address: string
  amount: number
  txid?: string
  vout?: number
}

interface TransactionVout {
  value: number
  n: number
  scriptPubKey?: {
    hex?: string
    address?: string
    type?: string
  }
  addresses?: string[]
}

interface TransactionType {
  txid: string
  blockHeight: number
  size: number
  weight: number
  senders: Sender[]
  receivers: Sender[]
  changeOutputs: Sender[]
  totalAmount: number
  fee: number
  timestamp: string
  confirmations: number
  vouts?: TransactionVout[]
}

interface AddressTransactionsType {
  address: string
}

// ========== DAP 链上消息相关类型 ==========

interface DapOutputsResult {
  outputs: { address: string; amount: string }[]
  dapAmount: number
  chunkCount: number
}
