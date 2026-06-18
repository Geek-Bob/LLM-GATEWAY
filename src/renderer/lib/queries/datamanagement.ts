/**
 * 数据管理查询 Hooks
 *
 * 封装的 IPC 通道：dataManagement.clear（按模块清空本地数据）
 *
 * TanStack Query 用法：
 * - useClearData: mutation，接收 ClearDataInput（business/operational 两类开关）
 *   成功后按清空类别失效对应缓存，使各列表页自动重新拉取展示空态
 *
 * 缓存策略：
 * - business=true → 失效 providers/modelMappings/apiKeys/conversations（业务数据域）
 * - operational=true → 失效 logs/stats（运行数据域）
 * - 使用 queryKey 前缀失效（{ queryKey: ['domain'] }），覆盖该 domain 所有 action
 *
 * 错误处理：本层不 toast，错误由调用组件处理（遵循 frontend/31-renderer.md，
 * 参照 useProviders 无 onError 的模式）。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { ClearDataInput, ClearDataResult } from '../../../shared/types'

/** 业务数据域 queryKey 前缀：清空后需重新拉取展示空态。 */
const BUSINESS_QUERY_KEYS = [
  ['providers'],
  ['modelMappings'],
  ['apiKeys'],
  ['conversations'],
] as const

/** 运行数据域 queryKey 前缀：清空后需重新拉取展示空态。 */
const OPERATIONAL_QUERY_KEYS = [
  ['logs'],
  ['stats'],
] as const

/**
 * 清空本地数据 mutation，成功后按清空类别失效对应缓存。
 *
 * @returns TanStack Mutation 对象，mutate 时调用 api.dataManagement.clear(input)。
 * @example
 * const { mutateAsync } = useClearData()
 * await mutateAsync({ business: true, operational: false })
 */
export function useClearData() {
  const qc = useQueryClient()
  return useMutation<ClearDataResult, Error, ClearDataInput>({
    mutationFn: (input: ClearDataInput) => api.dataManagement.clear(input),
    onSuccess: (_data, input) => {
      if (input.business) {
        for (const queryKey of BUSINESS_QUERY_KEYS) {
          qc.invalidateQueries({ queryKey })
        }
      }
      if (input.operational) {
        for (const queryKey of OPERATIONAL_QUERY_KEYS) {
          qc.invalidateQueries({ queryKey })
        }
      }
    },
  })
}
