/**
 * 代理服务器状态查询 Hooks
 *
 * 封装的 IPC 通道：
 * - proxy.status — 获取代理运行状态
 * - proxy.start / proxy.stop — 启停代理
 * - proxy.setPort — 设置代理端口
 * - proxy.getDebugMode / proxy.setDebugMode — 调试模式读写
 *
 * 关键设计：
 * - useToggleProxy: 封装了 start/stop 逻辑，根据当前 running 状态决定操作
 *   - running=true → stop；running=false → 先 setPort 再 start
 * - useDebugMode / useSetDebugMode: 调试模式独立缓存，不受代理启停影响
 * - 写操作（toggle、setDebugMode）成功后 invalidate 对应 queryKey 刷新 UI
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../ipc'
import type { ProxyStatus } from '../types'

export function useProxyStatus() {
  return useQuery<ProxyStatus>({
    queryKey: ['proxy', 'status'],
    queryFn: () => api.proxy.status(),
  })
}

export function useToggleProxy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ running, port }: { running: boolean; port: number }) => {
      if (running) {
        await api.proxy.stop()
      } else {
        await api.proxy.setPort(port)
        await api.proxy.start(port)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'status'] }),
  })
}

export function useDebugMode() {
  return useQuery<boolean>({
    queryKey: ['proxy', 'debugMode'],
    queryFn: () => api.proxy.getDebugMode(),
  })
}

export function useSetDebugMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => api.proxy.setDebugMode(enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proxy', 'debugMode'] }),
  })
}
