import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DailySchedule } from '@/types'

export function useSchedule(date?: string) {
  return useQuery<DailySchedule>({
    queryKey: ['schedule', date],
    queryFn: () => api.getDailySchedule(date),
    refetchInterval: 3600000, // Refetch every hour
    staleTime: 1800000, // Consider stale after 30 minutes
  })
}

