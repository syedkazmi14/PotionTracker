import { useParams, useNavigate } from 'react-router-dom'
import { useCauldron } from '@/hooks/useCauldrons'
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

export function CauldronDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: cauldron, isLoading: cauldronLoading } = useCauldron(id || '')
  const { data: chartData = [], isLoading: dataLoading } = useCauldronData(id || '', 48)
  const { data: anomalies = [] } = useAnomalies(id)
  const { data: tickets = [] } = useTickets(id)

  if (cauldronLoading) {
    return <div className="text-center py-12">Loading cauldron details...</div>
  }

  if (!cauldron) {
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
  }[cauldron.status]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{cauldron.name}</h2>
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
              {cauldron.status}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Current Level</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cauldron.level}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Potions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cauldron.potions || 0}</div>
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
              <Tooltip />
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
              Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets for this cauldron</p>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-sm">{ticket.title}</h4>
                      <Badge variant="outline">{ticket.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{ticket.description}</p>
                    <p className="text-xs text-muted-foreground">
                      Created: {DateTime.fromISO(ticket.createdAt).toLocaleString(DateTime.DATETIME_SHORT)}
                    </p>
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

