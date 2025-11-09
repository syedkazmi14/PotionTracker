import { useCauldrons } from '@/hooks/useCauldrons'
import { useAnomalies } from '@/hooks/useAnomalies'
import { Card } from '@/components/Card'
import { ChartContainer } from '@/components/ChartContainer'
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line, Cell } from 'recharts'
import { Activity, AlertTriangle, FlaskConical } from 'lucide-react'
import { DateTime } from 'luxon'
import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useMemo } from 'react'

export function DashboardPage() {
  const { data: cauldrons = [], isLoading } = useCauldrons()
  const { data: anomalies = [] } = useAnomalies()

  // Calculate KPIs
  const cauldronsOnline = cauldrons.filter(c => c.status === 'online').length
  const totalAnomalies = anomalies.filter(a => !a.resolved).length
  const totalPotions = cauldrons.reduce((sum, c) => sum + (c.potions || 0), 0)

  // Get first 12 cauldrons
  const cauldronsToTrack = cauldrons.slice(0, 12)

  // Fetch data for all cauldrons
  const cauldronDataQueries = useQueries({
    queries: cauldronsToTrack.map(cauldron => ({
      queryKey: ['cauldron-data', cauldron.id, 24],
      queryFn: () => api.getCauldronData(cauldron.id, 24),
      enabled: !!cauldron.id,
    })),
  })

  // Transform data for line chart (12 cauldrons over 24h)
  const lineChartData = useMemo(() => {
    if (cauldronDataQueries.some(q => q.isLoading) || cauldronsToTrack.length === 0) {
      return []
    }

    // Get all unique time points
    const allTimes = new Set<string>()
    cauldronDataQueries.forEach(query => {
      const data = query.data || []
      data.forEach(point => {
        const time = DateTime.fromISO(point.time)
        const hourKey = time.toFormat('yyyy-MM-dd HH:00')
        allTimes.add(hourKey)
      })
    })

    // Create chart data with one entry per time point
    const sortedTimes = Array.from(allTimes).sort((a, b) => {
      return DateTime.fromFormat(a, 'yyyy-MM-dd HH:mm').toMillis() - DateTime.fromFormat(b, 'yyyy-MM-dd HH:mm').toMillis()
    })

    return sortedTimes.map(timeKey => {
      const timeObj = DateTime.fromFormat(timeKey, 'yyyy-MM-dd HH:mm')
      const dataPoint: Record<string, any> = {
        time: timeObj.toFormat('HH:mm'),
        timeSort: timeObj.toMillis(),
      }

      // Add level for each cauldron (numbered 1-12)
      cauldronsToTrack.forEach((_, index) => {
        const queryData = cauldronDataQueries[index].data || []
        // Find the closest data point to this time
        const closestPoint = queryData.find(point => {
          const pointTime = DateTime.fromISO(point.time)
          const pointHourKey = pointTime.toFormat('yyyy-MM-dd HH:00')
          return pointHourKey === timeKey
        })
        
        if (closestPoint) {
          dataPoint[`Cauldron ${index + 1}`] = closestPoint.level
        } else {
          dataPoint[`Cauldron ${index + 1}`] = null
        }
      })

      return dataPoint
    }).sort((a, b) => a.timeSort - b.timeSort)
      .map(({ timeSort, ...rest }) => rest)
  }, [cauldronDataQueries, cauldronsToTrack])

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
        <Card
          title="Cauldrons Online"
          value={cauldronsOnline}
          icon={<Activity className="h-4 w-4" />}
        />
        <Card
          title="Active Anomalies"
          value={totalAnomalies}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <Card
          title="Total Potions (Liters)"
          value={totalPotions}
          icon={<FlaskConical className="h-4 w-4" />}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartContainer title="Cauldron Level Trend (24h)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
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
        </ChartContainer>

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
    </div>
  )
}

