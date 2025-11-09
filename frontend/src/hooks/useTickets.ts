import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Ticket } from '@/types'

export function useTickets(cauldronId?: string) {
  return useQuery<Ticket[]>({
    queryKey: ['tickets', cauldronId],
    queryFn: () => api.getTickets(cauldronId),
  })
}

