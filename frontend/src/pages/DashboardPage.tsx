import { useCauldrons } from '@/hooks/useCauldrons'
import { useDiscrepancyData } from '@/hooks/useDiscrepancyData'
import { Card as KPICard } from '@/components/Card'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer } from '@/components/ChartContainer'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, Cell, ScatterChart, Scatter } from 'recharts'
import { Activity, AlertTriangle, FlaskConical } from 'lucide-react'
import { DateTime } from 'luxon'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TrendLineDataPoint } from '@/types'

type TimeRange = 'past24h' | 'today' | 'yesterday' | 'custom'

export function DashboardPage() {
  const { data: cauldrons = [], isLoading } = useCauldrons()
  const { data: discrepancyData = {}, isLoading: discrepancyLoading } = useDiscrepancyData()
  const [timeRange, setTimeRange] = useState<TimeRange>('past24h')
  const [startDate, setStartDate] = useState<DateTime>(DateTime.now().minus({ days: 7 }))
  const [endDate, setEndDate] = useState<DateTime>(DateTime.now())
  const [threshold, setThreshold] = useState<number>(0)

  // Calculate KPIs
  const cauldronsOnline = cauldrons.filter(c => c.status !== 'offline').length
  
  // Calculate Active Anomalies Today based on discrepancy threshold
  const totalAnomalies = useMemo(() => {
    if (discrepancyLoading || Object.keys(discrepancyData).length === 0) {
      return 0
    }
    
    const today = DateTime.now().startOf('day')
    const cauldronsWithAnomalies = new Set<string>()
    
    Object.entries(discrepancyData).forEach(([cauldronId, points]) => {
      const hasAnomaly = points.some(point => {
        const pointDate = DateTime.fromISO(point.date)
        const isToday = pointDate.isValid && pointDate.startOf('day').equals(today)
        return isToday && Math.abs(point.descrepency) >= threshold
      })
      if (hasAnomaly) {
        cauldronsWithAnomalies.add(cauldronId)
      }
    })
    
    return cauldronsWithAnomalies.size
  }, [discrepancyData, discrepancyLoading, threshold])
  
  // Calculate total current liters from all cauldrons
  const totalPotions = cauldrons.reduce((sum, c) => sum + (c.potions || 0), 0)

  // Get first 12 cauldrons
  const cauldronsToTrack = cauldrons.slice(0, 12)

  // Fetch real data from API endpoints
  const { data: cauldronsInfo = [], isLoading: cauldronsInfoLoading, error: cauldronsInfoError } = useQuery({
    queryKey: ['cauldrons-info'],
    queryFn: () => api.getCauldronsInfo(),
    refetchInterval: 60000, // Refetch every 60 seconds
  })

  const { data: cauldronLevelsData = [], isLoading: levelsDataLoading, error: levelsDataError } = useQuery({
    queryKey: ['cauldron-levels-data'],
    queryFn: () => api.getCauldronLevelsData(),
    refetchInterval: 60000, // Refetch every 60 seconds
  })

  // Calculate hours based on time range
  const hoursForRange = useMemo(() => {
    const now = DateTime.now()
    switch (timeRange) {
      case 'past24h':
        return 24
      case 'today':
        const startOfToday = now.startOf('day')
        return Math.ceil(now.diff(startOfToday, 'hours').hours) + 1 // Add 1 to ensure we get all of today
      case 'yesterday':
        // Fetch 48 hours to ensure we have all of yesterday's data (we'll filter it)
        return 48
      case 'custom':
        return Math.ceil(endDate.diff(startDate, 'hours').hours) + 1 // Add 1 to ensure we get the end date
      default:
        return 24
    }
  }, [timeRange, startDate, endDate])

  // Fallback: Fetch mock data for all cauldrons if API fails
  const cauldronDataQueries = useQueries({
    queries: cauldronsToTrack.map(cauldron => ({
      queryKey: ['cauldron-data', cauldron.id, hoursForRange, timeRange, timeRange === 'custom' ? `${startDate.toISODate()}-${endDate.toISODate()}` : ''],
      queryFn: () => {
        return api.getCauldronData(cauldron.id, hoursForRange)
      },
      enabled: !!cauldron.id && (!!cauldronsInfoError || !!levelsDataError), // Only use mock data if API fails
    })),
  })

  // Transform real data for line chart with fill percentages
  const lineChartData = useMemo(() => {
    // If API calls failed, fall back to mock data
    if (cauldronsInfoError || levelsDataError) {
      console.error('API call failed, falling back to mock data:', { cauldronsInfoError, levelsDataError })
      
      // Use existing mock data logic
      if (cauldronDataQueries.some(q => q.isLoading) || cauldronsToTrack.length === 0) {
        return []
      }

      const allTimes = new Set<string>()
      cauldronDataQueries.forEach(query => {
        const data = query.data || []
        data.forEach(point => {
          const time = DateTime.fromISO(point.time)
          const minuteKey = time.toFormat('yyyy-MM-dd HH:mm')
          allTimes.add(minuteKey)
        })
      })

      const now = DateTime.now()
      let filteredTimes = Array.from(allTimes)
      
      if (timeRange === 'today') {
        const startOfToday = now.startOf('day')
        filteredTimes = filteredTimes.filter(timeKey => {
          const timeObj = DateTime.fromFormat(timeKey, 'yyyy-MM-dd HH:mm')
          return timeObj >= startOfToday && timeObj <= now
        })
      } else if (timeRange === 'yesterday') {
        const startOfYesterday = now.minus({ days: 1 }).startOf('day')
        const endOfYesterday = now.minus({ days: 1 }).endOf('day')
        filteredTimes = filteredTimes.filter(timeKey => {
          const timeObj = DateTime.fromFormat(timeKey, 'yyyy-MM-dd HH:mm')
          return timeObj >= startOfYesterday && timeObj <= endOfYesterday
        })
      } else if (timeRange === 'custom') {
        filteredTimes = filteredTimes.filter(timeKey => {
          const timeObj = DateTime.fromFormat(timeKey, 'yyyy-MM-dd HH:mm')
          return timeObj >= startDate && timeObj <= endDate
        })
      }

      const sortedTimes = filteredTimes.sort((a, b) => {
        return DateTime.fromFormat(a, 'yyyy-MM-dd HH:mm').toMillis() - DateTime.fromFormat(b, 'yyyy-MM-dd HH:mm').toMillis()
      })

      const formatTime = (timeObj: DateTime) => {
        if (timeRange === 'past24h' || timeRange === 'today') {
          return timeObj.toFormat('HH:mm')
        } else if (timeRange === 'yesterday') {
          return timeObj.toFormat('HH:mm')
        } else {
          return timeObj.toFormat('MMM dd HH:mm')
        }
      }

      return sortedTimes.map(timeKey => {
        const timeObj = DateTime.fromFormat(timeKey, 'yyyy-MM-dd HH:mm')
        const dataPoint: Record<string, any> = {
          time: formatTime(timeObj),
          timeSort: timeObj.toMillis(),
        }

        cauldronsToTrack.forEach((_, index) => {
          const queryData = cauldronDataQueries[index].data || []
          const closestPoint = queryData.find(point => {
            const pointTime = DateTime.fromISO(point.time)
            const pointMinuteKey = pointTime.toFormat('yyyy-MM-dd HH:mm')
            return pointMinuteKey === timeKey
          })
          
          if (closestPoint) {
            dataPoint[`Cauldron ${index + 1}`] = Math.round(closestPoint.level * 100) / 100
          } else {
            dataPoint[`Cauldron ${index + 1}`] = null
          }
        })

        return dataPoint
      }).sort((a, b) => a.timeSort - b.timeSort)
        .map(({ timeSort, ...rest }) => rest)
    }

    // Use real API data
    if (cauldronsInfoLoading || levelsDataLoading || cauldronsInfo.length === 0 || cauldronLevelsData.length === 0) {
      return []
    }

    // Create a map of cauldron ID to max_volume
    const maxVolumeMap = new Map<string, number>()
    cauldronsInfo.forEach(cauldron => {
      maxVolumeMap.set(cauldron.id, cauldron.max_volume)
    })

    // Filter data based on time range
    const now = DateTime.now()
    let filteredData = [...cauldronLevelsData]

    if (timeRange === 'past24h') {
      const past24h = now.minus({ hours: 24 })
      filteredData = filteredData.filter(item => {
        const timestamp = DateTime.fromISO(item.timestamp)
        return timestamp.isValid && timestamp >= past24h && timestamp <= now
      })
    } else if (timeRange === 'today') {
      const startOfToday = now.startOf('day')
      filteredData = filteredData.filter(item => {
        const timestamp = DateTime.fromISO(item.timestamp)
        return timestamp.isValid && timestamp >= startOfToday && timestamp <= now
      })
    } else if (timeRange === 'yesterday') {
      const startOfYesterday = now.minus({ days: 1 }).startOf('day')
      const endOfYesterday = now.minus({ days: 1 }).endOf('day')
      filteredData = filteredData.filter(item => {
        const timestamp = DateTime.fromISO(item.timestamp)
        return timestamp.isValid && timestamp >= startOfYesterday && timestamp <= endOfYesterday
      })
    } else if (timeRange === 'custom') {
      filteredData = filteredData.filter(item => {
        const timestamp = DateTime.fromISO(item.timestamp)
        return timestamp.isValid && timestamp >= startDate && timestamp <= endDate
      })
    }

    // Sort by timestamp
    filteredData.sort((a, b) => {
      const timeA = DateTime.fromISO(a.timestamp)
      const timeB = DateTime.fromISO(b.timestamp)
      return timeA.toMillis() - timeB.toMillis()
    })

    // Format time based on range
    const formatTime = (timestamp: string) => {
      const timeObj = DateTime.fromISO(timestamp)
      if (!timeObj.isValid) return timestamp
      
      if (timeRange === 'past24h' || timeRange === 'today') {
        return timeObj.toFormat('HH:mm')
      } else if (timeRange === 'yesterday') {
        return timeObj.toFormat('HH:mm')
      } else {
        return timeObj.toFormat('MMM dd HH:mm')
      }
    }

    // Transform data: compute fill percentages for each cauldron
    const chartData: TrendLineDataPoint[] = filteredData.map(item => {
      const dataPoint: TrendLineDataPoint = {
        time: formatTime(item.timestamp),
      } as TrendLineDataPoint

      // Compute fill percentage for each cauldron
      Object.entries(item.cauldron_levels).forEach(([cauldronId, volume]) => {
        const maxVolume = maxVolumeMap.get(cauldronId)
        if (maxVolume && maxVolume > 0) {
          const fillPercent = (volume / maxVolume) * 100
          // Use cauldron ID as key (e.g., "cauldron_001")
          dataPoint[cauldronId] = Math.round(fillPercent * 100) / 100
        } else {
          dataPoint[cauldronId] = null
        }
      })

      return dataPoint
    })

    return chartData
  }, [cauldronsInfo, cauldronLevelsData, cauldronsInfoLoading, levelsDataLoading, cauldronsInfoError, levelsDataError, timeRange, startDate, endDate, cauldronDataQueries, cauldronsToTrack])

  // Transform data for bar chart (current counts by category)
  const barChartData = useMemo(() => {
    // If API calls failed, fall back to mock data
    if (cauldronsInfoError || levelsDataError) {
      if (isLoading || cauldronsToTrack.length === 0) {
        return []
      }

      // Count cauldrons by fill level category using mock data
      const low = cauldronsToTrack.filter(c => c.status !== 'offline' && c.level >= 0 && c.level < 30).length
      const medium = cauldronsToTrack.filter(c => c.status !== 'offline' && c.level >= 30 && c.level < 80).length
      const almostFull = cauldronsToTrack.filter(c => c.status !== 'offline' && c.level >= 80 && c.level <= 100).length
      const offline = cauldronsToTrack.filter(c => c.status === 'offline').length

      return [
        { name: '0-30%', value: low, fill: '#10b981' },
        { name: '30-80%', value: medium, fill: '#f59e0b' },
        { name: '80-100%', value: almostFull, fill: '#ef4444' },
        { name: 'Offline', value: offline, fill: '#6b7280' },
      ]
    }

    // Use real API data
    if (cauldronsInfoLoading || levelsDataLoading || cauldronsInfo.length === 0 || cauldronLevelsData.length === 0) {
      return []
    }

    // Create a map of cauldron ID to max_volume (same as line chart)
    const maxVolumeMap = new Map<string, number>()
    cauldronsInfo.forEach(cauldron => {
      maxVolumeMap.set(cauldron.id, cauldron.max_volume)
    })

    // Get the latest data point (most recent timestamp)
    const latestData = cauldronLevelsData.reduce((latest, current) => {
      const latestTime = DateTime.fromISO(latest.timestamp)
      const currentTime = DateTime.fromISO(current.timestamp)
      return currentTime.isValid && latestTime.isValid && currentTime > latestTime ? current : latest
    }, cauldronLevelsData[0])

    // Calculate current fill percentages for each cauldron using the same formula as line chart
    // fill_percent = (cauldron_levels[id] / max_volume[id]) * 100
    const cauldronFillLevels = new Map<string, number>()
    
    // Calculate fill percentages using the exact same formula as line chart
    Object.entries(latestData.cauldron_levels).forEach(([cauldronId, volume]) => {
      const maxVolume = maxVolumeMap.get(cauldronId)
      if (maxVolume && maxVolume > 0) {
        const fillPercent = (volume / maxVolume) * 100
        cauldronFillLevels.set(cauldronId, fillPercent)
      }
    })

    // Create a set of all cauldron IDs that have data in the latest reading
    const cauldronsWithData = new Set(Object.keys(latestData.cauldron_levels))
    
    // Helper function to try to find a matching cauldron ID (handles format differences)
    const findMatchingCauldronId = (cauldronId: string, availableIds: Set<string>): string | null => {
      // Try exact match first
      if (availableIds.has(cauldronId)) {
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

    // Count cauldrons by fill level category
    let low = 0
    let medium = 0
    let almostFull = 0
    let offline = 0

    cauldronsInfo.forEach(cauldron => {
      // Try to find matching cauldron ID (handles format differences)
      const matchingId = findMatchingCauldronId(cauldron.id, cauldronsWithData)
      const hasData = matchingId !== null
      const fillPercent = matchingId ? cauldronFillLevels.get(matchingId) : undefined
      
      if (hasData) {
        // Cauldron has data in latest reading
        if (fillPercent !== undefined) {
          // We can calculate fill percentage
          if (fillPercent >= 0 && fillPercent < 30) {
            low++
          } else if (fillPercent >= 30 && fillPercent < 80) {
            medium++
          } else if (fillPercent >= 80 && fillPercent <= 100) {
            almostFull++
          } else {
            // If fillPercent is > 100 or < 0, still count it but put in appropriate category
            if (fillPercent < 0) {
              low++
            } else {
              almostFull++
            }
          }
        } else {
          // Cauldron exists in data but max_volume might be missing or 0
          // Since we have volume data, treat as low (0%) - it's online, just can't calculate percentage
          low++
        }
      } else {
        // Cauldron exists in cauldronsInfo but not in latest data
        // This could mean it's offline, but if the user says none are offline,
        // we should check if maybe the ID format doesn't match
        // For now, if it's a known cauldron but has no data, treat as low (0%) instead of offline
        // This is more lenient - only mark as offline if we're absolutely sure
        console.warn(`Cauldron ${cauldron.id} (${cauldron.name}) not found in latest data. Available IDs:`, Array.from(cauldronsWithData))
        // Treat as low (0%) rather than offline since it's a known cauldron
        low++
      }
    })

    return [
      { name: '0-30%', value: low, fill: '#10b981' },
      { name: '30-80%', value: medium, fill: '#f59e0b' },
      { name: '80-100%', value: almostFull, fill: '#ef4444' },
      { name: 'Offline', value: offline, fill: '#6b7280' },
    ]
  }, [cauldronsInfo, cauldronLevelsData, cauldronsInfoLoading, levelsDataLoading, cauldronsInfoError, levelsDataError, cauldronsToTrack, isLoading])

  // Transform discrepancy data for scatter chart
  const discrepancyChartData = useMemo(() => {
    if (discrepancyLoading || Object.keys(discrepancyData).length === 0) {
      return []
    }

    // Create a map of cauldron IDs to names from cauldronsInfo
    const cauldronNameMap = new Map<string, string>()
    if (cauldronsInfo && cauldronsInfo.length > 0) {
      cauldronsInfo.forEach(cauldron => {
        // Store the ID as-is
        cauldronNameMap.set(cauldron.id, cauldron.name || cauldron.id)
        
        // Normalize the ID and store variations for matching
        const normalizedId = cauldron.id.toLowerCase().replace(/^cauldron_?/, '').replace(/^0+/, '')
        const paddedId = `cauldron_${normalizedId.padStart(3, '0')}`
        const unpaddedId = `cauldron_${normalizedId}`
        
        // Store normalized versions for easier lookup
        cauldronNameMap.set(paddedId, cauldron.name || cauldron.id)
        cauldronNameMap.set(unpaddedId, cauldron.name || cauldron.id)
        if (normalizedId) {
          cauldronNameMap.set(normalizedId, cauldron.name || cauldron.id)
        }
      })
    }

    // Helper function to get cauldron name
    const getCauldronName = (cauldronId: string): string => {
      // Try exact match first
      if (cauldronNameMap.has(cauldronId)) {
        return cauldronNameMap.get(cauldronId)!
      }
      
      // Try normalized versions
      const normalizedId = cauldronId.toLowerCase().replace(/^cauldron_?/, '').replace(/^0+/, '')
      const paddedId = `cauldron_${normalizedId.padStart(3, '0')}`
      const unpaddedId = `cauldron_${normalizedId}`
      
      if (cauldronNameMap.has(paddedId)) {
        return cauldronNameMap.get(paddedId)!
      }
      if (cauldronNameMap.has(unpaddedId)) {
        return cauldronNameMap.get(unpaddedId)!
      }
      if (cauldronNameMap.has(normalizedId)) {
        return cauldronNameMap.get(normalizedId)!
      }
      
      // Fallback to default pattern
      return `Cauldron ${normalizedId || cauldronId}`
    }

    // Collect all points with their cauldron info and apply threshold filter
    const allPoints: Array<{ date: DateTime; discrepancy: number; cauldron: string }> = []
    
    Object.entries(discrepancyData).forEach(([cauldronId, points]) => {
      const displayName = getCauldronName(cauldronId)
      
      points.forEach(point => {
        const date = DateTime.fromISO(point.date)
        if (date.isValid && Math.abs(point.descrepency) >= threshold) {
          allPoints.push({
            date,
            discrepancy: point.descrepency,
            cauldron: displayName,
          })
        }
      })
    })

    // Format for scatter chart - group by cauldron
    const cauldronSeries = new Map<string, Array<{ x: number; y: number; date: string; cauldron: string }>>()
    
    allPoints.forEach(point => {
      if (!cauldronSeries.has(point.cauldron)) {
        cauldronSeries.set(point.cauldron, [])
      }
      cauldronSeries.get(point.cauldron)!.push({
        x: point.date.toMillis(),
        y: point.discrepancy,
        date: point.date.toISODate() || point.date.toFormat('yyyy-MM-dd'), // Store as ISO date string for serialization
        cauldron: point.cauldron,
      })
    })

    return Array.from(cauldronSeries.entries()).map(([cauldron, data]) => ({
      cauldron,
      data: data.sort((a, b) => a.x - b.x).map(point => ({
        x: point.x,
        y: point.y,
        date: point.date,
        cauldron: point.cauldron,
      })),
    }))
  }, [discrepancyData, discrepancyLoading, threshold, cauldronsInfo])

  if (isLoading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Overview of your cauldron system</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title="Cauldrons Online"
          value={cauldronsOnline}
          icon={<Activity className="h-4 w-4" />}
        />
        <KPICard
          title="Active Anomalies Today"
          value={totalAnomalies}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <KPICard
          title="Total Potions (Liters)"
          value={totalPotions}
          icon={<FlaskConical className="h-4 w-4" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="p-6 pb-0">
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-3">
                Cauldron Level Trend ({timeRange === 'past24h' ? 'Past 24hr' : timeRange === 'today' ? 'Today' : timeRange === 'yesterday' ? 'Yesterday' : `${startDate.toFormat('MMM dd')} - ${endDate.toFormat('MMM dd')}`})
              </h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={timeRange === 'past24h' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('past24h')}
                >
                  Past 24hr
                </Button>
                <Button
                  variant={timeRange === 'today' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('today')}
                >
                  Today
                </Button>
                <Button
                  variant={timeRange === 'yesterday' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('yesterday')}
                >
                  Yesterday
                </Button>
                <Button
                  variant={timeRange === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('custom')}
                >
                  Custom Range
                </Button>
                {timeRange === 'custom' && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      value={startDate.toISODate() || ''}
                      onChange={(e) => {
                        const date = DateTime.fromISO(e.target.value)
                        if (date.isValid) {
                          setStartDate(date)
                          if (date > endDate) {
                            setEndDate(date)
                          }
                        }
                      }}
                      className="px-2 py-1 text-sm border rounded text-black bg-white"
                    />
                    <span className="text-sm">to</span>
                    <input
                      type="date"
                      value={endDate.toISODate() || ''}
                      onChange={(e) => {
                        const date = DateTime.fromISO(e.target.value)
                        if (date.isValid) {
                          setEndDate(date)
                          if (date < startDate) {
                            setStartDate(date)
                          }
                        }
                      }}
                      max={DateTime.now().toISODate() || undefined}
                      className="px-2 py-1 text-sm border rounded text-black bg-white"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <CardContent className="p-6 pt-0">
            <div className="w-full h-[300px] sm:h-[400px]">
              {(cauldronsInfoLoading || levelsDataLoading) && !cauldronsInfoError && !levelsDataError ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Loading chart data...
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', color: '#000' }}
                    labelStyle={{ color: '#000' }}
                    formatter={(value: any) => {
                      if (value === null || value === undefined) return 'N/A'
                      return typeof value === 'number' ? `${value.toFixed(2)}%` : value
                    }}
                  />
                  <Legend />
                  {(() => {
                    // Use real cauldron IDs if available, otherwise fall back to mock data structure
                    if (cauldronsInfo.length > 0 && !cauldronsInfoError && !levelsDataError) {
                      return cauldronsInfo.slice(0, 12).map((cauldron, index) => (
                        <Line
                          key={cauldron.id}
                          type="monotone"
                          dataKey={cauldron.id}
                          name={cauldron.name || cauldron.id}
                          stroke={`hsl(${(index * 360) / Math.max(cauldronsInfo.length, 1)}, 70%, 50%)`}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))
                    } else {
                      // Fallback to mock data structure
                      return cauldronsToTrack.map((_, index) => (
                        <Line
                          key={index}
                          type="monotone"
                          dataKey={`Cauldron ${index + 1}`}
                          stroke={`hsl(${(index * 360) / 12}, 70%, 50%)`}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))
                    }
                  })()}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <ChartContainer title="Cauldron Fill Level">
          {(cauldronsInfoLoading || levelsDataLoading) && !cauldronsInfoError && !levelsDataError ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading chart data...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', color: '#000' }}
                  labelStyle={{ color: '#000' }}
                />
                <Bar dataKey="value">
                  {barChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </div>

      {/* Discrepancy Chart */}
      <Card>
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Discrepancy Over Time</h3>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium flex items-center gap-2">
                <span>Threshold:</span>
                <input
                  type="range"
                  min="0"
                  max="150"
                  step="1"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground min-w-[3rem]">{threshold}</span>
              </label>
            </div>
          </div>
        </div>
        <CardContent className="p-6 pt-0">
          <div className="w-full h-[400px]">
            {discrepancyChartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No discrepancy data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 20, right: 20, bottom: 60, left: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number"
                    dataKey="x"
                    domain={['dataMin', 'dataMax']}
                    scale="linear"
                    tickFormatter={(value) => {
                      if (!value || typeof value !== 'number') return ''
                      const date = DateTime.fromMillis(value)
                      if (!date.isValid) return ''
                      return date.toFormat('MMM dd')
                    }}
                    tick={{ fill: '#000000' }}
                    label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { fill: '#000000' } }}
                  />
                  <YAxis 
                    type="number"
                    dataKey="y"
                    label={{ value: 'Discrepancy', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', color: '#000' }}
                    labelStyle={{ color: '#000' }}
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload[0] || !payload[0].payload) return null
                      
                      const point = payload[0].payload
                      // Reconstruct date from ISO string or fallback to x (ms timestamp)
                      const date = point.date && typeof point.date === 'string' 
                        ? DateTime.fromISO(point.date) 
                        : DateTime.fromMillis(point.x)
                      
                      const cauldron = point.cauldron || 'Unknown'
                      const discrepancy = point.y
                      
                      return (
                        <div className="bg-white border border-gray-300 rounded p-3 shadow-lg text-black">
                          <p className="font-semibold mb-2 text-black">{cauldron}</p>
                          <p className="text-sm mb-1 text-black">
                            <span className="font-medium">Date:</span> {date.isValid ? date.toFormat('yyyy-MM-dd') : 'Invalid Date'}
                          </p>
                          <p className="text-sm text-black">
                            <span className="font-medium">Discrepancy:</span> {typeof discrepancy === 'number' ? discrepancy.toFixed(2) : 'N/A'}
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Legend />
                  {discrepancyChartData.map((series, index) => {
                    if (!series.data || series.data.length === 0) return null
                    const color = `hsl(${(index * 360) / Math.max(discrepancyChartData.length, 1)}, 70%, 50%)`
                    return (
                      <Scatter
                        key={series.cauldron}
                        name={series.cauldron}
                        data={series.data}
                        fill={color}
                      />
                    )
                  })}
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

