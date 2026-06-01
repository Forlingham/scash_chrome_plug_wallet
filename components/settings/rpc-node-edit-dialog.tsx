'use client'

// 添加 / 编辑 RPC 节点对话框（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务流程完全保留：
//   1. 用户填入 URL + Basic Auth 凭据
//   2. "测试连接"前先 chrome.permissions.request 把 origin 加进 host_permissions，
//      再 getblockchaininfo 验通
//   3. 测试通过即可保存；保存时也会请求权限
//
// 视觉：替换 bg-gray-800/700 等硬编码为主题 token，按钮改 default(purple)/outline。
// ----------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useLanguage } from '@/contexts/language-context'
import { useRpcConfigStore, type RpcNode } from '@/stores/rpc-config-store'
import { testNode, resetNodeMemory } from '@/lib/rpc-client'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

interface RpcNodeEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node?: RpcNode | null
}

function toOriginPattern(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    return `${u.protocol}//${u.host}/*`
  } catch {
    return null
  }
}

async function ensurePermission(rawUrl: string): Promise<boolean> {
  const pattern = toOriginPattern(rawUrl)
  if (!pattern) return false
  // 在 next dev 普通页面下没有 chrome.permissions API，直接放行
  if (typeof chrome === 'undefined' || !chrome || !chrome.permissions) return true
  try {
    const has = await chrome.permissions.contains({ origins: [pattern] })
    if (has) return true
    return await chrome.permissions.request({ origins: [pattern] })
  } catch (e) {
    console.warn('chrome.permissions 调用失败:', e)
    return true
  }
}

export function RpcNodeEditDialog({ open, onOpenChange, node }: RpcNodeEditDialogProps) {
  const { t } = useLanguage()
  const { toast } = useToast()
  const addNode = useRpcConfigStore((s) => s.addNode)
  const updateNode = useRpcConfigStore((s) => s.updateNode)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<
    | { ok: true; responseTime: number; chain: string }
    | { ok: false; message: string }
    | null
  >(null)

  const isEdit = !!node

  useEffect(() => {
    if (open) {
      setName(node?.name ?? '')
      setUrl(node?.url ?? 'http://127.0.0.1:8342')
      setUser(node?.user ?? '')
      setPassword(node?.password ?? '')
      setTestResult(null)
    }
  }, [open, node])

  const isValidUrl = (() => {
    try {
      const u = new URL(url)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  })()

  const canSubmit = name.trim() && isValidUrl && user && password

  const handleTest = async () => {
    if (!canSubmit) return
    setTesting(true)
    setTestResult(null)
    try {
      const granted = await ensurePermission(url)
      if (!granted) {
        setTestResult({ ok: false, message: t('rpc.permissionDenied') })
        return
      }
      const r = await testNode({
        id: 'test',
        name,
        url,
        user,
        password,
        enabled: true,
      })
      setTestResult(r)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    const granted = await ensurePermission(url)
    if (!granted) {
      toast({ title: t('rpc.permissionDenied'), variant: 'destructive' })
      return
    }
    if (isEdit && node) {
      updateNode(node.id, { name, url, user, password })
      toast({ title: t('rpc.saved') })
    } else {
      addNode({ name, url, user, password, enabled: true })
      toast({ title: t('rpc.added') })
    }
    resetNodeMemory()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEdit ? t('rpc.edit') : t('rpc.add')}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {t('rpc.editInfo')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-xs">{t('rpc.field.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('rpc.field.namePlaceholder')}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-300 text-xs">{t('rpc.field.url')}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8342"
              className="font-mono text-[11px]"
            />
            {!isValidUrl && url && (
              <p className="text-[10px] text-red-400">{t('rpc.field.urlInvalid')}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">{t('rpc.field.user')}</Label>
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">{t('rpc.field.password')}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-xs"
                autoComplete="new-password"
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-1.5 rounded-md p-2 text-[11px] border ${
                testResult.ok
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-red-500/10 text-red-300 border-red-500/30'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              )}
              <div className="leading-relaxed">
                {testResult.ok
                  ? `${t('rpc.testOk')} · chain=${testResult.chain} · ${testResult.responseTime}ms`
                  : `${t('rpc.testFail')}: ${testResult.message}`}
              </div>
            </div>
          )}

          <p className="text-[10px] text-amber-400/80 leading-relaxed">
            {t('rpc.securityNote')}
          </p>
        </div>

        <DialogFooter className="gap-1.5 sm:gap-1.5 flex-row">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canSubmit || testing}
            onClick={handleTest}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            {t('rpc.testConnection')}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={handleSubmit}
            variant="default"
            size="sm"
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
