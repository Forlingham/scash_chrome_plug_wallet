// RPC 多节点配置 Store
// 设计要点：
// 1. 内置一个不可删除的默认公共节点（区块浏览器维护的公共 RPC），让用户开箱即用。
// 2. 用户可以新增自己的私有节点（URL + Basic Auth 用户名/密码）。
// 3. activeId 记录当前优选节点；rpc-client 调用 RPC 时会从 active 开始尝试，失败自动按顺序切换。
// 4. 持久化到 localStorage（zustand persist），方便扩展 popup 重开后保留配置。
//
// 安全提示：
// - 节点凭据以明文形式持久化在浏览器 localStorage。对于 Chrome 扩展来说，
//   storage 仅插件自身可访问；但任何能读取本机用户数据目录的人都能看到。
// - UI 层会在添加节点页明确提示该限制。

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { DEFAULT_PUBLIC_RPC } from '@/lib/const'

export interface RpcNode {
  id: string
  name: string
  url: string
  user: string
  password: string
  enabled: boolean
  // 内置节点不可删除，仅可禁用
  isBuiltIn?: boolean
}

interface RpcConfigState {
  nodes: RpcNode[]
  activeId: string | null
  // 默认开启失败转移：active 节点失败后按顺序尝试其他 enabled 节点
  enableFailover: boolean

  addNode: (node: Omit<RpcNode, 'id' | 'isBuiltIn'>) => RpcNode
  updateNode: (id: string, patch: Partial<Omit<RpcNode, 'id' | 'isBuiltIn'>>) => void
  removeNode: (id: string) => void
  setActive: (id: string) => void
  toggleEnabled: (id: string) => void
  setEnableFailover: (v: boolean) => void

  // 给 rpc-client 直接消费的两个工具方法
  getActiveAndFallbackNodes: () => RpcNode[]
  getNodeById: (id: string) => RpcNode | undefined

  // 重置为只剩内置节点（用于排错或恢复出厂）
  resetToBuiltIn: () => void
}

const genId = () => {
  if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
    return (crypto as any).randomUUID() as string
  }
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useRpcConfigStore = create<RpcConfigState>()(
  persist(
    immer((set, get) => ({
      nodes: [{ ...DEFAULT_PUBLIC_RPC }],
      activeId: DEFAULT_PUBLIC_RPC.id,
      enableFailover: true,

      addNode: (node) => {
        const newNode: RpcNode = {
          ...node,
          id: genId(),
          isBuiltIn: false
        }
        set((state) => {
          state.nodes.push(newNode)
          // 第一次添加用户节点时也保留 active 在原 active 上
          if (!state.activeId) {
            state.activeId = newNode.id
          }
        })
        return newNode
      },

      updateNode: (id, patch) => {
        set((state) => {
          const target = state.nodes.find((n) => n.id === id)
          if (!target) return
          // 内置节点的 url/user/password 也允许覆盖（个别用户希望换成自己的鉴权）
          Object.assign(target, patch)
        })
      },

      removeNode: (id) => {
        set((state) => {
          const target = state.nodes.find((n) => n.id === id)
          if (!target) return
          if (target.isBuiltIn) return // 内置节点不可删除
          state.nodes = state.nodes.filter((n) => n.id !== id)
          if (state.activeId === id) {
            const fallback = state.nodes.find((n) => n.enabled) || state.nodes[0]
            state.activeId = fallback ? fallback.id : null
          }
        })
      },

      setActive: (id) => {
        set((state) => {
          const target = state.nodes.find((n) => n.id === id)
          if (!target) return
          state.activeId = id
          if (!target.enabled) target.enabled = true
        })
      },

      toggleEnabled: (id) => {
        set((state) => {
          const target = state.nodes.find((n) => n.id === id)
          if (!target) return
          target.enabled = !target.enabled
          // 如果禁用了 active 节点，自动切到下一个 enabled 节点
          if (!target.enabled && state.activeId === id) {
            const next = state.nodes.find((n) => n.enabled && n.id !== id)
            state.activeId = next ? next.id : null
          }
        })
      },

      setEnableFailover: (v) => {
        set((state) => {
          state.enableFailover = v
        })
      },

      getActiveAndFallbackNodes: () => {
        const { nodes, activeId, enableFailover } = get()
        const enabled = nodes.filter((n) => n.enabled)
        if (enabled.length === 0) return []
        if (!enableFailover) {
          const active = enabled.find((n) => n.id === activeId)
          return active ? [active] : [enabled[0]]
        }
        // 失败转移：active 排第一，其他依次跟在后面
        const active = enabled.find((n) => n.id === activeId)
        const others = enabled.filter((n) => n.id !== activeId)
        return active ? [active, ...others] : enabled
      },

      getNodeById: (id) => get().nodes.find((n) => n.id === id),

      resetToBuiltIn: () => {
        set((state) => {
          state.nodes = [{ ...DEFAULT_PUBLIC_RPC }]
          state.activeId = DEFAULT_PUBLIC_RPC.id
          state.enableFailover = true
        })
      }
    })),
    {
      name: 'scash-rpc-config',
      storage: createJSONStorage(() => localStorage),
      // 兼容老版本：如果 storage 为空（首次安装），上面的初始 state 会被使用。
      // 如果 storage 中缺少内置节点（极端情况），这里做一次 migration。
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const hasBuiltIn = state.nodes.some((n) => n.id === DEFAULT_PUBLIC_RPC.id)
        if (!hasBuiltIn) {
          state.nodes = [{ ...DEFAULT_PUBLIC_RPC }, ...state.nodes]
          if (!state.activeId) state.activeId = DEFAULT_PUBLIC_RPC.id
        }
      }
    }
  )
)

// 供非 React 上下文使用（如 lib/rpc-client.ts）
export function getActiveAndFallbackNodesSnapshot(): RpcNode[] {
  return useRpcConfigStore.getState().getActiveAndFallbackNodes()
}

export function setActiveNodeId(id: string) {
  const state = useRpcConfigStore.getState()
  if (state.activeId !== id) state.setActive(id)
}
