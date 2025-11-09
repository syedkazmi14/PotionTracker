import { useCauldrons } from '@/hooks/useCauldrons'
import { useAnomalies } from '@/hooks/useAnomalies'
import { Card } from '@/components/Card'
import { ChartContainer } from '@/components/ChartContainer'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Activity, AlertTriangle, FlaskConical } from 'lucide-react'
import { DateTime } from 'luxon'
import { useCauldronData } from '@/hooks/useCauldronData'

export function DashboardPage() {
  const { data: cauldrons = [], isLoading } = useCauldrons()
  const { data: anomalies = [] } = useAnomalies()

  // Calculate KPIs
  const cauldronsOnline = cauldrons.filter(c => c.status === 'online').length
  const totalAnomalies = anomalies.filter(a => !a.resolved).length
  const totalPotions = cauldrons.reduce((sum, c) => sum + (c.potions || 0), 0)

  // Get data for first cauldron for demo chart
  const firstCauldron = cauldrons[0]
  const { data: chartData = [] } = useCauldronData(firstCauldron?.id || '', 24)

  // Transform data for charts
  const levelChartData = chartData.map(point => ({
    time: DateTime.fromISO(point.time).toLocaleString(DateTime.TIME_SIMPLE),
    level: point.level,
  }))

  const statusData = [
    { name: 'Online', value: cauldrons.filter(c => c.status === 'online').length },
    { name: 'Warning', value: cauldrons.filter(c => c.status === 'warning').length },
    { name: 'Error', value: cauldrons.filter(c => c.status === 'error').length },
    { name: 'Offline', value: cauldrons.filter(c => c.status === 'offline').length },
  ]

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
            <LineChart data={levelChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="level" stroke="#683cfc" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Cauldron Fill Level">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#683cfc" />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </div>
  )
}

