'use client'

// 网络节点设置主页（Chrome 插件桌面化重塑）
// ----------------------------------------------------------------------
// 业务行为完全保留：
//   - 列出所有 RPC 节点（含内置默认 + 用户自定义）
//   - 添加 / 编辑 / 删除 / 启停 / 切换 active
//   - 显示当前 nodeInfo（连接状态 + 响应时间）
//
// 视觉：去掉手机风格大图标头与紫色标记，全面切到 emerald + zinc。
// ----------------------------------------------------------------------

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Lock,
  Server,
  AlertTriangle,
} from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'
import { useRpcConfigStore, type RpcNode } from '@/stores/rpc-config-store'
import { useWalletState } from '@/stores/wallet-store'
import { resetNodeMemory } from '@/lib/rpc-client'
import { RpcNodeEditDialog } from './rpc-node-edit-dialog'
import { useToast } from '@/hooks/use-toast'

interface RpcNodesSettingsProps {
  onBack: () => void
}

export function RpcNodesSettings({ onBack }: RpcNodesSettingsProps) {
  const { t } = useLanguage()
  const { toast } = useToast()
  const { nodeInfo } = useWalletState()

  const nodes = useRpcConfigStore((s) => s.nodes)
  const activeId = useRpcConfigStore((s) => s.activeId)
  const enableFailover = useRpcConfigStore((s) => s.enableFailover)
  const setActive = useRpcConfigStore((s) => s.setActive)
  const toggleEnabled = useRpcConfigStore((s) => s.toggleEnabled)
  const removeNode = useRpcConfigStore((s) => s.removeNode)
  const setEnableFailover = useRpcConfigStore((s) => s.setEnableFailover)

  const [editingNode, setEditingNode] = useState<RpcNode | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [deletingNode, setDeletingNode] = useState<RpcNode | null>(null)

  const handleAdd = () => {
    setEditingNode(null)
    setShowEditor(true)
  }
  const handleEdit = (node: RpcNode) => {
    setEditingNode(node)
    setShowEditor(true)
  }
  const handleDeleteConfirm = () => {
    if (!deletingNode) return
    removeNode(deletingNode.id)
    resetNodeMemory()
    setDeletingNode(null)
    toast({ title: t('rpc.deleted') })
  }
  const handleSetActive = (id: string) => {
    setActive(id)
    resetNodeMemory()
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-3">
      {/* 紧凑标题区 */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
          <Server className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-100 leading-tight">
            {t('settings.rpcNodes')}
          </h2>
          <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
            {t('settings.rpcNodesInfo')}
          </p>
        </div>
      </div>

      {/* 当前节点状态卡片 */}
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                {t('rpc.currentNode')}
              </div>
              <div className="text-[11px] text-zinc-200 font-mono break-all leading-relaxed">
                {nodeInfo.endpoint || '—'}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                {t('rpc.status')}
              </div>
              <div
                className={`text-xs font-medium ${
                  nodeInfo.status === 'connected'
                    ? 'text-emerald-400'
                    : nodeInfo.status === 'checking'
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {nodeInfo.status === 'connected' &&
                  `${t('node.status.connected')} · ${nodeInfo.responseTime}ms`}
                {nodeInfo.status === 'checking' && t('node.status.checking')}
                {nodeInfo.status === 'disconnected' && t('node.status.disconnected')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 失败转移开关 */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-zinc-200 font-medium">{t('rpc.failover')}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                {t('rpc.failoverInfo')}
              </div>
            </div>
            <Switch
              checked={enableFailover}
              onCheckedChange={(v) => setEnableFailover(v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 节点列表 */}
      <div className="space-y-2">
        {nodes.map((node) => {
          const isActive = node.id === activeId
          return (
            <Card
              key={node.id}
              className={`transition-colors ${
                isActive ? 'border-emerald-500/50' : ''
              }`}
            >
              <CardContent className="space-y-2">
                {/* 第一行：名称 + 标签 + 启停开关 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-zinc-100 font-medium truncate">
                        {node.name}
                      </span>
                      {node.isBuiltIn && (
                        <span className="text-[9px] uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700/60 px-1.5 py-px rounded">
                          {t('rpc.builtIn')}
                        </span>
                      )}
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-px rounded">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {t('rpc.active') || 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 break-all font-mono mt-1 leading-relaxed">
                      {node.url}
                    </div>
                  </div>
                  <Switch
                    checked={node.enabled}
                    onCheckedChange={() => toggleEnabled(node.id)}
                  />
                </div>

                {/* 第二行：操作按钮 */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {!isActive && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleSetActive(node.id)}
                      disabled={!node.enabled}
                    >
                      {t('rpc.setActive')}
                    </Button>
                  )}
                  <Button size="xs" variant="outline" onClick={() => handleEdit(node)}>
                    <Pencil className="h-3 w-3" />
                    {t('common.edit')}
                  </Button>
                  {!node.isBuiltIn && (
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50"
                      onClick={() => setDeletingNode(node)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button onClick={handleAdd} variant="success" size="sm" className="w-full">
        <Plus className="h-4 w-4" />
        {t('rpc.add')}
      </Button>

      <div className="text-[10px] text-zinc-500 flex items-start gap-1.5 px-1 leading-relaxed">
        <Lock className="h-3 w-3 mt-0.5 shrink-0" />
        <span>{t('rpc.securityFooter')}</span>
      </div>

      <Button onClick={onBack} variant="ghost" size="sm" className="w-full">
        {t('common.back')}
      </Button>

      <RpcNodeEditDialog
        open={showEditor}
        onOpenChange={setShowEditor}
        node={editingNode}
      />

      <AlertDialog
        open={!!deletingNode}
        onOpenChange={(open) => !open && setDeletingNode(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              {t('rpc.deleteConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[11px]">
              {t('rpc.deleteConfirmInfo')}
              <span className="block mt-2 text-emerald-300 font-mono break-all">
                {deletingNode?.url}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
