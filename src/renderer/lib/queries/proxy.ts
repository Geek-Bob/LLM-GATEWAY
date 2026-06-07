/**
 * 代理服务器状态查询 Hooks
 *
 * 封装的 IPC 通道：
 * - proxy.get — 获取代理运行状态（含 debugMode）
 * - proxy.start / proxy.stop — 启停代理
 * - proxy.updatePort — 设置代理端口
 * - proxy.update — 设置调试模式
 *
 * 关键设计：
 * - useToggleProxy: 封装了 start/stop 逻辑，根据当前 running 状态决定操作
 *   - running=true → stop；running=false → 先 setPort 再 start
 * - useDebugMode / useSetDebugMode: 从 proxy status 中提取 debugMode，共享缓存
 * - 写操作（toggle、setDebugMode）成功后 invalidate 对应 queryKey 刷新 UI
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { ProxyStatus } from '@/lib/types'

/** 代理状态（含调试模式） */
type ProxyStatusWithDebug = ProxyStatus & { debugMode: boolean }

/** 查询代理服务器运行状态（含 debugMode）。 @returns TanStack Query 结果，data 为 ProxyStatusWithDebug。 */
export function useProxyStatus() {
  return useQuery<ProxyStatusWithDebug>({
    queryKey: ['proxy', 'status'],
    queryFn: () => api.proxy.status(),
  })
}

/** 启停代理服务器 mutation，根据当前 isRunning 状态自动切换。 @returns TanStack Mutation 对象。 */
export function useToggleProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ isRunning, port }: { isRunning: boolean; port: number }) => {
      if (isRunning) {
        await api.proxy.stop()
      } else {
        await api.proxy.setPort(port)
        await api.proxy.start(port)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'status'] }),
  })
}

/** 查询当前调试模式状态（从 proxy status 缓存中提取）。 @returns TanStack Query 结果，data 为 boolean。 */
export function useDebugMode() {
  return useQuery<ProxyStatusWithDebug, unknown, boolean>({
    queryKey: ['proxy', 'status'],
    queryFn: () => api.proxy.status(),
    select: (data) => data.debugMode,
  })
}

/** 设置调试模式 mutation，成功后自动刷新缓存。 @returns TanStack Mutation 对象。 */
export function useSetDebugMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => api.proxy.setDebugMode(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'status'] }),
  })
}
