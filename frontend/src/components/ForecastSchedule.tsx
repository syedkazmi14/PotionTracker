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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts'
import { AlertTriangle, Clock, Users, MapPin } from 'lucide-react'

export function ForecastSchedule() {
  const { data: forecasts = [], isLoading: forecastsLoading } = useForecast()
  const [selectedCauldron, setSelectedCauldron] = useState<string | null>(null)
  const [simulate24h, setSimulate24h] = useState(false)
  
  // Calculate date for schedule - today or tomorrow (24h from now)
  const scheduleDate = useMemo(() => {
    if (simulate24h) {
      const tomorrow = DateTime.now().plus({ days: 1 })
      return tomorrow.toFormat('yyyy-MM-dd')
    }
    return undefined // undefined means today
  }, [simulate24h])
  
  const { data: schedule, isLoading: scheduleLoading } = useSchedule(scheduleDate)
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

  // Get cauldrons at risk (at or above 80%)
  const atRiskCauldrons = useMemo(() => {
    return forecasts.filter(f => f.current_percentage >= 80)
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

  // Prepare courier requirements data with future dates
  const courierData = useMemo(() => {
    const data: Array<{ date: string; couriers: number; distance?: number }> = []
    
    // Add today's schedule
    if (schedule) {
      data.push({
        date: schedule.date,
        couriers: schedule.couriers_needed,
        distance: schedule.total_distance_km,
      })
    }
    
    // Calculate future dates (next 7 days) based on forecasts
    if (forecasts.length > 0 && cauldronsInfo.length > 0) {
      const today = DateTime.now()
      
      for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
        const futureDate = today.plus({ days: dayOffset })
        const dateStr = futureDate.toFormat('yyyy-MM-dd')
        
        // Calculate how many cauldrons will need pickups on this date
        // A cauldron needs a pickup if it is at/above 80% OR will reach 80% on or before this date
        const cauldronsNeedingPickup: string[] = []
        
        forecasts.forEach(forecast => {
          const currentPercent = forecast.current_percentage
          const timeTo80 = forecast.time_to_80_percent
          
          // Already at or above 80%
          if (currentPercent >= 80) {
            if (!cauldronsNeedingPickup.includes(forecast.cauldron_id)) {
              cauldronsNeedingPickup.push(forecast.cauldron_id)
            }
            return
          }
          
          // Will reach 80% on or before this date
          if (timeTo80) {
            const thresholdTime = DateTime.fromISO(timeTo80)
            const futureDateEnd = futureDate.endOf('day')
            
            if (thresholdTime <= futureDateEnd) {
              if (!cauldronsNeedingPickup.includes(forecast.cauldron_id)) {
                cauldronsNeedingPickup.push(forecast.cauldron_id)
              }
            }
          }
        })
        
        // Estimate couriers needed based on number of cauldrons needing pickups
        // Each courier has 100L capacity, estimate volume per cauldron
        let couriersNeeded = 0
        if (cauldronsNeedingPickup.length > 0) {
          // Rough estimate: assume each cauldron needs ~80L collected (80% of typical 100L max)
          // With 100L capacity per courier, estimate: total_volume / 100
          const estimatedVolumePerCauldron = 80 // Rough estimate
          const totalVolume = cauldronsNeedingPickup.length * estimatedVolumePerCauldron
          couriersNeeded = Math.max(1, Math.ceil(totalVolume / 100))
        }
        
        data.push({
          date: dateStr,
          couriers: couriersNeeded,
        })
      }
    }
    
    return data
  }, [schedule, forecasts, cauldronsInfo])

  // Prepare route visualization data
  const routeMarkers = useMemo(() => {
    const markers: Array<{
      id: string
      latitude: number
      longitude: number
      status: string
      name: string
      level: number
      fillPercent?: number
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
        fillPercent: 0,
      })
    }

    // Add cauldron markers with color coding based on fill percentage
    cauldronsInfo.forEach(cauldron => {
      const forecast = forecasts.find(f => f.cauldron_id === cauldron.id)
      const fillPercent = forecast?.current_percentage || 0
      const isAtRisk = forecast?.at_risk_12h || false
      
      // Determine status based on fill percentage
      let status = 'online'
      if (fillPercent >= 80) {
        status = 'error'
      } else if (fillPercent >= 30) {
        status = 'warning'
      }
      
      markers.push({
        id: cauldron.id,
        latitude: cauldron.latitude,
        longitude: cauldron.longitude,
        status: status,
        name: cauldron.name,
        level: forecast?.current_level || 0,
        fillPercent: fillPercent,
      })
    })

    return markers
  }, [market, cauldronsInfo, forecasts])

  // Prepare route polylines from schedule
  const routeLines = useMemo(() => {
    if (!schedule || !schedule.assignments.length || !cauldronsInfo.length || !market) {
      console.log('[ForecastSchedule] Missing data for routes:', {
        hasSchedule: !!schedule,
        assignmentsCount: schedule?.assignments?.length || 0,
        cauldronsInfoCount: cauldronsInfo.length,
        hasMarket: !!market
      })
      return []
    }

    const routes: Array<Array<{ latitude: number; longitude: number }>> = []

    schedule.assignments.forEach((assignment, idx) => {
      const routePoints: Array<{ latitude: number; longitude: number }> = []
      
      console.log(`[ForecastSchedule] Processing assignment ${idx} for ${assignment.courier}:`, {
        route: assignment.route,
        routeLength: assignment.route?.length || 0,
        cauldrons_visited: assignment.cauldrons_visited,
        allCauldronIds: cauldronsInfo.map(c => c.id)
      })
      
      // Build route from assignment.route, but fallback to cauldrons_visited if route is incomplete
      const routeNodes = assignment.route && assignment.route.length > 1 
        ? assignment.route 
        : (() => {
            // Fallback: build route from cauldrons_visited
            const fallbackRoute = ['market']
            if (assignment.cauldrons_visited && assignment.cauldrons_visited.length > 0) {
              fallbackRoute.push(...assignment.cauldrons_visited)
            }
            fallbackRoute.push('market')
            console.log(`[ForecastSchedule] Using fallback route for ${assignment.courier}:`, fallbackRoute)
            return fallbackRoute
          })()
      
      routeNodes.forEach((nodeId: string) => {
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
          } else {
            console.warn(`[ForecastSchedule] Cauldron not found for nodeId: ${nodeId}`, {
              nodeId,
              availableIds: cauldronsInfo.map(c => c.id).slice(0, 10)
            })
          }
        }
      })
      
      console.log(`[ForecastSchedule] Route points for ${assignment.courier}:`, routePoints)
      
      if (routePoints.length > 1) {
        routes.push(routePoints)
      } else {
        console.warn(`[ForecastSchedule] Route for ${assignment.courier} has insufficient points:`, routePoints)
      }
    })

    console.log('[ForecastSchedule] Final routes:', routes)
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
            {simulate24h ? 'Show Today' : 'Simulate Next 24h'}
          </Button>
        </div>
        
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
                <p className="text-xs text-gray-500">At or above 80%</p>
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
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => {
                      const date = DateTime.fromISO(value)
                      return date.toFormat('MMM dd')
                    }}
                  />
                  <YAxis />
                  <Tooltip 
                    labelFormatter={(value) => {
                      const date = DateTime.fromISO(value)
                      return date.toFormat('MMM dd, yyyy')
                    }}
                    formatter={(value: any, name: any, props: any) => {
                      const data = props.payload
                      if (data.distance !== undefined) {
                        return [`${value} couriers (${data.distance.toFixed(2)} km)`, 'Couriers & Distance']
                      }
                      return [`${value} couriers`, 'Couriers Needed']
                    }}
                  />
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900">Today's Courier Assignments</CardTitle>
              {schedule.total_distance_km !== undefined && (
                <div className="text-sm font-medium text-gray-700">
                  Total Distance: {schedule.total_distance_km.toFixed(2)} km
                </div>
              )}
            </div>
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
                      {assignment.distance_km !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          Distance: {assignment.distance_km.toFixed(2)} km
                        </p>
                      )}
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-gray-900">
              Route Visualization {simulate24h && '(Next 24h)'}
            </CardTitle>
            {schedule && schedule.total_distance_km !== undefined && (
              <div className="text-sm font-medium text-gray-700">
                Total Distance: {schedule.total_distance_km.toFixed(2)} km
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <MapView
            markers={routeMarkers}
            market={market || undefined}
            routes={routeLines}
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
                  <th className="text-left p-2 text-gray-900">Time to 80%</th>
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
                        {forecast.time_to_80_percent 
                          ? (() => {
                              try {
                                const timeTo80 = DateTime.fromISO(forecast.time_to_80_percent)
                                const now = DateTime.now()
                                // If time is in the past or very close to now (within 1 hour), it's already at 80%
                                if (timeTo80 <= now.plus({ hours: 1 })) {
                                  return 'Already at 80%'
                                }
                                return timeTo80.toFormat('MMM dd, HH:mm')
                              } catch (e) {
                                return 'Invalid date'
                              }
                            })()
                          : forecast.brew_rate_liters_per_hour > 0 
                            ? (forecast.current_percentage >= 80 ? 'Already at 80%' : 'N/A')
                            : 'N/A (No brew rate)'}
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

      {/* Visualizations Section */}
      <div className="space-y-6">
        {/* Brew Rate Visualization */}
        <Card className="bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900">Brew Rate Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {forecasts.length > 0 ? (
              (() => {
                const chartData = forecasts.map(f => {
                  const cauldron = cauldronsInfo.find(c => c.id === f.cauldron_id)
                  return {
                    name: cauldron?.name || f.cauldron_id,
                    brewRate: f.brew_rate_liters_per_hour,
                    currentPercent: f.current_percentage,
                  }
                }).sort((a, b) => b.brewRate - a.brewRate)
                
                return (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis label={{ value: 'Brew Rate (L/h)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        formatter={(value: any) => [`${value.toFixed(2)} L/h`, 'Brew Rate']}
                        labelStyle={{ color: '#000' }}
                      />
                      <Bar 
                        dataKey="brewRate" 
                        fill="#8b5cf6"
                        radius={[8, 8, 0, 0]}
                      >
                        {chartData.map((entry, index) => {
                          const percent = entry.currentPercent
                          let color = '#8b5cf6' // default purple
                          if (percent >= 80) color = '#ef4444' // red
                          else if (percent >= 30) color = '#f59e0b' // yellow
                          else color = '#10b981' // green
                          return <Cell key={`cell-${index}`} fill={color} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              })()
            ) : (
              <div className="text-center py-12 text-gray-500">No forecast data available</div>
            )}
          </CardContent>
        </Card>

        {/* Forecast Timeline Visualization */}
        <Card className="bg-white text-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900">Forecast Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {forecasts.length > 0 ? (
              <div className="space-y-4">
                {forecasts
                  .filter(f => f.time_to_80_percent || f.time_to_100_percent)
                  .sort((a, b) => {
                    const timeA = a.time_to_80_percent ? DateTime.fromISO(a.time_to_80_percent).toMillis() : Infinity
                    const timeB = b.time_to_80_percent ? DateTime.fromISO(b.time_to_80_percent).toMillis() : Infinity
                    return timeA - timeB
                  })
                  .map(forecast => {
                    const cauldron = cauldronsInfo.find(c => c.id === forecast.cauldron_id)
                    const now = DateTime.now()
                    const timeTo80 = forecast.time_to_80_percent ? DateTime.fromISO(forecast.time_to_80_percent) : null
                    const timeTo100 = forecast.time_to_100_percent ? DateTime.fromISO(forecast.time_to_100_percent) : null
                    
                    // Calculate hours from now
                    const hoursTo80 = timeTo80 ? Math.max(0, timeTo80.diff(now, 'hours').hours) : null
                    const hoursTo100 = timeTo100 ? Math.max(0, timeTo100.diff(now, 'hours').hours) : null
                    
                    return (
                      <div key={forecast.cauldron_id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900">
                            {cauldron?.name || forecast.cauldron_id}
                          </h3>
                          <Badge
                            variant="outline"
                            className={
                              forecast.current_percentage >= 80
                                ? 'bg-red-500/20 text-red-700 border-red-500/50'
                                : forecast.current_percentage >= 30
                                ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/50'
                                : 'bg-green-500/20 text-green-700 border-green-500/50'
                            }
                          >
                            {forecast.current_percentage.toFixed(1)}% Full
                          </Badge>
                        </div>
                        
                        {/* Timeline Bar */}
                        <div className="relative h-16 bg-gray-200 rounded-lg overflow-hidden">
                          {/* 80% Marker */}
                          {hoursTo80 !== null && hoursTo80 < 48 && (
                            <div
                              className="absolute top-0 bottom-0 bg-yellow-400 border-r-2 border-yellow-600 flex items-center justify-center"
                              style={{
                                left: `${Math.min(100, (hoursTo80 / 48) * 100)}%`,
                                width: '2px',
                              }}
                            >
                              <div className="absolute -top-6 text-xs font-medium text-yellow-700 whitespace-nowrap">
                                80%
                              </div>
                            </div>
                          )}
                          
                          {/* 100% Marker */}
                          {hoursTo100 !== null && hoursTo100 < 48 && (
                            <div
                              className="absolute top-0 bottom-0 bg-red-400 border-r-2 border-red-600 flex items-center justify-center"
                              style={{
                                left: `${Math.min(100, (hoursTo100 / 48) * 100)}%`,
                                width: '2px',
                              }}
                            >
                              <div className="absolute -top-6 text-xs font-medium text-red-700 whitespace-nowrap">
                                100%
                              </div>
                            </div>
                          )}
                          
                          {/* Current Position Indicator */}
                          <div className="absolute top-0 bottom-0 left-0 w-1 bg-blue-600 z-10"></div>
                          
                          {/* Time Labels */}
                          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-600 p-1">
                            <span>Now</span>
                            <span>+24h</span>
                            <span>+48h</span>
                          </div>
                        </div>
                        
                        {/* Info Text */}
                        <div className="mt-2 text-xs text-gray-600 space-y-1">
                          {hoursTo80 !== null && hoursTo80 < 48 && (
                            <p>
                              <span className="font-medium">80% in:</span> {hoursTo80.toFixed(1)} hours 
                              ({timeTo80?.toFormat('MMM dd, HH:mm')})
                            </p>
                          )}
                          {hoursTo100 !== null && hoursTo100 < 48 && (
                            <p>
                              <span className="font-medium">100% in:</span> {hoursTo100.toFixed(1)} hours 
                              ({timeTo100?.toFormat('MMM dd, HH:mm')})
                            </p>
                          )}
                          <p>
                            <span className="font-medium">Brew Rate:</span> {forecast.brew_rate_liters_per_hour.toFixed(2)} L/h
                          </p>
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">No forecast timeline data available</div>
            )}
          </CardContent>
        </Card>

      </div>

    </div>
  )
}

