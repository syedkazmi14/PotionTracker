import { useState, useMemo } from 'react'
import { useLiveData, LiveCauldron } from '@/hooks/useLiveData'
import { useForecast } from '@/hooks/useForecast'
import { MapView } from '@/components/MapView'
import { ForecastSchedule } from '@/components/ForecastSchedule'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wand2, MapPin, Plus, X, Route, BarChart3, AlertTriangle, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { DateTime } from 'luxon'

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Optimize route using nearest neighbor algorithm
function optimizeRoute(cauldrons: LiveCauldron[], market: { latitude: number; longitude: number } | null): LiveCauldron[] {
  if (cauldrons.length === 0) return []
  
  // Filter out offline cauldrons for route optimization
  const activeCauldrons = cauldrons.filter(c => c.status !== 'offline')
  if (activeCauldrons.length === 0) return cauldrons

  // Start from market if available, otherwise first cauldron
  const route: LiveCauldron[] = []
  const unvisited = [...activeCauldrons]
  
  let current: { latitude: number; longitude: number } | null = null
  if (market) {
    current = { latitude: market.latitude, longitude: market.longitude }
  } else if (unvisited.length > 0) {
    const first = unvisited.shift()!
    current = { latitude: first.latitude, longitude: first.longitude }
    route.push(first)
  }

  if (!current) return []

  // Build route using nearest neighbor
  while (unvisited.length > 0) {
    let nearest = unvisited[0]
    let minDistance = calculateDistance(
      current.latitude,
      current.longitude,
      nearest.latitude,
      nearest.longitude
    )

    for (const cauldron of unvisited) {
      const distance = calculateDistance(
        current.latitude,
        current.longitude,
        cauldron.latitude,
        cauldron.longitude
      )
      if (distance < minDistance) {
        minDistance = distance
        nearest = cauldron
      }
    }

    route.push(nearest)
    unvisited.splice(unvisited.indexOf(nearest), 1)
    current = { latitude: nearest.latitude, longitude: nearest.longitude }
  }

  return route
}

interface TicketFormData {
  title: string
  description: string
}

