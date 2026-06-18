import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import type { PricingEntity } from '@/lib/types'

export function usePricingByProvider(providerId: number) {
  return useQuery({
    queryKey: ['pricing', 'byProvider', providerId],
    queryFn: () => api.pricing.getByProvider(providerId),
  })
}

export function useUpsertPricing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: PricingEntity) => api.pricing.upsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
    },
  })
}

export function useDeletePricing() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { providerId: number; model: string }) => api.pricing.delete(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
    },
  })
}
