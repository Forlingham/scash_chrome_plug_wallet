import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { decryptAES, encryptAES, hexToString, MD5, stringToHex } from './cryoto'
import Decimal from 'decimal.js'
import { bech32 } from 'bech32'
import * as bitcoin from 'bitcoinjs-lib'
import { Unspent } from './api'
import { BIP32Interface, BIP32Factory } from 'bip32'
import * as bip39 from 'bip39'
import * as ecc from 'tiny-secp256k1'
import { getArrFeeAddress, getScashNetwork } from './const'
import { getExplorerWebUrl } from '@/stores/explorer-config-store'

// =============================================================================
// 通用工具
// =============================================================================
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const VERSION = '0.4 Beta'
export const NAME_TOKEN = 'SCASH'

// 网络与开发者收款地址 —— 来自 lib/const.ts，保持与 web 钱包同源
export const SCASH_NETWORK = getScashNetwork()
export const ARR_FEE_ADDRESS = getArrFeeAddress()

// =============================================================================
// 区块浏览器跳转
// =============================================================================

// 兼容旧调用：保留导出，但实际值改为从 explorer-config-store 动态读取
// （某些组件 import 后做字符串拼接展示，仍然给一个回退默认值）
export const explorerUrl1 = 'https://explorer.scash.network/'
export const explorerUrl2 = 'https://explorer.scash.network/'

export function onOpenExplorer(_network: string, type: string, id: string) {
  // 不再区分 network，统一使用配置中的 explorerWebUrl
  const base = getExplorerWebUrl()
  window.open(`${base}${type}/${id}`)
}

// =============================================================================
// DAP 实例（链上文字协议）
// =============================================================================
let dapInstance: any = null
export function getDapInstance() {
  if (typeof window === 'undefined') return null
  if (!dapInstance) {
    try {
      const ScashDAP = require('scash-dap')
      dapInstance = new ScashDAP(SCASH_NETWORK)
    } catch (error) {
      console.error('初始化 DAP 失败:', error)
      return null
    }
  }
  return dapInstance
}

// =============================================================================
// App fee 配置（保持与 web 钱包完全一致）
// =============================================================================
export const APP_FEE_ARR = [
  { min: 0, max: 1, fee: 0.0001 },
  { min: 1, max: 10, fee: 0.01 },
  { min: 10, max: 50, fee: 0.05 },
  { min: 50, max: 100, fee: 0.1 },
  { min: 100, max: 500, fee: 0.2 },
  { min: 500, max: 1000, fee: 0.4 },
  { min: 1000, max: 5000, fee: 0.8 },
  { min: 5000, max: 10000, fee: 1 },
  { min: 10000, max: Number.MAX_SAFE_INTEGER, fee: 1.3 }
]

export function calcAppFee(amount: string | number) {
  const amountDecimal = new Decimal(amount)
  for (const item of APP_FEE_ARR) {
    if (amountDecimal.gte(item.min) && amountDecimal.lt(item.max)) {
      return item.fee
    }
  }
  return 0
}

// =============================================================================
// 钱包文件加解密
// =============================================================================
export function passwordMD5(password: string) {
  return MD5(password, 'password')
}

export function encryptWallet(wallet: WalletFile, passwordMD5String: string) {
  const walletString = JSON.stringify(wallet)
  const encryptedWallet = encryptAES(walletString, 'walletFile', passwordMD5String)
  return stringToHex(encryptedWallet)
}

export function decryptWallet(walletHex: string, password: string) {
  // 防御层级：
  //   1. 任何步骤抛错（hex 格式错、UTF-8 解码错、JSON.parse 错）都被 try/catch 兜住
  //      返回 { isSuccess: false }。
  //   2. JSON.parse 出来的对象必须包含钱包必需字段（mnemonic / address / path / privateKey），
  //      否则也判为失败——避免错误密码偶尔解出貌似 UTF-8 的垃圾被当成"成功"。
  //   3. 调用方（wallet-store unlockWallet 等）必须检查 isSuccess，而不是 truthy 检查
  //      （decryptWallet 总是返回对象，永远 truthy）。
  try {
    const passwordMD5String = passwordMD5(password)
    const walletString = hexToString(walletHex)
    const decrypted = decryptAES(walletString, 'walletFile', passwordMD5String)
    if (!decrypted) {
      return { isSuccess: false, wallet: null as WalletFile | null }
    }
    const parsed = JSON.parse(decrypted) as WalletFile
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.mnemonic !== 'string' ||
      typeof parsed.address !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.privateKey !== 'string'
    ) {
      return { isSuccess: false, wallet: null as WalletFile | null }
    }
    return { isSuccess: true, wallet: parsed }
  } catch (e) {
    // 错误密码常见路径：AES 解出非 UTF-8 字节、或解出来的串不是合法 JSON
    return { isSuccess: false, wallet: null as WalletFile | null }
  }
}

