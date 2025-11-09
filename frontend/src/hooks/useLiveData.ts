import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { CauldronInfo, CauldronLevelsData, Market, Network } from '@/types'
import { DateTime } from 'luxon'
import { useMemo } from 'react'

export interface LiveCauldron extends CauldronInfo {
  fillPercent: number
  currentLevel: number
  statusColor: 'green' | 'yellow' | 'red' | 'gray'
  status: 'online' | 'offline' | 'warning' | 'error'
  lastUpdated: string | null
  timeToOverflow?: string | null
}

export interface LiveData {
  cauldrons: LiveCauldron[]
  market: Market | null
  network: Network | null
  lastUpdated: string
}

// Calculate status color based on fill percentage
function getStatusColor(fillPercent: number, isOffline: boolean): 'green' | 'yellow' | 'red' | 'gray' {
  if (isOffline) return 'gray'
  if (fillPercent < 30) return 'green'
  if (fillPercent < 80) return 'yellow'
  return 'red'
}

// Calculate status based on fill percentage and offline state
function getStatus(fillPercent: number, isOffline: boolean): 'online' | 'offline' | 'warning' | 'error' {
  if (isOffline) return 'offline'
  if (fillPercent >= 80) return 'error'
  if (fillPercent >= 30) return 'warning'
  return 'online'
}

export function useLiveData() {
  // Fetch all data in parallel
  const { data: cauldronsInfo = [], isLoading: cauldronsLoading } = useQuery<CauldronInfo[]>({
    queryKey: ['cauldronsInfo'],
    queryFn: () => api.getCauldronsInfo(),
    refetchInterval: 60000, // Refetch every 60 seconds
    staleTime: 30000, // Consider stale after 30 seconds
  })

  const { data: levelsData = [], isLoading: levelsLoading } = useQuery<CauldronLevelsData[]>({
    queryKey: ['cauldronLevelsData'],
    queryFn: () => api.getCauldronLevelsData(),
    refetchInterval: 60000, // Refetch every 60 seconds
    staleTime: 30000,
  })

  const { data: market, isLoading: marketLoading } = useQuery<Market>({
    queryKey: ['market'],
    queryFn: () => api.getMarket(),
    refetchInterval: 3600000, // Refetch every hour (static data)
    staleTime: 1800000, // Consider stale after 30 minutes
  })

  const { data: network, isLoading: networkLoading } = useQuery<Network>({
    queryKey: ['network'],
    queryFn: () => api.getNetwork(),
    refetchInterval: 3600000, // Refetch every hour (static data)
    staleTime: 1800000,
  })

  // Merge data to create live cauldrons
  const liveData = useMemo<LiveData>(() => {
    if (!cauldronsInfo.length) {
      return {
        cauldrons: [],
        market: market || null,
        network: network || null,
        lastUpdated: DateTime.now().toISO(),
      }
    }

    // Get the latest timestamp from levels data
    const latestTimestamp = levelsData.length > 0
      ? levelsData[levelsData.length - 1]?.timestamp
      : null

    // Get the latest levels
    const latestLevels = levelsData.length > 0
      ? levelsData[levelsData.length - 1]?.cauldron_levels || {}
      : {}

    // Helper function to find matching cauldron ID (handles format differences)
    const findMatchingCauldronId = (cauldronId: string, availableIds: string[]): string | null => {
      // Try exact match first
      if (cauldronId in latestLevels) {
        return cauldronId
      }
      
      // Try common ID format variations
      // e.g., "1" vs "cauldron_001" or "cauldron_1"
      const normalizedId = cauldronId.toLowerCase().replace(/^cauldron_?/, '').replace(/^0+/, '')
      
      for (const availableId of availableIds) {
        const normalizedAvailable = availableId.toLowerCase().replace(/^cauldron_?/, '').replace(/^0+/, '')
        if (normalizedAvailable === normalizedId) {
          return availableId
        }
      }
      
      return null
    }

    const availableIds = Object.keys(latestLevels)

    // Merge cauldron info with latest levels
    const liveCauldrons: LiveCauldron[] = cauldronsInfo.map(cauldron => {
      // Try to find matching cauldron ID (handles format differences)
      const matchingId = findMatchingCauldronId(cauldron.id, availableIds)
      const hasData = matchingId !== null
      const currentLevel = hasData ? latestLevels[matchingId!] : 0
      
      // A cauldron is offline if:
      // 1. There's no timestamp at all (no data received), OR
      // 2. There's a timestamp but this cauldron's ID is not in the data (cauldron is offline)
      const isOffline = latestTimestamp === null || !hasData
      
      const fillPercent = !isOffline && cauldron.max_volume > 0
        ? (currentLevel / cauldron.max_volume) * 100
        : 0
      
      const statusColor = getStatusColor(fillPercent, isOffline)
      const status = getStatus(fillPercent, isOffline)

      return {
        ...cauldron,
        fillPercent: Math.min(100, Math.max(0, fillPercent)),
        currentLevel,
        statusColor,
        status,
        lastUpdated: latestTimestamp,
      }
    })

    return {
      cauldrons: liveCauldrons,
      market: market || null,
      network: network || null,
      lastUpdated: latestTimestamp || DateTime.now().toISO(),
    }
  }, [cauldronsInfo, levelsData, market, network])

  return {
    data: liveData,
    isLoading: cauldronsLoading || levelsLoading || marketLoading || networkLoading,
  }
}