export function WitchViewPage() {
  const { data: liveData, isLoading } = useLiveData()
  const { data: forecasts = [] } = useForecast()
  const queryClient = useQueryClient()
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null)
  const [ticketForm, setTicketForm] = useState<TicketFormData>({ title: '', description: '' })
  const [showTicketForm, setShowTicketForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'route' | 'forecast'>('route')

  const { cauldrons, market, network } = liveData

  // Get suggested pickups (cauldrons that will exceed 90% soonest)
  const suggestedPickups = useMemo(() => {
    return cauldrons
      .map(cauldron => {
        const forecast = forecasts.find(f => f.cauldron_id === cauldron.id)
        const timeTo90 = forecast?.time_to_90_percent
        const travelTime = market && network
          ? network.edges.find(e => 
              (e.from === 'market' && e.to === cauldron.id) || 
              (e.to === 'market' && e.from === cauldron.id)
            )?.travel_time_minutes || 0
          : 0

        return {
          cauldron,
          forecast,
          timeTo90: timeTo90 ? DateTime.fromISO(timeTo90) : null,
          travelTime,
          urgency: timeTo90 
            ? DateTime.fromISO(timeTo90).diffNow('hours').hours 
            : Infinity,
        }
      })
      .filter(item => item.forecast && item.cauldron.fillPercent >= 80)
      .sort((a, b) => a.urgency - b.urgency)
      .slice(0, 5) // Top 5 most urgent
  }, [cauldrons, forecasts, market, network])

  // Optimize route for urgent cauldrons
  const urgentCauldrons = useMemo(() => {
    return suggestedPickups.map(item => item.cauldron)
  }, [suggestedPickups])

  const optimizedRoute = useMemo(() => {
    if (urgentCauldrons.length > 0) {
      return optimizeRoute(urgentCauldrons, market)
    }
    return optimizeRoute(cauldrons.filter(c => c.fillPercent >= 80), market)
  }, [urgentCauldrons, cauldrons, market])

  // Create node coordinates map for network edges
  const nodeCoordinates = useMemo(() => {
    const coords = new Map<string, { latitude: number; longitude: number }>()
    
    if (market) {
      coords.set('market', { latitude: market.latitude, longitude: market.longitude })
    }
    
    cauldrons.forEach(cauldron => {
      coords.set(cauldron.id, { latitude: cauldron.latitude, longitude: cauldron.longitude })
    })
    
    return coords
  }, [cauldrons, market])

  // Create markers for map
  const markers = optimizedRoute.map((cauldron, index) => ({
    id: cauldron.id,
    latitude: cauldron.latitude,
    longitude: cauldron.longitude,
    status: cauldron.status,
    name: `${index + 1}. ${cauldron.name}`,
    level: cauldron.currentLevel,
    fillPercent: cauldron.fillPercent,
    lastUpdated: cauldron.lastUpdated,
  }))

  // Create route for map: market -> cauldrons -> market
  const route = useMemo(() => {
    const routePoints: Array<{ latitude: number; longitude: number }> = []
    
    // Start from market if available
    if (market) {
      routePoints.push({
        latitude: market.latitude,
        longitude: market.longitude,
      })
    }
    
    // Add optimized cauldron route
    optimizedRoute.forEach(cauldron => {
      routePoints.push({
        latitude: cauldron.latitude,
        longitude: cauldron.longitude,
      })
    })
    
    // Return to market if available
    if (market && optimizedRoute.length > 0) {
      routePoints.push({
        latitude: market.latitude,
        longitude: market.longitude,
      })
    }
    
    return routePoints
  }, [optimizedRoute, market])

  // Calculate total distance
  const totalDistance = useMemo(() => {
    if (route.length < 2) return 0
    
    let distance = 0
    for (let i = 0; i < route.length - 1; i++) {
      distance += calculateDistance(
        route[i].latitude,
        route[i].longitude,
        route[i + 1].latitude,
        route[i + 1].longitude
      )
    }
    return distance
  }, [route])

  const handleCreateTicket = async (cauldronId: string) => {
    if (!ticketForm.title.trim() || !ticketForm.description.trim()) {
      alert('Please fill in both title and description')
      return
    }

    try {
      await api.createTicket({
        cauldronId,
        title: ticketForm.title,
        description: ticketForm.description,
      })
      
      // Invalidate tickets query to refresh
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      
      // Reset form
      setTicketForm({ title: '', description: '' })
      setShowTicketForm(false)
      setSelectedStopIndex(null)
      alert('Ticket created successfully!')
    } catch (error) {
      console.error('Error creating ticket:', error)
      alert('Failed to create ticket')
    }
  }

  const handleStopClick = (index: number) => {
    setSelectedStopIndex(index)
    setShowTicketForm(true)
  }

  if (isLoading) {
    return <div className="text-center py-12 text-gray-900">Loading live data...</div>
  }

  return (
    <div className="space-y-6" style={{ colorScheme: 'light' }}>
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-gray-900">
          <Wand2 className="h-8 w-8 text-green-600" />
          Witch View
        </h2>
        <p className="text-gray-700">Optimized route for cauldron maintenance</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('route')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'route'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Route className="h-4 w-4 inline mr-2" />
            Route View
          </button>
          <button
            onClick={() => setActiveTab('forecast')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'forecast'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart3 className="h-4 w-4 inline mr-2" />
            Forecast & Schedule
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'forecast' ? (
        <ForecastSchedule />
      ) : (

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Route List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-green-200 bg-white text-gray-900">
            <CardHeader>
              <CardTitle className="text-green-800">Optimized Route</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {optimizedRoute.map((cauldron, index) => (
                  <div
                    key={cauldron.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedStopIndex === index
                        ? 'bg-green-100 border-green-400'
                        : 'bg-white border-green-200 hover:bg-green-50'
                    }`}
                    onClick={() => handleStopClick(index)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-600 text-white font-bold text-sm">
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-semibold text-green-900">{cauldron.name}</h3>
                          <p className="text-sm text-green-700">
                            Fill: {cauldron.fillPercent.toFixed(1)}% | Level: {cauldron.currentLevel.toFixed(1)}L
                          </p>
                          {cauldron.lastUpdated && (
                            <p className="text-xs text-green-600 mt-1">
                              Updated: {DateTime.fromISO(cauldron.lastUpdated).toLocaleString(DateTime.DATETIME_SHORT)}
                            </p>
                          )}
                          <Badge
                            variant="outline"
                            className={`mt-1 ${
                              cauldron.statusColor === 'green'
                                ? 'bg-green-500/20 text-green-700 border-green-500/50'
                                : cauldron.statusColor === 'yellow'
                                ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/50'
                                : cauldron.statusColor === 'red'
                                ? 'bg-red-500/20 text-red-700 border-red-500/50'
                                : 'bg-gray-500/20 text-gray-700 border-gray-500/50'
                            }`}
                          >
                            {cauldron.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Suggested Pickups */}
          {suggestedPickups.length > 0 && (
            <Card className="border-yellow-200 bg-white text-gray-900">
              <CardHeader>
                <CardTitle className="text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Suggested Pickups
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {suggestedPickups.map((item, idx) => (
                    <div
                      key={item.cauldron.id}
                      className="p-3 rounded-lg border bg-white border-yellow-200"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-yellow-900">{item.cauldron.name}</h3>
                          <p className="text-sm text-yellow-700">
                            Fill: {item.cauldron.fillPercent.toFixed(1)}%
                          </p>
                          {item.timeTo90 && (
                            <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Time to 90%: {item.timeTo90.toRelative()}
                            </p>
                          )}
                          {item.travelTime > 0 && (
                            <p className="text-xs text-yellow-600">
                              Travel from market: {item.travelTime} min
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            item.urgency < 2
                              ? 'bg-red-500/20 text-red-700 border-red-500/50'
                              : item.urgency < 6
                              ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/50'
                              : 'bg-green-500/20 text-green-700 border-green-500/50'
                          }
                        >
                          {item.urgency < 2 ? 'Critical' : item.urgency < 6 ? 'Urgent' : 'Soon'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ticket Form */}
          {showTicketForm && selectedStopIndex !== null && (
            <Card className="border-green-200 bg-white text-gray-900">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-green-800">
                    Create Ticket - Stop {selectedStopIndex + 1}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowTicketForm(false)
                      setSelectedStopIndex(null)
                      setTicketForm({ title: '', description: '' })
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-green-800 mb-1 block">
                    Title
                  </label>
                  <input
                    type="text"
                    value={ticketForm.title}
                    onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900 placeholder:text-gray-500"
                    placeholder="Enter ticket title"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-green-800 mb-1 block">
                    Description
                  </label>
                  <textarea
                    value={ticketForm.description}
                    onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-900 placeholder:text-gray-500"
                    rows={4}
                    placeholder="Enter ticket description"
                  />
                </div>
                <Button
                  onClick={() => handleCreateTicket(optimizedRoute[selectedStopIndex].id)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Ticket
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Map */}
        <div className="lg:col-span-2">
          <Card className="border-green-200 bg-white text-gray-900">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-green-800">Route Map</CardTitle>
                {totalDistance > 0 && (
                  <div className="text-sm font-medium text-green-700">
                    Total Distance: {totalDistance.toFixed(2)} km
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <MapView
                markers={markers}
                market={market}
                networkEdges={network?.edges || []}
                nodeCoordinates={nodeCoordinates}
                route={route}
                className="h-[600px]"
              />
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </div>
  )
}

