'use client'

// 网络节点设置主页
// 功能：列出所有 RPC 节点（含内置默认 + 用户自定义），允许添加 / 编辑 / 删除 /
//      启停 / 切换为 active；显示当前 nodeInfo（连接状态 + 响应时间）。

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
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Plus, Pencil, Trash2, CheckCircle2, Lock, Server, AlertTriangle } from 'lucide-react'
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
    <div className="flex-1 p-4 space-y-4 overflow-y-auto">
      <div className="text-center mb-2">
        <Server className="h-12 w-12 text-purple-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-white">{t('settings.rpcNodes')}</h2>
        <p className="text-gray-400 text-sm mt-1">{t('settings.rpcNodesInfo')}</p>
      </div>

      {/* 当前节点状态卡片 */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs text-gray-400">{t('rpc.currentNode')}</div>
              <div className="text-white text-sm font-mono break-all">
                {nodeInfo.endpoint || '—'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-400">{t('rpc.status')}</div>
              <div
                className={`text-sm font-medium ${
                  nodeInfo.status === 'connected'
                    ? 'text-green-400'
                    : nodeInfo.status === 'checking'
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}
              >
                {nodeInfo.status === 'connected' && `${t('node.status.connected')} · ${nodeInfo.responseTime}ms`}
                {nodeInfo.status === 'checking' && t('node.status.checking')}
                {nodeInfo.status === 'disconnected' && t('node.status.disconnected')}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 失败转移开关 */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white text-sm font-medium">{t('rpc.failover')}</div>
              <div className="text-xs text-gray-400">{t('rpc.failoverInfo')}</div>
            </div>
            <Switch checked={enableFailover} onCheckedChange={(v) => setEnableFailover(v)} />
          </div>
        </CardContent>
      </Card>

      {/* 节点列表 */}
      <div className="space-y-3">
        {nodes.map((node) => {
          const isActive = node.id === activeId
          return (
            <Card
              key={node.id}
              className={`bg-gray-800 border ${isActive ? 'border-purple-500/60' : 'border-gray-700'} transition-colors`}
            >
              <CardContent className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium truncate">{node.name}</span>
                      {node.isBuiltIn && (
                        <span className="text-[10px] uppercase tracking-wide bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded">
                          {t('rpc.builtIn')}
                        </span>
                      )}
                      {isActive && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                    </div>
                    <div className="text-xs text-gray-400 break-all font-mono mt-1">{node.url}</div>
                  </div>
                  <Switch checked={node.enabled} onCheckedChange={() => toggleEnabled(node.id)} />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-700 text-gray-200 hover:bg-gray-700 h-8"
                      onClick={() => handleSetActive(node.id)}
                      disabled={!node.enabled}
                    >
                      {t('rpc.setActive')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gray-700 text-gray-200 hover:bg-gray-700 h-8"
                    onClick={() => handleEdit(node)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    {t('common.edit')}
                  </Button>
                  {!node.isBuiltIn && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-900/40 text-red-300 hover:bg-red-900/30 h-8"
                      onClick={() => setDeletingNode(node)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Button onClick={handleAdd} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
        <Plus className="h-4 w-4 mr-2" />
        {t('rpc.add')}
      </Button>

      <div className="text-xs text-gray-500 flex items-start gap-2 px-1">
        <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>{t('rpc.securityFooter')}</span>
      </div>

      <Button onClick={onBack} variant="outline" className="w-full border-gray-600 text-gray-300 hover:bg-gray-700">
        {t('common.back')}
      </Button>

      <RpcNodeEditDialog open={showEditor} onOpenChange={setShowEditor} node={editingNode} />

      <AlertDialog open={!!deletingNode} onOpenChange={(open) => !open && setDeletingNode(null)}>
        <AlertDialogContent className="bg-gray-900 border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t('rpc.deleteConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {t('rpc.deleteConfirmInfo')}
              <div className="mt-2 text-purple-300 font-mono text-xs break-all">{deletingNode?.url}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
