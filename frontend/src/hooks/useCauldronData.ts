import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { CauldronDataPoint } from '@/types'

export function useCauldronData(id: string, hours: number = 24) {
  return useQuery<CauldronDataPoint[]>({
    queryKey: ['cauldron-data', id, hours],
    queryFn: () => api.getCauldronData(id, hours),
    enabled: !!id,
  })
}

