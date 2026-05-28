// 浏览器侧 JSON-RPC 客户端
//
// 这是 web 钱包 lib/server/bitcoinRpc.ts 的浏览器版本，主要差异：
// 1. 改用 btoa() 做 Basic Auth 编码（浏览器环境无 Buffer）。
// 2. 节点列表来源由 BITCOIN_RPC_ENDPOINTS 环境变量改为 stores/rpc-config-store。
// 3. preferredNodeUrl 不再通过 HTTP header 传递，因为整个调用都在同一个浏览器进程内，
//    用模块级变量 lastSuccessfulEndpointId 直接记忆即可。
// 4. 调用结果统一包装成 ApiData<RpcRes<T>>，使 lib/api.ts 与 web 钱包接口保持一致。
//
// CORS 说明：
// - Chrome MV3 扩展 popup 对 host_permissions 中的主机做 fetch 时不受 CORS 限制。
// - 默认公共节点 https://explorer.scash.network/* 已写入 manifest 的 host_permissions。
// - 用户添加自定义节点时，UI 会主动调用 chrome.permissions.request() 请求授权。

import { getActiveAndFallbackNodesSnapshot, RpcNode, setActiveNodeId } from '@/stores/rpc-config-store'

type JsonRpcError = { code: number; message: string; data?: unknown }
type JsonRpcResponse<T> = {
  jsonrpc: '2.0'
  id: string | number
  result?: T
  error?: JsonRpcError
}

/** 上次成功的节点 ID，作为下次调用的起点 */
let lastSuccessfulEndpointId: string | null = null

const DEFAULT_TIMEOUT_MS = 15000

interface CallBitcoinRpcOptions {
  overrideTimeoutMs?: number
}

/**
 * 浏览器环境下 UTF-8 安全的 base64 编码
 * 直接使用 btoa() 在 user/password 含非 ASCII 字符时会抛错，所以走 TextEncoder。
 */
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * 决定起点节点：
 * - 如果 lastSuccessfulEndpointId 仍在当前 enabled 节点列表里，从它开始
 * - 否则从列表第一个开始（即 store 里的 active 节点）
 */
function getStartIndex(nodes: RpcNode[]): number {
  if (!lastSuccessfulEndpointId) return 0
  const idx = nodes.findIndex((n) => n.id === lastSuccessfulEndpointId)
  return idx === -1 ? 0 : idx
}

/**
 * 直接调 JSON-RPC，返回 { result, endpoint, responseTime }。
 * 用法和 web 钱包 server 端 callBitcoinRpc 完全一致。
 */
