import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DiscrepancyData } from '@/types'

export function useDiscrepancyData() {
  return useQuery<DiscrepancyData>({
    queryKey: ['discrepancy-data'],
    queryFn: () => api.getDiscrepancyData(),
  })
}

