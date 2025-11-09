import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Forecast } from '@/types'

export function useForecast() {
  return useQuery<Forecast[]>({
    queryKey: ['forecast'],
    queryFn: () => api.getForecast(),
    refetchInterval: 3600000, // Refetch every hour
    staleTime: 1800000, // Consider stale after 30 minutes
  })
}

