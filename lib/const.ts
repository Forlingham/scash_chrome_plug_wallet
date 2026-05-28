// 网络常量与开发者收款地址
// 当前扩展仅支持主网，因此不再像 web 端那样根据环境变量切换测试网。
// 如未来需要测试网，可在此处新增 testnet 常量并通过 RPC 节点的 network 字段驱动。

export const SCASH_NETWORK_MAINNET = {
  messagePrefix: '\x18Scash Signed Message:\n',
  bech32: 'scash',
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  pubKeyHash: 0x3c,
  scriptHash: 0x7d,
  wif: 0x80
}

export function getScashNetwork() {
  // 扩展端固定主网。后续如需扩展测试网，可在此处接入 store 读取。
  return SCASH_NETWORK_MAINNET
}

const ARR_FEE_ADDRESS_MAINNET = 'scash1qdq0sa4wxav36k7a4gwxq3k6dk0ahpqfsz8xpvg'

export function getArrFeeAddress(): string {
  return ARR_FEE_ADDRESS_MAINNET
}

// 默认公共 RPC 节点（区块浏览器维护）
export const DEFAULT_PUBLIC_RPC = {
  id: 'public-explorer-rpc',
  name: 'SCASH 官方公共 RPC',
  url: 'https://explorer.scash.network/api/rpc',
  user: 'scash',
  password: 'scash',
  enabled: true,
  isBuiltIn: true
}

// 默认 Explorer / 币价数据源
export const DEFAULT_EXPLORER_BASE_URL = 'https://explorer.scash.network/api/explorer'
export const DEFAULT_COIN_PRICE_URL = 'https://explorer.scash.network/api/explorer/home/overview'
