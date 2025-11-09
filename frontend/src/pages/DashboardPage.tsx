import { useCauldrons } from '@/hooks/useCauldrons'
import { useAnomalies } from '@/hooks/useAnomalies'
import { useDiscrepancyData } from '@/hooks/useDiscrepancyData'
import { Card as KPICard } from '@/components/Card'
import { Card, CardContent } from '@/components/ui/card'
import { ChartContainer } from '@/components/ChartContainer'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, Cell } from 'recharts'
import { Activity, AlertTriangle, FlaskConical } from 'lucide-react'
import { DateTime } from 'luxon'
import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

type TimeRange = '24h' | 'week' | 'month'

export function DashboardPage() {
  const { data: cauldrons = [], isLoading } = useCauldrons()
  const { data: anomalies = [] } = useAnomalies()
  const { data: discrepancyData = {}, isLoading: discrepancyLoading } = useDiscrepancyData()
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')

  // Calculate KPIs
  const cauldronsOnline = cauldrons.filter(c => c.status === 'online').length
  const totalAnomalies = anomalies.filter(a => !a.resolved).length
  const totalPotions = cauldrons.reduce((sum, c) => sum + (c.potions || 0), 0)

  // Get first 12 cauldrons
  const cauldronsToTrack = cauldrons.slice(0, 12)

  // Calculate hours based on time range
  const hoursForRange = useMemo(() => {
    switch (timeRange) {
      case '24h':
        return 24
      case 'week':
        return 24 * 7
      case 'month':
        return 24 * 30
      default:
        return 24
    }
  }, [timeRange])

  // Fetch data for all cauldrons
  const cauldronDataQueries = useQueries({
    queries: cauldronsToTrack.map(cauldron => ({
      queryKey: ['cauldron-data', cauldron.id, hoursForRange],
      queryFn: () => api.getCauldronData(cauldron.id, hoursForRange),
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

    // Create chart data with one entry per time point
    const sortedTimes = Array.from(allTimes).sort((a, b) => {
      return DateTime.fromFormat(a, 'yyyy-MM-dd HH:mm').toMillis() - DateTime.fromFormat(b, 'yyyy-MM-dd HH:mm').toMillis()
    })

    // Format time based on range
    const formatTime = (timeObj: DateTime) => {
      if (timeRange === '24h') {
        return timeObj.toFormat('HH:mm')
      } else if (timeRange === 'week') {
        return timeObj.toFormat('MMM dd HH:mm')
      } else {
        return timeObj.toFormat('MMM dd')
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
  }, [cauldronDataQueries, cauldronsToTrack, timeRange])

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

  // Transform discrepancy data for chart
  const discrepancyChartData = useMemo(() => {
    if (discrepancyLoading || Object.keys(discrepancyData).length === 0) {
      return []
    }

    // Get all unique dates
    const allDates = new Set<string>()
    Object.values(discrepancyData).forEach(points => {
      points.forEach(point => {
        allDates.add(point.date)
      })
    })

    // Sort dates
    const sortedDates = Array.from(allDates).sort((a, b) => {
      return DateTime.fromISO(a).toMillis() - DateTime.fromISO(b).toMillis()
    })

    // Create chart data with one entry per date
    return sortedDates.map(date => {
      const dataPoint: Record<string, any> = {
        date: DateTime.fromISO(date).toFormat('MMM dd'),
        dateSort: DateTime.fromISO(date).toMillis(),
      }

      // Add discrepancy for each cauldron
      Object.entries(discrepancyData).forEach(([cauldronId, points]) => {
        const point = points.find(p => p.date === date)
        if (point) {
          // Format cauldron ID for display (e.g., "cauldron_001" -> "Cauldron 1")
          const cauldronNumber = cauldronId.replace('cauldron_', '').replace(/^0+/, '')
          dataPoint[`Cauldron ${cauldronNumber}`] = point.descrepency
        } else {
          const cauldronNumber = cauldronId.replace('cauldron_', '').replace(/^0+/, '')
          dataPoint[`Cauldron ${cauldronNumber}`] = null
        }
      })

      return dataPoint
    }).sort((a, b) => a.dateSort - b.dateSort)
      .map(({ dateSort, ...rest }) => rest)
  }, [discrepancyData, discrepancyLoading])

  // Get cauldron IDs for legend colors
  const cauldronIds = useMemo(() => {
    return Object.keys(discrepancyData).sort().map(id => {
      const number = id.replace('cauldron_', '').replace(/^0+/, '')
      return { id, displayName: `Cauldron ${number}` }
    })
  }, [discrepancyData])

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
          title="Active Anomalies"
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Cauldron Level Trend ({timeRange === '24h' ? '24h' : timeRange === 'week' ? '7 days' : '30 days'})
              </h3>
              <div className="flex gap-2">
                <Button
                  variant={timeRange === '24h' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('24h')}
                >
                  24h
                </Button>
                <Button
                  variant={timeRange === 'week' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('week')}
                >
                  Week
                </Button>
                <Button
                  variant={timeRange === 'month' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeRange('month')}
                >
                  Month
                </Button>
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
              <Tooltip />
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
      <ChartContainer title="Discrepancy Over Time">
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={discrepancyChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              label={{ value: 'Date', position: 'insideBottom', offset: -5 }}
            />
            <YAxis 
              label={{ value: 'Discrepancy', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', color: '#000' }} />
            <Legend />
            {cauldronIds.map(({ id, displayName }, index) => (
              <Line
                key={id}
                type="monotone"
                dataKey={displayName}
                stroke={`hsl(${(index * 360) / cauldronIds.length}, 70%, 50%)`}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}

