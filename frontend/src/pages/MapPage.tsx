import { useNavigate } from 'react-router-dom'
import { useLiveData } from '@/hooks/useLiveData'
import { MapView } from '@/components/MapView'
import { Card } from '@/components/ui/card'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CauldronSparkline } from '@/components/CauldronSparkline'
import { useCauldronData } from '@/hooks/useCauldronData'
import { useStore } from '@/store/useStore'
import { useMemo } from 'react'
import { DateTime } from 'luxon'

export function MapPage() {
  const navigate = useNavigate()
  const { data: liveData, isLoading } = useLiveData()
  const { selectedCauldron, setSelectedCauldron } = useStore()

  const { cauldrons, market, network } = liveData

  const selectedCauldronData = cauldrons.find(c => c.id === selectedCauldron)
  const { data: sparklineData = [] } = useCauldronData(selectedCauldron || '', 12)

  const handleMarkerClick = (id: string) => {
    setSelectedCauldron(id)
  }

  const handleViewDetails = () => {
    if (selectedCauldron) {
      navigate(`/cauldron/${selectedCauldron}`)
    }
  }

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

  const markers = cauldrons.map(c => ({
    id: c.id,
    latitude: c.latitude,
    longitude: c.longitude,
    status: c.status,
    name: c.name,
    level: c.currentLevel,
    fillPercent: c.fillPercent,
    lastUpdated: c.lastUpdated,
  }))

  if (isLoading) {
    return <div className="text-center py-12">Loading map...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Map</h2>
        <p className="text-muted-foreground">Interactive view of all cauldrons</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <MapView
                markers={markers}
                market={market}
                networkEdges={[]}
                nodeCoordinates={nodeCoordinates}
                onMarkerClick={handleMarkerClick}
                className="h-[600px]"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cauldron Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCauldronData ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedCauldronData.name}</h3>
                    <Badge
                      variant="outline"
                      className={`mt-2 ${
                        selectedCauldronData.statusColor === 'green'
                          ? 'bg-green-500/20 text-green-400 border-green-500/50'
                          : selectedCauldronData.statusColor === 'yellow'
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                          : selectedCauldronData.statusColor === 'red'
                          ? 'bg-red-500/20 text-red-400 border-red-500/50'
                          : 'bg-gray-500/20 text-gray-400 border-gray-500/50'
                      }`}
                    >
                      {selectedCauldronData.status}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fill %:</span>
                      <span className="font-medium">{selectedCauldronData.fillPercent.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Level:</span>
                      <span className="font-medium">{selectedCauldronData.currentLevel.toFixed(1)}L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Max Volume:</span>
                      <span className="font-medium">{selectedCauldronData.max_volume}L</span>
                    </div>
                    {selectedCauldronData.lastUpdated && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Last Updated:</span>
                        <span className="font-medium text-xs">
                          {DateTime.fromISO(selectedCauldronData.lastUpdated).toLocaleString(DateTime.DATETIME_SHORT)}
                        </span>
                      </div>
                    )}
                  </div>
                  {sparklineData.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Recent trend (12h)</p>
                      <CauldronSparkline data={sparklineData} />
                    </div>
                  )}
                  <button
                    onClick={handleViewDetails}
                    className="w-full mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    View Details
                  </button>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Click on a cauldron marker to view details
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#10b981] border-2 border-white" />
                <span>0-30% (Safe)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#f59e0b] border-2 border-white" />
                <span>30-80% (Warning)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-[#ef4444] border-2 border-white" />
                <span>80-100% (Critical)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gray-500 border-2 border-white" />
                <span>Offline</span>
              </div>
              {market && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                  <span className="text-lg">⭐</span>
                  <span>Market</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}


