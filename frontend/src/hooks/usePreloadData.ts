import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

/**
 * Preloads all data for all pages to ensure fast navigation
 * This hook runs once when the app loads and prefetches all necessary data
 */
export function usePreloadData() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Preload all common data that multiple pages use
    const preloadCommonData = async () => {
      try {
        // Prefetch core data used by most pages
        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: ['cauldronsInfo'],
            queryFn: () => api.getCauldronsInfo(),
            staleTime: 30000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['cauldronLevelsData'],
            queryFn: () => api.getCauldronLevelsData(),
            staleTime: 30000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['market'],
            queryFn: () => api.getMarket(),
            staleTime: 1800000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['network'],
            queryFn: () => api.getNetwork(),
            staleTime: 1800000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['discrepancy-data'],
            queryFn: () => api.getDiscrepancyData(),
          }),
          queryClient.prefetchQuery({
            queryKey: ['tickets'],
            queryFn: () => api.getTickets(),
            staleTime: 60000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['tickets-metadata'],
            queryFn: () => api.getTicketsMetadata(),
            staleTime: 60000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['couriers'],
            queryFn: () => api.getCouriers(),
          }),
          queryClient.prefetchQuery({
            queryKey: ['forecast'],
            queryFn: () => api.getForecast(),
            staleTime: 1800000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['cauldrons'],
            queryFn: () => api.getCauldrons(),
            staleTime: 30000,
          }),
          queryClient.prefetchQuery({
            queryKey: ['schedule'],
            queryFn: () => api.getDailySchedule(),
            staleTime: 1800000,
          }),
        ])

        // After core data is loaded, preload cauldron-specific data
        // First get the cauldrons list
        const cauldronsInfo = await api.getCauldronsInfo()
        
        // Prefetch data for each cauldron (for detail pages)
        const cauldronPrefetches = cauldronsInfo.map(cauldron =>
          Promise.all([
            queryClient.prefetchQuery({
              queryKey: ['cauldron-data', cauldron.id, 48],
              queryFn: () => api.getCauldronData(cauldron.id, 48),
            }),
            queryClient.prefetchQuery({
              queryKey: ['cauldron-data', cauldron.id, 12],
              queryFn: () => api.getCauldronData(cauldron.id, 12),
            }),
            queryClient.prefetchQuery({
              queryKey: ['anomalies', cauldron.id],
              queryFn: () => api.getAnomalies(cauldron.id),
            }),
            queryClient.prefetchQuery({
              queryKey: ['tickets', cauldron.id],
              queryFn: () => api.getTickets(cauldron.id),
            }),
          ])
        )

        // Wait for all cauldron data to be prefetched
        await Promise.all(cauldronPrefetches)
        
        console.log('✅ All page data preloaded successfully')
      } catch (error) {
        console.error('Error preloading data:', error)
        // Don't throw - we want the app to still work even if preloading fails
      }
    }

    preloadCommonData()
  }, [queryClient])
}

