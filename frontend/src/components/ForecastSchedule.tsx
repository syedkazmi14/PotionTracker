import { useState, useMemo } from 'react'
import { useForecast } from '@/hooks/useForecast'
import { useSchedule } from '@/hooks/useSchedule'
import { useCauldrons } from '@/hooks/useCauldrons'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { MapView } from '@/components/MapView'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Forecast, DailySchedule, CauldronInfo, Market, Network } from '@/types'
import { DateTime } from 'luxon'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { AlertTriangle, Clock, Users, MapPin } from 'lucide-react'

export function ForecastSchedule() {
  const { data: forecasts = [], isLoading: forecastsLoading } = useForecast()
  const { data: schedule, isLoading: scheduleLoading } = useSchedule()
  const { data: cauldrons = [] } = useCauldrons()
  
  const { data: cauldronsInfo = [] } = useQuery<CauldronInfo[]>({
    queryKey: ['cauldronsInfo'],
    queryFn: () => api.getCauldronsInfo(),
  })
  
  const { data: market } = useQuery<Market>({
    queryKey: ['market'],
    queryFn: () => api.getMarket(),
  })
  
  const { data: network } = useQuery<Network>({
    queryKey: ['network'],
    queryFn: () => api.getNetwork(),
  })

  const [selectedCauldron, setSelectedCauldron] = useState<string | null>(null)
  const [simulate24h, setSimulate24h] = useState(false)

  // Get cauldrons at risk (within 12 hours)
  const atRiskCauldrons = useMemo(() => {
    return forecasts.filter(f => f.at_risk_12h)
  }, [forecasts])

  // Prepare forecast chart data
  const forecastChartData = useMemo(() => {
    if (!forecasts.length) return []
    
    const selected = selectedCauldron 
      ? forecasts.find(f => f.cauldron_id === selectedCauldron)
      : forecasts[0]
    
    if (!selected) return []
    
    return selected.forecast_points.map(point => ({
      time: DateTime.fromISO(point.timestamp).toFormat('HH:mm'),
      level: point.level,
      percentage: point.percentage,
    }))
  }, [forecasts, selectedCauldron])

  // Prepare courier requirements data
  const courierData = useMemo(() => {
    if (!schedule) return []
    
    // Group by date (for future dates if we have them)
    return [{
      date: schedule.date,
      couriers: schedule.couriers_needed,
    }]
  }, [schedule])

  // Prepare route visualization data
  const routeMarkers = useMemo(() => {
    const markers: Array<{
      id: string
      latitude: number
      longitude: number
      status: string
      name: string
      level: number
    }> = []

    // Add market marker
    if (market) {
      markers.push({
        id: 'market',
        latitude: market.latitude,
        longitude: market.longitude,
        status: 'market',
        name: market.name,
        level: 0,
      })
    }

    // Add cauldron markers
    cauldronsInfo.forEach(cauldron => {
      const forecast = forecasts.find(f => f.cauldron_id === cauldron.id)
      const isAtRisk = forecast?.at_risk_12h || false
      
      markers.push({
        id: cauldron.id,
        latitude: cauldron.latitude,
        longitude: cauldron.longitude,
        status: isAtRisk ? 'error' : 'online',
        name: cauldron.name,
        level: forecast?.current_percentage || 0,
      })
    })

    return markers
  }, [market, cauldronsInfo, forecasts])

  // Prepare route polylines from schedule
  const routeLines = useMemo(() => {
    if (!schedule || !schedule.assignments.length || !cauldronsInfo.length || !market) return []

    const routes: Array<Array<{ latitude: number; longitude: number }>> = []

    schedule.assignments.forEach(assignment => {
      const routePoints: Array<{ latitude: number; longitude: number }> = []
      
      assignment.route.forEach(nodeId => {
        if (nodeId === 'market' && market) {
          routePoints.push({
            latitude: market.latitude,
            longitude: market.longitude,
          })
        } else {
          const cauldron = cauldronsInfo.find(c => c.id === nodeId)
          if (cauldron) {
            routePoints.push({
              latitude: cauldron.latitude,
              longitude: cauldron.longitude,
            })
          }
        }
      })
      
      if (routePoints.length > 1) {
        routes.push(routePoints)
      }
    })

    return routes
  }, [schedule, cauldronsInfo, market])

  if (forecastsLoading || scheduleLoading) {
    return <div className="text-center py-12 text-gray-900">Loading forecast and schedule data...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header with risk alert */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            Forecast & Schedule
          </h2>
          <Button
            onClick={() => setSimulate24h(!simulate24h)}
            variant={simulate24h ? "default" : "outline"}
          >
            {simulate24h ? 'Hide' : 'Simulate'} Next 24h
          </Button>
        </div>
        
        {atRiskCauldrons.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Cauldrons at Risk</h3>
              <p className="text-sm text-red-700">
                {atRiskCauldrons.length} cauldron{atRiskCauldrons.length !== 1 ? 's' : ''} at risk of overflow within the next 12 hours
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {atRiskCauldrons.map(f => {
                  const cauldron = cauldronsInfo.find(c => c.id === f.cauldron_id)
                  return (
                    <Badge key={f.cauldron_id} variant="destructive">
                      {cauldron?.name || f.cauldron_id}: {f.current_percentage.toFixed(1)}%
                    </Badge>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white text-gray-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Couriers Needed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{schedule?.couriers_needed || 0}</div>
                <p className="text-xs text-gray-500">Active assignments</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white text-gray-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">At Risk Cauldrons</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{atRiskCauldrons.length}</div>
                <p className="text-xs text-gray-500">Within 12 hours</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white text-gray-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Forecasts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-3xl font-bold text-gray-900">{forecasts.length}</div>
                <p className="text-xs text-gray-500">Cauldrons monitored</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Forecast Chart */}
        <Card className="bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900">Brew Level Forecast</CardTitle>
            <div className="mt-2">
              <select
                value={selectedCauldron || ''}
                onChange={(e) => setSelectedCauldron(e.target.value || null)}
                className="text-sm border rounded px-2 py-1 text-gray-900 bg-white"
              >
                <option value="">All Cauldrons (First)</option>
                {forecasts.map(f => {
                  const cauldron = cauldronsInfo.find(c => c.id === f.cauldron_id)
                  return (
                    <option key={f.cauldron_id} value={f.cauldron_id}>
                      {cauldron?.name || f.cauldron_id}
                    </option>
                  )
                })}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {forecastChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={forecastChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="level" 
                    stroke="#10b981" 
                    name="Level (Liters)"
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="percentage" 
                    stroke="#3b82f6" 
                    name="Percentage (%)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-500">No forecast data available</div>
            )}
          </CardContent>
        </Card>

        {/* Courier Requirements Chart */}
        <Card className="bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900">Daily Courier Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            {courierData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={courierData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="couriers" fill="#10b981" name="Couriers Needed" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-500">No schedule data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Schedule Assignments */}
      {schedule && schedule.assignments.length > 0 && (
        <Card className="bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900">Today's Courier Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {schedule.assignments.map((assignment, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{assignment.courier}</h3>
                      <p className="text-sm text-gray-600">
                        {assignment.start} - {assignment.end} ({assignment.total_time_minutes} min)
                      </p>
                    </div>
                    <Badge variant="outline" className="text-gray-900">
                      {assignment.volume_collected.toFixed(1)} L
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700 mb-1">Route:</p>
                    <div className="flex flex-wrap gap-2">
                      {assignment.route.map((node, i) => (
                        <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-900">
                          {i + 1}. {node}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700 mb-1">Cauldrons:</p>
                    <div className="flex flex-wrap gap-2">
                      {assignment.cauldrons_visited.map(cauldronId => {
                        const cauldron = cauldronsInfo.find(c => c.id === cauldronId)
                        return (
                          <Badge key={cauldronId} variant="secondary" className="text-gray-900">
                            {cauldron?.name || cauldronId}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Route Visualization */}
      <Card className="bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-gray-900">Route Visualization</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <MapView
            markers={routeMarkers}
            route={routeLines[0]} // Show first route, could be enhanced to show all
            className="h-[500px]"
          />
        </CardContent>
      </Card>

      {/* Forecast Details Table */}
      <Card className="bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-gray-900">Forecast Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 text-gray-900">Cauldron</th>
                  <th className="text-left p-2 text-gray-900">Current Level</th>
                  <th className="text-left p-2 text-gray-900">Brew Rate (L/h)</th>
                  <th className="text-left p-2 text-gray-900">Time to 90%</th>
                  <th className="text-left p-2 text-gray-900">Time to 100%</th>
                  <th className="text-left p-2 text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {forecasts.map(forecast => {
                  const cauldron = cauldronsInfo.find(c => c.id === forecast.cauldron_id)
                  return (
                    <tr key={forecast.cauldron_id} className="border-b">
                      <td className="p-2 font-medium text-gray-900">
                        {cauldron?.name || forecast.cauldron_id}
                      </td>
                      <td className="p-2 text-gray-900">
                        {forecast.current_level.toFixed(1)} L ({forecast.current_percentage.toFixed(1)}%)
                      </td>
                      <td className="p-2 text-gray-900">{forecast.brew_rate_liters_per_hour.toFixed(2)}</td>
                      <td className="p-2 text-gray-900">
                        {forecast.time_to_90_percent 
                          ? DateTime.fromISO(forecast.time_to_90_percent).toFormat('MMM dd, HH:mm')
                          : 'N/A'}
                      </td>
                      <td className="p-2 text-gray-900">
                        {forecast.time_to_100_percent 
                          ? DateTime.fromISO(forecast.time_to_100_percent).toFormat('MMM dd, HH:mm')
                          : 'N/A'}
                      </td>
                      <td className="p-2">
                        {forecast.at_risk_12h ? (
                          <Badge variant="destructive">At Risk</Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-900">Safe</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

