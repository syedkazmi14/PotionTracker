import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { TransportTicket } from '@/types'

export function useTickets(cauldronId?: string) {
  return useQuery<TransportTicket[]>({
    queryKey: ['tickets', cauldronId],
    queryFn: () => api.getTickets(cauldronId),
    refetchInterval: 60000, // Refetch every 60 seconds
  })
}

