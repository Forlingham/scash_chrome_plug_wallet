'use client'

// 添加 / 编辑 RPC 节点对话框
// 关键流程：
//   1. 用户填入 URL + Basic Auth 凭据
//   2. 点击"测试连接"会先尝试请求 chrome.permissions.request 把目标 origin 加进
//      扩展的 host_permissions（如果尚未授权），再发起一次 getblockchaininfo 调用。
//   3. 测试通过即可保存；用户也可以直接保存（保存时也会请求权限）。

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
  DialogTitle
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
  if (typeof chrome === 'undefined' || !(chrome as any).permissions) return true
  try {
    const has = await (chrome as any).permissions.contains({ origins: [pattern] })
    if (has) return true
    return await (chrome as any).permissions.request({ origins: [pattern] })
  } catch (e) {
    console.warn('chrome.permissions 调用失败:', e)
    // 没拿到 API 时默认放行，避免开发态被拦截
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
        enabled: true
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
      <DialogContent className="bg-gray-900 border-gray-700 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{isEdit ? t('rpc.edit') : t('rpc.add')}</DialogTitle>
          <DialogDescription className="text-gray-400">{t('rpc.editInfo')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-gray-300">{t('rpc.field.name')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('rpc.field.namePlaceholder')}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">{t('rpc.field.url')}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://127.0.0.1:8342"
              className="bg-gray-800 border-gray-700 text-white font-mono text-sm"
            />
            {!isValidUrl && url && <p className="text-xs text-red-400">{t('rpc.field.urlInvalid')}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-300">{t('rpc.field.user')}</Label>
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">{t('rpc.field.password')}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                autoComplete="new-password"
              />
            </div>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                testResult.ok ? 'bg-green-900/30 text-green-300 border border-green-800/50' : 'bg-red-900/30 text-red-300 border border-red-800/50'
              }`}
            >
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              <div>
                {testResult.ok
                  ? `${t('rpc.testOk')} · chain=${testResult.chain} · ${testResult.responseTime}ms`
                  : `${t('rpc.testFail')}: ${testResult.message}`}
              </div>
            </div>
          )}

          <p className="text-xs text-yellow-500/80">{t('rpc.securityNote')}</p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="outline"
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
            disabled={!canSubmit || testing}
            onClick={handleTest}
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t('rpc.testConnection')}
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit} className="bg-purple-600 hover:bg-purple-700 text-white">
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