/**
 * 把用户输入的助记词规整成"BIP39 标准空格分隔"形式：
 *   - 去掉首尾空白
 *   - 把任意空白（含 \t \n \r、全角空格、零宽字符）压缩成单个英文空格
 *   - 全部小写（BIP39 wordlist 是小写）
 *
 * 注意：本函数只做格式整理，不做 BIP39 词表 / 校验和校验。
 * 调用方在拿到规整后的字符串后应使用 bip39.validateMnemonic() 进一步验证。
 */
export function normalizeMnemonic(input: string): string {
  if (!input) return ''
  return input
    // 去掉零宽字符（移动端键盘有时会塞进来）
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 任意空白序列（包含全角空格 \u3000）→ 单个英文空格
    .replace(/[\s\u3000]+/g, ' ')
    .trim()
    .toLowerCase()
}

export function downloadWalletFile(encryptedWallet: string, fileName = 'scash-wallet.json') {
  const walletData: WalletFileData = {
    version: VERSION,
    encrypted: true,
    data: encryptedWallet,
    timestamp: Date.now()
  }
  const blob = new Blob([JSON.stringify(walletData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// =============================================================================
// 单位换算
// =============================================================================
const SAT_PER_SCASH = new Decimal(1e8)
export function scashToSat(scashAmount: string | number) {
  return +new Decimal(scashAmount).times(SAT_PER_SCASH).toFixed(0)
}
export function satToScash(satAmount: number) {
  return +new Decimal(satAmount).div(SAT_PER_SCASH).toFixed(8)
}

// =============================================================================
// 手续费估算（标准 P2WPKH 估算公式）
// =============================================================================
export function calcFee(inputCount: number, outputCount: number, feerate: number) {
  const feerateDecimal = new Decimal(feerate)
  const satPerByte = feerateDecimal.mul(SAT_PER_SCASH).div(1000)
  const size = 10 + inputCount * 68 + outputCount * 31
  const sizeDecimal = new Decimal(size)
  const feeSatDecimal = sizeDecimal.mul(satPerByte).ceil()
  const feeSat = feeSatDecimal.toNumber()
  const feeScash = feeSatDecimal.div(SAT_PER_SCASH).toNumber()
  return { size, feeSat, feeScash }
}

// =============================================================================
// 地址校验
// =============================================================================
/**
 * 验证 SCASH 地址是否有效
 *
 * 容错性：
 *   - 自动 trim 首尾空白（粘贴地址时常带空格）
 *   - 接受全大写形式（bech32 spec 明确允许 "all-lower 或 all-upper"，例如二维码
 *     用大写更扫得准）。返回 true 即代表 normalizeScashAddress 之后能用于
 *     bitcoinjs-lib 的 address.toOutputScript。
 *   - 拒绝大小写混用（bech32 spec 明确禁止，且容易是被改过的字符）
 */
export function validateScashAddress(address: string) {
  try {
    const trimmed = (address || '').trim()
    if (!trimmed) return false
    const decoded = bech32.decode(trimmed)
    // bech32 库返回的 prefix 保持原大小写。这里用 toLowerCase 比较，让全大写也能过。
    if (decoded.prefix.toLowerCase() !== SCASH_NETWORK.bech32) return false

    // 校验和验证：再编码回去看是否一致（bech32.encode 总输出小写）
    const reencoded = bech32.encode(decoded.prefix.toLowerCase(), decoded.words)
    if (reencoded !== trimmed.toLowerCase()) return false

    // SegWit 程序长度（去掉 1 字节 version 后）必须在 [2, 40] 区间
    const data = bech32.fromWords(decoded.words.slice(1))
    if (data.length < 2 || data.length > 40) return false
    return true
  } catch (e) {
    return false
  }
}

/**
 * 把用户输入的 SCASH 地址规整成 bitcoinjs-lib 能直接用的形式：去空白 + 全部小写。
 * 调用方应当在用 address 构建交易输出之前过一次此函数。
 */
export function normalizeScashAddress(address: string): string {
  return (address || '').trim().toLowerCase()
}

// =============================================================================
// 显示辅助
// =============================================================================
export function calcValue(amount: number | string, price: number | string) {
  return new Decimal(amount).times(price).toFixed(2)
}

export function hideString(str: string) {
  if (str.length <= 4) return str
  const prefix = str.slice(0, 4)
  const suffix = str.slice(-6)
  return `${prefix}...${suffix}`
}

// =============================================================================
// 交易签名（PSBT，P2WPKH）
// =============================================================================
export function signTransaction(
  utxos: Unspent[],
  outputs: { address: string; amount: string }[],
  feeRate: number,
  myAddress: string,
  child: BIP32Interface,
  appFee: number
) {
  let networkFee = feeRate
  if (appFee) networkFee = new Decimal(feeRate).minus(appFee).toNumber()

  const totalInput = utxos.reduce((acc, utxo) => acc.plus(utxo.amount), new Decimal(0))
  const totalOutput = outputs.reduce((acc, output) => acc.plus(output.amount), new Decimal(0))

  const psbt = new bitcoin.Psbt({ network: SCASH_NETWORK })

  utxos.forEach((utxo) => {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPubKey, 'hex'),
        value: scashToSat(utxo.amount)
      }
    })
  })

  outputs.forEach((output) => {
    psbt.addOutput({
      address: output.address,
      value: scashToSat(output.amount)
    })
  })

  if (appFee) {
    psbt.addOutput({
      address: ARR_FEE_ADDRESS,
      value: scashToSat(appFee)
    })
  }

  // 找零
  const change = totalInput.minus(totalOutput).minus(feeRate)
  if (change.gt(0)) {
    psbt.addOutput({
      address: myAddress,
      value: scashToSat(change.toString())
    })
  }

  const publicKeyBuffer = Buffer.isBuffer(child.publicKey) ? child.publicKey : Buffer.from(child.publicKey)
  try {
    const customSigner = {
      publicKey: publicKeyBuffer,
      sign: (hash: Buffer) => {
        const signature = child.sign(hash)
        return Buffer.isBuffer(signature) ? signature : Buffer.from(signature)
      }
    }
    utxos.forEach((_, idx) => psbt.signInput(idx, customSigner))
    psbt.finalizeAllInputs()
  } catch (error) {
    console.log('签名失败', error)
    return { isSuccess: false, rawtx: '', totalInput, totalOutput, change, feeRate, appFee }
  }

  const rawtx = psbt.extractTransaction().toHex()
  return { isSuccess: true, rawtx, totalInput, totalOutput, change, feeRate, appFee }
}

