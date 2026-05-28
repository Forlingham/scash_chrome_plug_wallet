// RPC 错误信息翻译
// scashd 节点（同 Bitcoin Core）返回的 error.message 都是英文字符串，
// 我们识别其中的常见关键词，把它转成 i18n key，由调用方用 t() 翻译成对应语言。
//
// 设计原则：
// 1. 不依赖错误的 code（同一 code 下消息可能完全不同）
// 2. 优先匹配最具体的关键词
// 3. 没有命中时回落到 'rpc.error.unknown'，调用方决定要不要把原始英文也展示出来

export interface TranslatedRpcError {
  /** 翻译用的 i18n key */
  i18nKey: string
  /** 节点返回的原始英文消息，用于 console / 排查时附带显示 */
  raw: string
  /** 节点返回的错误码（如 -26、-25），用于 toast 标题展示 */
  code: number
}

export function getRpcErrorI18nKey(message: string | undefined | null, code?: number): TranslatedRpcError {
  const raw = (message || '').toString()
  const lower = raw.toLowerCase()
  const c = typeof code === 'number' ? code : 0

  // 顺序很重要：先匹配最具体的关键词
  if (lower.includes('mempool-conflict') || lower.includes('txn-mempool-conflict')) {
    return { i18nKey: 'rpc.error.mempoolConflict', raw, code: c }
  }
  if (
    lower.includes('txn-already-known') ||
    lower.includes('already in mempool') ||
    lower.includes('already in block') ||
    lower.includes('already known')
  ) {
    return { i18nKey: 'rpc.error.alreadyKnown', raw, code: c }
  }
  if (
    lower.includes('missing-inputs') ||
    lower.includes('inputs-missingorspent') ||
    lower.includes('bad-txns-inputs')
  ) {
    return { i18nKey: 'rpc.error.missingInputs', raw, code: c }
  }
  if (
    lower.includes('insufficient fee') ||
    lower.includes('min relay fee not met') ||
    lower.includes('mempool-min-fee') ||
    lower.includes('min-relay-fee')
  ) {
    return { i18nKey: 'rpc.error.insufficientFee', raw, code: c }
  }
  if (lower.includes('dust')) {
    return { i18nKey: 'rpc.error.dust', raw, code: c }
  }
  if (lower.includes('tx-size') || lower.includes('too-large') || lower.includes('oversize')) {
    return { i18nKey: 'rpc.error.txTooLarge', raw, code: c }
  }
  if (lower.includes('non-final') || lower.includes('bad-txns-nonfinal')) {
    return { i18nKey: 'rpc.error.nonFinal', raw, code: c }
  }
  if (lower.includes('replacement-add') || lower.includes('not enough additional fees')) {
    return { i18nKey: 'rpc.error.rbfRejected', raw, code: c }
  }
  if (lower.includes('coinbase') && lower.includes('immature')) {
    return { i18nKey: 'rpc.error.immatureCoinbase', raw, code: c }
  }
  if (
    lower.includes('all rpc') ||
    lower.includes('所有 rpc') ||
    lower.includes('节点') ||
    c === 502 ||
    c === 503 ||
    c === 504
  ) {
    return { i18nKey: 'rpc.error.allNodesDown', raw, code: c }
  }
  if (lower.includes('timeout') || lower.includes('超时')) {
    return { i18nKey: 'rpc.error.timeout', raw, code: c }
  }
  if (
    c === 401 ||
    c === 403 ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('invalid credentials')
  ) {
    return { i18nKey: 'rpc.error.unauthorized', raw, code: c }
  }

  return { i18nKey: 'rpc.error.unknown', raw, code: c }
}

/**
 * 给 toast 用的辅助：返回 { title, description }。
 * - title 是 'RPC error' + ' ' + (-26)
 * - description 是翻译过的人话；未知错误时附带原始英文方便排查
 */
export function buildRpcErrorToast(
  t: (key: string) => string,
  message: string | undefined | null,
  code?: number
): { title: string; description: string } {
  const { i18nKey, raw, code: c } = getRpcErrorI18nKey(message, code)
  const title = c ? `${t('rpc.error.title')} (${c})` : t('rpc.error.title')
  const translated = t(i18nKey)
  const description = i18nKey === 'rpc.error.unknown' && raw ? `${translated}: ${raw}` : translated
  return { title, description }
}
