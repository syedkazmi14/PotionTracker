import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Cauldron } from '@/types'

export function useCauldrons() {
  return useQuery<Cauldron[]>({
    queryKey: ['cauldrons'],
    queryFn: () => api.getCauldrons(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

export function useCauldron(id: string) {
  return useQuery<Cauldron | null>({
    queryKey: ['cauldron', id],
    queryFn: () => api.getCauldron(id),
    enabled: !!id,
  })
}