// =============================================================================
// 富交易历史分析（来自 web 钱包，配合 lib/externalApi.ts 使用）
// =============================================================================
export const analyzeTransaction = (tx: TransactionType, currentAddress: string) => {
  const totalInput = tx.senders
    .filter((sender) => sender.address === currentAddress)
    .reduce((sum, sender) => sum.plus(new Decimal(sender.amount)), new Decimal(0))

  const totalOutput = tx.receivers
    .filter((receiver) => receiver.address === currentAddress)
    .reduce((sum, receiver) => sum.plus(new Decimal(receiver.amount)), new Decimal(0))

  const totalChange = tx.changeOutputs
    .filter((change) => change.address === currentAddress)
    .reduce((sum, change) => sum.plus(new Decimal(change.amount)), new Decimal(0))

  const isCoinbase = tx.senders.length === 0
  const isSender = totalInput.gt(0)
  const isReceiver = totalOutput.gt(0)

  let type: 'income' | 'expense' | 'self' | 'mining'
  let amount = new Decimal(0)
  let netAmount = new Decimal(0)

  if (isCoinbase && isReceiver) {
    type = 'mining'
    netAmount = totalOutput
    amount = totalOutput
  } else if (isSender && totalChange && isReceiver) {
    type = 'self'
    netAmount = totalOutput.minus(totalInput)
    amount = netAmount.abs()
  } else if (isSender) {
    type = 'expense'
    netAmount = totalInput.minus(totalChange).negated()
    amount = totalInput.minus(totalChange)
  } else if (isReceiver) {
    type = 'income'
    netAmount = totalOutput
    amount = totalOutput
  } else {
    type = 'self'
    netAmount = new Decimal(0)
    amount = new Decimal(0)
  }

  return {
    type,
    amount: satToScash(amount.toNumber()),
    netAmount: satToScash(netAmount.abs().toNumber()),
    isPositive: netAmount.gte(0),
    txid: tx.txid,
    timestamp: tx.timestamp,
    confirmations: tx.confirmations
  }
}

// =============================================================================
// 从已签名的 rawtx 中提取所有发到 myAddress 的输出
// 用途：自己刚发的交易在内存池中时，scantxoutset 还看不到这笔交易的输出，
//       但找零本来就属于自己，应该立即可用。这个函数把 rawtx 解出来，
//       挑出我自己的输出（找零或自转），构造成"伪 UTXO"加进余额计算中。
// =============================================================================
export function extractMyOutputsFromRawtx(rawtx: string, myAddress: string, txid: string): Unspent[] {
  if (!rawtx || !myAddress) return []
  try {
    const tx = bitcoin.Transaction.fromHex(rawtx)
    const myPayment = bitcoin.payments.p2wpkh({ address: myAddress, network: SCASH_NETWORK })
    if (!myPayment.output) return []
    const myScript = myPayment.output

    const result: Unspent[] = []
    for (let i = 0; i < tx.outs.length; i++) {
      const out = tx.outs[i]
      if (Buffer.compare(out.script, myScript) === 0) {
        result.push({
          txid,
          vout: i,
          scriptPubKey: out.script.toString('hex'),
          desc: '',
          amount: satToScash(out.value),
          coinbase: false,
          height: 0 // 还没上链
        })
      }
    }
    return result
  } catch (e) {
    console.warn('解析 rawtx 提取我方输出失败:', e)
    return []
  }
}

// =============================================================================
// BIP32 工具：从助记词派生第一条 P2WPKH 路径
// =============================================================================
export const ADDRESS_PATH = "m/84'/0'/0'/0/0"
export function getWalletPrivateKey(mnemonic: string) {
  const bip2 = BIP32Factory(ecc)
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const root = bip2.fromSeed(seed, SCASH_NETWORK)
  const child = root.derivePath(ADDRESS_PATH)
  return child
}