export async function callBitcoinRpc<T>(
  method: string,
  params: unknown[] = [],
  options?: CallBitcoinRpcOptions
): Promise<{ result: T; endpoint: string; responseTime: number; nodeId: string }> {
  const nodes = getActiveAndFallbackNodesSnapshot()
  if (nodes.length === 0) {
    const err = new Error('未配置任何启用的 RPC 节点，请在「设置 → 网络节点」中添加或启用至少一个节点') as Error & {
      statusCode?: number
    }
    err.statusCode = 503
    throw err
  }

  const finalTimeout = options?.overrideTimeoutMs ?? DEFAULT_TIMEOUT_MS
  const body = { jsonrpc: '2.0', id: Date.now(), method, params }
  const attempts: { url: string; message: string; statusCode?: number }[] = []

  const total = nodes.length
  const startIndex = getStartIndex(nodes)

  for (let i = 0; i < total; i++) {
    const index = (startIndex + i) % total
    const ep = nodes[index]

    const requestStartTime = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), finalTimeout)
    try {
      const auth = utf8ToBase64(`${ep.user}:${ep.password}`)
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: controller.signal
      })

      const text = await res.text()
      let json: JsonRpcResponse<T> | null = null
      try {
        json = JSON.parse(text)
      } catch {
        const err = new Error(`RPC 响应非 JSON，HTTP ${res.status}`) as Error & { statusCode?: number }
        err.statusCode = res.status
        throw err
      }

      if (!res.ok) {
        const msg = json?.error?.message ?? `HTTP 错误 ${res.status}`
        const err = new Error(msg) as Error & { statusCode?: number; rpcError?: JsonRpcError }
        err.statusCode = res.status
        if (json?.error) err.rpcError = json.error
        throw err
      }

      if (json?.error) {
        // RPC 自身返回的业务错误：节点是通的，不再轮转，直接抛
        const err = new Error(json.error.message) as Error & { rpcError?: JsonRpcError }
        err.rpcError = json.error
        throw err
      }

      clearTimeout(timer)
      const responseTime = Date.now() - requestStartTime

      lastSuccessfulEndpointId = ep.id
      // 把成功节点同步设置为 active，使 UI 上的"当前节点"展示与实际调用一致
      setActiveNodeId(ep.id)

      return {
        result: json!.result as T,
        endpoint: ep.url,
        responseTime,
        nodeId: ep.id
      }
    } catch (e: any) {
      clearTimeout(timer)
      if (e?.name === 'AbortError') {
        attempts.push({ url: ep.url, message: `请求超时（${finalTimeout}ms）`, statusCode: 504 })
        continue
      }
      // RPC 业务错误（如交易已存在、入参非法）直接抛，不再轮转其他节点
      if (e?.rpcError) throw e
      attempts.push({ url: ep.url, message: e?.message ?? '未知错误', statusCode: e?.statusCode })
      continue
    }
  }

  // 全部失败 → 重置记忆，下次从头开始
  lastSuccessfulEndpointId = null

  const details = attempts.map((a) => `[${a.url}] ${a.message}`).join(' ; ')
  const err = new Error(`所有 RPC 节点均不可用：${details || '无详情'}`) as Error & {
    statusCode?: number
  }
  err.statusCode = 502
  throw err
}

// 上层 lib/api.ts 期望的统一返回 shape，保持与 web 钱包同构
export interface RpcOk<T> {
  data: RpcRes<T>
  code: number
  message: string
}

/**
 * 把成功的 RPC 调用包装成 ApiData<RpcRes<T>>。
 * 与 web 钱包 server 端 apiOk() 保持一致，使 lib/api.ts 几乎可以原样复用。
 */
export async function rpcCall<T>(method: string, params: unknown[] = [], options?: CallBitcoinRpcOptions): Promise<RpcOk<T>> {
  try {
    const { result, endpoint, responseTime } = await callBitcoinRpc<T>(method, params, options)
    return {
      data: {
        success: true,
        rpcData: result,
        nodeInfo: { endpoint, responseTime }
      },
      code: 200,
      message: 'OK'
    }
  } catch (err: any) {
    const status = err?.statusCode ?? 500
    const message = err?.message ?? '内部错误'

    // 业务错误：保留 RPC 原始错误，便于上层针对性提示（如「交易已存在」）
    return {
      data: {
        success: false,
        rpcData: undefined as unknown as T,
        error: err?.rpcError ? { error: err.rpcError } : { error: { code: status, message } }
      },
      code: status,
      message
    }
  }
}

/**
 * 测试单个节点连通性——独立于 active/failover 逻辑，仅打 getblockchaininfo。
 * 由「网络节点」设置 UI 调用。
 */
export async function testNode(node: RpcNode, timeoutMs = 8000): Promise<{ ok: true; responseTime: number; chain: string } | { ok: false; message: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const start = Date.now()
  try {
    const auth = utf8ToBase64(`${node.user}:${node.password}`)
    const res = await fetch(node.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'getblockchaininfo', params: [] }),
      cache: 'no-store',
      signal: controller.signal
    })
    clearTimeout(timer)
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` }
    }
    const json = JSON.parse(text)
    if (json?.error) {
      return { ok: false, message: json.error.message }
    }
    return {
      ok: true,
      responseTime: Date.now() - start,
      chain: json?.result?.chain ?? 'unknown'
    }
  } catch (e: any) {
    clearTimeout(timer)
    if (e?.name === 'AbortError') return { ok: false, message: `请求超时（${timeoutMs}ms）` }
    return { ok: false, message: e?.message ?? '未知错误' }
  }
}

/**
 * 重置内部记忆。新增/删除/启停节点时调用，保证下次调用从 active 开始。
 */
export function resetNodeMemory() {
  lastSuccessfulEndpointId = null
}
