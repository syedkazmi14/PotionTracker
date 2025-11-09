import { useParams, useNavigate } from 'react-router-dom'
import { useLiveData } from '@/hooks/useLiveData'
import { useCauldronData } from '@/hooks/useCauldronData'
import { useAnomalies } from '@/hooks/useAnomalies'
import { useTickets } from '@/hooks/useTickets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer } from '@/components/ChartContainer'
import { AnomalyTable } from '@/components/AnomalyTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle, Ticket } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DateTime } from 'luxon'
import { useMemo } from 'react'

export function CauldronDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: liveData, isLoading: liveDataLoading } = useLiveData()
  
  // Find the cauldron from live data
  const cauldron = useMemo(() => {
    if (!id || !liveData.cauldrons.length) return null
    return liveData.cauldrons.find(c => c.id === id) || null
  }, [id, liveData.cauldrons])
  
  // Convert LiveCauldron to Cauldron format for compatibility
  const cauldronForDisplay = useMemo(() => {
    if (!cauldron) return null
    return {
      id: cauldron.id,
      name: cauldron.name,
      level: cauldron.fillPercent, // Use fillPercent as level
      status: cauldron.status,
      latitude: cauldron.latitude,
      longitude: cauldron.longitude,
      lastUpdate: cauldron.lastUpdated || DateTime.now().toISO(),
      potions: 0, // Not available in live data
    }
  }, [cauldron])
  
  const { data: chartData = [], isLoading: dataLoading } = useCauldronData(id || '', 48)
  const { data: anomalies = [] } = useAnomalies(id)
  const { data: tickets = [] } = useTickets(id)

  if (liveDataLoading) {
    return <div className="text-center py-12">Loading cauldron details...</div>
  }

  if (!cauldron || !cauldronForDisplay) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cauldron not found</p>
        <Button onClick={() => navigate('/dashboard')} className="mt-4">
          Back to Dashboard
        </Button>
      </div>
    )
  }

  const chartDataFormatted = chartData.map(point => ({
    time: DateTime.fromISO(point.time).toLocaleString(DateTime.DATETIME_SHORT),
    level: point.level,
  }))

  const statusColor = {
    online: 'bg-green-500/20 text-green-400 border-green-500/50',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    error: 'bg-red-500/20 text-red-400 border-red-500/50',
    offline: 'bg-gray-500/20 text-gray-400 border-gray-500/50',
  }[cauldronForDisplay.status] || 'bg-gray-500/20 text-gray-400 border-gray-500/50'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{cauldronForDisplay.name}</h2>
          <p className="text-muted-foreground">Detailed cauldron information</p>
        </div>
      </div>

      {/* Status and Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className={statusColor}>
              {cauldronForDisplay.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Fill Percentage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cauldron.fillPercent.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {cauldron.currentLevel.toFixed(1)}L / {cauldron.max_volume}L
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Last Updated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {cauldron.lastUpdated 
                ? DateTime.fromISO(cauldron.lastUpdated).toLocaleString(DateTime.DATETIME_SHORT)
                : 'Never'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Level History Chart */}
      <ChartContainer title="Level History (48h)">
        {dataLoading ? (
          <div className="flex items-center justify-center h-full">Loading chart data...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataFormatted}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip 
                contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc', color: '#000' }}
                labelStyle={{ color: '#000' }}
              />
              <Line type="monotone" dataKey="level" stroke="#683cfc" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartContainer>

      {/* Anomalies and Tickets */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Anomalies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AnomalyTable anomalies={anomalies} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Transport Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transport tickets for this cauldron</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.ticket_id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">Ticket #{ticket.ticket_id}</h4>
                      <Badge variant="outline" className="bg-blue-500/20 text-blue-700 border-blue-500/50">
                        {ticket.amount_collected.toFixed(1)}L
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>
                        <span className="font-medium">Courier:</span> {ticket.courier_id}
                      </p>
                      <p>
                        <span className="font-medium">Amount Collected:</span> {ticket.amount_collected.toFixed(2)} liters
                      </p>
                      <p className="text-xs">
                        <span className="font-medium">Date:</span> {DateTime.fromISO(ticket.date).toLocaleString(DateTime.DATETIME_SHORT)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

