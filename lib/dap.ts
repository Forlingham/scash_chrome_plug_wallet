// DAP（链上文字消息）解析工具
// 与 web 钱包 lib/dap.ts 同源——已知是经过 XSS 净化的纯文本输出。
// ⚠️ 链上数据是公开的，可能含恶意 HTML，统一交给 DOMPurify 处理。

import { ARR_FEE_ADDRESS, getDapInstance } from './utils'

export interface DapMessage {
  content: string
  isDap: boolean
  isPureMessage: boolean // 只有 DAP 地址，没有其他接收地址
  isFromSelf: boolean // 发送者是自己
}

export interface TransactionOutput {
  scriptPubKey?: {
    address?: string
    hex?: string
  }
  addresses?: string[]
  address?: string
  value?: number
}

// 检测地址是否为 DAP 地址
export function isDapAddress(address: string): boolean {
  const dap = getDapInstance()
  if (!dap) return false
  return dap.getProtocolType(address) !== null
}

// 安全清理 DAP 内容（防止 XSS 攻击）
function sanitizeDapContent(content: string): string {
  if (typeof window === 'undefined') return content

  try {
    // DOMPurify 在浏览器环境直接 import 即可，但用 require 保持和 web 钱包同写法
    // 避免 SSR 阶段加载时报错（扩展是 static export，理论上没有 SSR，这里仍按防御写法）
    const DOMPurify = require('dompurify')
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      ALLOW_DATA_ATTR: false
    })
  } catch (error) {
    const div = document.createElement('div')
    div.textContent = content
    return div.innerText || content
  }
}

// 解析交易中的 DAP 消息
export function parseDapMessage(outputs: TransactionOutput[], senderAddress: string, currentUserAddress: string): DapMessage | null {
  if (typeof window === 'undefined') return null
  if (!outputs || outputs.length === 0) return null

  const dap = getDapInstance()
  if (!dap) return null

  const dapOutputs = outputs.filter((output) => {
    const address = output.scriptPubKey?.address || output.address
    return address && isDapAddress(address)
  })
  if (dapOutputs.length === 0) return null

  try {
    const message = dap.parseDapTransaction(outputs as any)
    if (!message) return null

    // 判断是否为纯文字消息（除 app fee 与 DAP 地址外没有其他接收地址）
    const normalOutputs = outputs.filter((output) => {
      const address = output.scriptPubKey?.address || output.address
      if (address === ARR_FEE_ADDRESS) return false
      return address && !isDapAddress(address)
    })
    const isPureMessage = normalOutputs.length === 0
    const isFromSelf = senderAddress.toLowerCase() === currentUserAddress.toLowerCase()
    const sanitizedContent = sanitizeDapContent(message)

    return {
      content: sanitizedContent,
      isDap: true,
      isPureMessage,
      isFromSelf
    }
  } catch (error) {
    console.error('解析 DAP 消息失败:', error)
    return null
  }
}

// 格式化 DAP 消息预览（纯文本，用于交易列表）
export function formatDapPreview(message: string, maxLength: number = 50): string {
  if (!message) return ''
  const sanitized = sanitizeDapContent(message)
  if (sanitized.length <= maxLength) return sanitized
  return sanitized.substring(0, maxLength) + '...'
}
