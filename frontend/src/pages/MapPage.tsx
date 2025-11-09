import { useNavigate } from 'react-router-dom'
import { useCauldrons } from '@/hooks/useCauldrons'
import { MapView } from '@/components/MapView'
import { Card } from '@/components/ui/card'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CauldronSparkline } from '@/components/CauldronSparkline'
import { useCauldronData } from '@/hooks/useCauldronData'
import { useStore } from '@/store/useStore'

export function MapPage() {
  const navigate = useNavigate()
  const { data: cauldrons = [], isLoading } = useCauldrons()
  const { selectedCauldron, setSelectedCauldron } = useStore()

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

  const markers = cauldrons.map(c => ({
    id: c.id,
    latitude: c.latitude,
    longitude: c.longitude,
    status: c.status,
    name: c.name,
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
                        selectedCauldronData.status === 'online'
                          ? 'bg-green-500/20 text-green-400 border-green-500/50'
                          : selectedCauldronData.status === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                          : 'bg-red-500/20 text-red-400 border-red-500/50'
                      }`}
                    >
                      {selectedCauldronData.status}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Level:</span>
                      <span className="font-medium">{selectedCauldronData.level}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Potions:</span>
                      <span className="font-medium">{selectedCauldronData.potions || 0}</span>
                    </div>
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
                <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
                <span>Online</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-yellow-500 border-2 border-white" />
                <span>Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-white" />
                <span>Error</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-gray-500 border-2 border-white" />
                <span>Offline</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

