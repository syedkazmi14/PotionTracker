import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Anomaly } from '@/types'

export function useAnomalies(cauldronId?: string) {
  return useQuery<Anomaly[]>({
    queryKey: ['anomalies', cauldronId],
    queryFn: () => api.getAnomalies(cauldronId),
  })
}

