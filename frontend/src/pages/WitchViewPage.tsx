import { useState, useMemo } from 'react'
import { useCauldrons } from '@/hooks/useCauldrons'
import { MapView } from '@/components/MapView'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wand2, MapPin, Plus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { Cauldron } from '@/types'
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
function optimizeRoute(cauldrons: Cauldron[]): Cauldron[] {
  if (cauldrons.length === 0) return []
  
  // Filter out offline cauldrons for route optimization
  const activeCauldrons = cauldrons.filter(c => c.status !== 'offline')
  if (activeCauldrons.length === 0) return cauldrons

  // Start from the first cauldron (or could be user's current location)
  const route: Cauldron[] = []
  const unvisited = [...activeCauldrons]
  
  // Start with the first cauldron
  let current = unvisited.shift()!
  route.push(current)

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
    current = nearest
  }

  return route
}

interface TicketFormData {
  title: string
  description: string
}

export function WitchViewPage() {
  const { data: cauldrons = [], isLoading } = useCauldrons()
  const queryClient = useQueryClient()
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null)
  const [ticketForm, setTicketForm] = useState<TicketFormData>({ title: '', description: '' })
  const [showTicketForm, setShowTicketForm] = useState(false)

  // Optimize route
  const optimizedRoute = useMemo(() => optimizeRoute(cauldrons), [cauldrons])

  // Create markers for map
  const markers = optimizedRoute.map((cauldron, index) => ({
    id: cauldron.id,
    latitude: cauldron.latitude,
    longitude: cauldron.longitude,
    status: cauldron.status,
    name: `${index + 1}. ${cauldron.name}`,
    level: cauldron.level,
  }))

  // Create route for map
  const route = optimizedRoute.map(cauldron => ({
    latitude: cauldron.latitude,
    longitude: cauldron.longitude,
  }))

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
    return <div className="text-center py-12 text-gray-900">Loading route...</div>
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Route List */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-green-200 bg-green-50/50">
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
                            Level: {cauldron.level}% | {cauldron.potions || 0} potions
                          </p>
                          <Badge
                            variant="outline"
                            className={`mt-1 ${
                              cauldron.level < 30
                                ? 'bg-green-500/20 text-green-700 border-green-500/50'
                                : cauldron.level < 80
                                ? 'bg-yellow-500/20 text-yellow-700 border-yellow-500/50'
                                : 'bg-red-500/20 text-red-700 border-red-500/50'
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

          {/* Ticket Form */}
          {showTicketForm && selectedStopIndex !== null && (
            <Card className="border-green-200 bg-green-50/50">
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
          <Card className="border-green-200">
            <CardContent className="p-0">
              <MapView
                markers={markers}
                route={route}
                className="h-[600px]"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

