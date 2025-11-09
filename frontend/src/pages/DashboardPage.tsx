import { useCauldrons } from '@/hooks/useCauldrons'
import { useDiscrepancyData } from '@/hooks/useDiscrepancyData'
import { Card as KPICard } from '@/components/Card'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer } from '@/components/ChartContainer'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, Cell, ScatterChart, Scatter } from 'recharts'
import { Activity, AlertTriangle, FlaskConical } from 'lucide-react'
import { DateTime } from 'luxon'
import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

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

  // Fetch data for all cauldrons
  const cauldronDataQueries = useQueries({
    queries: cauldronsToTrack.map(cauldron => ({
      queryKey: ['cauldron-data', cauldron.id, hoursForRange, timeRange, timeRange === 'custom' ? `${startDate.toISODate()}-${endDate.toISODate()}` : ''],
      queryFn: () => {
        // For custom range, we need to filter the data by date range
        // For now, we'll use hoursForRange which should work for most cases
        return api.getCauldronData(cauldron.id, hoursForRange)
      },
      enabled: !!cauldron.id,
    })),
  })

  // Transform data for line chart (12 cauldrons with time range)
  const lineChartData = useMemo(() => {
    if (cauldronDataQueries.some(q => q.isLoading) || cauldronsToTrack.length === 0) {
      return []
    }

    // Get all unique time points (to the minute)
    const allTimes = new Set<string>()
    cauldronDataQueries.forEach(query => {
      const data = query.data || []
      data.forEach(point => {
        const time = DateTime.fromISO(point.time)
        const minuteKey = time.toFormat('yyyy-MM-dd HH:mm')
        allTimes.add(minuteKey)
      })
    })

    // Filter times based on selected range
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
    // For 'past24h', use all times (already filtered by API hours)

    // Create chart data with one entry per time point
    const sortedTimes = filteredTimes.sort((a, b) => {
      return DateTime.fromFormat(a, 'yyyy-MM-dd HH:mm').toMillis() - DateTime.fromFormat(b, 'yyyy-MM-dd HH:mm').toMillis()
    })

    // Format time based on range
    const formatTime = (timeObj: DateTime) => {
      if (timeRange === 'past24h' || timeRange === 'today') {
        return timeObj.toFormat('HH:mm')
      } else if (timeRange === 'yesterday') {
        return timeObj.toFormat('HH:mm')
      } else {
        // custom range
        return timeObj.toFormat('MMM dd HH:mm')
      }
    }

    return sortedTimes.map(timeKey => {
      const timeObj = DateTime.fromFormat(timeKey, 'yyyy-MM-dd HH:mm')
      const dataPoint: Record<string, any> = {
        time: formatTime(timeObj),
        timeSort: timeObj.toMillis(),
      }

      // Add level for each cauldron (numbered 1-12)
      cauldronsToTrack.forEach((_, index) => {
        const queryData = cauldronDataQueries[index].data || []
        // Find the closest data point to this time
        const closestPoint = queryData.find(point => {
          const pointTime = DateTime.fromISO(point.time)
          const pointMinuteKey = pointTime.toFormat('yyyy-MM-dd HH:mm')
          return pointMinuteKey === timeKey
        })
        
        if (closestPoint) {
          // Round to nearest hundredth
          dataPoint[`Cauldron ${index + 1}`] = Math.round(closestPoint.level * 100) / 100
        } else {
          dataPoint[`Cauldron ${index + 1}`] = null
        }
      })

      return dataPoint
    }).sort((a, b) => a.timeSort - b.timeSort)
      .map(({ timeSort, ...rest }) => rest)
  }, [cauldronDataQueries, cauldronsToTrack, timeRange, startDate, endDate])

  // Transform data for bar chart (current counts by category)
  const barChartData = useMemo(() => {
    if (isLoading || cauldronsToTrack.length === 0) {
      return []
    }

    // Count cauldrons by fill level category
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
  }, [cauldronsToTrack, isLoading])

  // Transform discrepancy data for scatter chart
  const discrepancyChartData = useMemo(() => {
    if (discrepancyLoading || Object.keys(discrepancyData).length === 0) {
      return []
    }

    // Collect all points with their cauldron info and apply threshold filter
    const allPoints: Array<{ date: DateTime; discrepancy: number; cauldron: string }> = []
    
    Object.entries(discrepancyData).forEach(([cauldronId, points]) => {
      const cauldronNumber = cauldronId.replace('cauldron_', '').replace(/^0+/, '')
      const displayName = `Cauldron ${cauldronNumber}`
      
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
    const cauldronSeries = new Map<string, Array<{ x: number; y: number }>>()
    
    allPoints.forEach(point => {
      if (!cauldronSeries.has(point.cauldron)) {
        cauldronSeries.set(point.cauldron, [])
      }
      cauldronSeries.get(point.cauldron)!.push({
        x: point.date.toMillis(),
        y: point.discrepancy,
      })
    })

    return Array.from(cauldronSeries.entries()).map(([cauldron, data]) => ({
      cauldron,
      data: data.sort((a, b) => a.x - b.x).map(point => ({
        x: point.x,
        y: point.y,
        cauldron, // Include cauldron name in each point for tooltip
      })),
    }))
  }, [discrepancyData, discrepancyLoading, threshold])

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
                      className="px-2 py-1 text-sm border rounded"
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
                      className="px-2 py-1 text-sm border rounded"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <CardContent className="p-6 pt-0">
            <div className="w-full h-[300px] sm:h-[400px]">
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
                      return typeof value === 'number' ? value.toFixed(2) : value
                    }}
                  />
                  <Legend />
                  {cauldronsToTrack.map((_, index) => (
                    <Line
                      key={index}
                      type="monotone"
                      dataKey={`Cauldron ${index + 1}`}
                      stroke={`hsl(${(index * 360) / 12}, 70%, 50%)`}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <ChartContainer title="Cauldron Fill Level">
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
                    label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
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
                    labelFormatter={(_value, payload) => {
                      if (!payload || !payload[0] || !payload[0].payload) return ''
                      const date = DateTime.fromMillis(payload[0].payload.x)
                      const cauldron = payload[0].payload.cauldron || 'Unknown'
                      return `${cauldron} - ${date.isValid ? date.toFormat('MMM dd, yyyy') : 'Invalid Date'}`
                    }}
                    formatter={(value: number, _name: string) => {
                      return [value?.toFixed(2) || 'N/A', 'Discrepancy']
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

