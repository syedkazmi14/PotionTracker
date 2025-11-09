import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn } from '@/lib/utils'
import { NetworkEdge } from '@/types'

interface MapViewProps {
  className?: string
  markers?: Array<{
    id: string
    latitude: number
    longitude: number
    status: string
    name: string
    level: number
    fillPercent?: number
    lastUpdated?: string | null
  }>
  market?: {
    id: string
    name: string
    latitude: number
    longitude: number
  } | null
  networkEdges?: NetworkEdge[]
  nodeCoordinates?: Map<string, { latitude: number; longitude: number }>
  onMarkerClick?: (id: string) => void
  route?: Array<{ latitude: number; longitude: number }>
  routes?: Array<Array<{ latitude: number; longitude: number }>>
}

export function MapView({ 
  className, 
  markers = [], 
  market,
  networkEdges = [],
  nodeCoordinates,
  onMarkerClick, 
  route,
  routes = []
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const routeLayerRef = useRef<string[]>([])
  const networkLayerRef = useRef<string[]>([])

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN

    if (!mapContainer.current || !token || token === 'your_token_here') {
      // Fallback to a placeholder if no token
      if (mapContainer.current) {
        mapContainer.current.innerHTML = `
          <div class="flex items-center justify-center h-full bg-muted text-muted-foreground">
            <div class="text-center p-4">
              <p class="text-sm">Mapbox token required</p>
              <p class="text-xs mt-2">Set VITE_MAPBOX_TOKEN in .env</p>
            </div>
          </div>
        `
      }
      return
    }

    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-97.1331, 33.2148], // Denton, Texas coordinates
        zoom: 12,
        accessToken: token,
      })
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!map.current) return

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    // Auto-fit map to show all markers if available
    const allPoints: Array<{ lat: number; lng: number }> = []
    if (market) {
      allPoints.push({ lat: market.latitude, lng: market.longitude })
    }
    markers.forEach(m => {
      allPoints.push({ lat: m.latitude, lng: m.longitude })
    })

    // Add market marker if provided
    if (market) {
      const el = document.createElement('div')
      el.className = 'market-marker'
      el.innerHTML = '⭐'
      el.style.fontSize = '24px'
      el.style.cursor = 'pointer'
      el.style.textAlign = 'center'
      el.style.lineHeight = '1'
      el.title = market.name

      const marker = new mapboxgl.Marker(el)
        .setLngLat([market.longitude, market.latitude])
        .addTo(map.current!)

      if (onMarkerClick) {
        el.addEventListener('click', () => onMarkerClick(market.id))
      }

      markersRef.current.push(marker)
    }

    // Add cauldron markers
    markers.forEach(({ id, latitude, longitude, status, name, level, fillPercent, lastUpdated }) => {
      const getLevelColor = (fillPercent: number | undefined, status: string) => {
        // If offline, return gray
        if (status === 'offline') {
          return '#6b7280'
        }
        
        // fillPercent should always be provided, but use 0 as fallback
        const percent = fillPercent !== undefined ? fillPercent : 0
        
        // Calculate color based on fill percentage
        // Green (0-30%) -> Yellow (30-80%) -> Red (80-100%)
        if (percent < 30) {
          return '#10b981' // Green
        } else if (percent < 80) {
          return '#f59e0b' // Yellow
        } else {
          return '#ef4444' // Red
        }
      }

      const el = document.createElement('div')
      el.className = 'marker'
      const size = fillPercent !== undefined 
        ? Math.max(12, Math.min(30, 12 + (fillPercent / 100) * 18)) // Size proportional to fill
        : 20
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      el.style.borderRadius = '50%'
      el.style.backgroundColor = getLevelColor(fillPercent, status)
      el.style.border = '2px solid white'
      el.style.cursor = 'pointer'
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
      
      const tooltipText = fillPercent !== undefined
        ? `${name}\nFill: ${fillPercent.toFixed(1)}%\nLevel: ${level.toFixed(1)}L${lastUpdated ? `\nUpdated: ${new Date(lastUpdated).toLocaleTimeString()}` : ''}`
        : `${name} - ${level}%`
      el.title = tooltipText

      const marker = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map.current!)

      if (onMarkerClick) {
        el.addEventListener('click', () => onMarkerClick(id))
      }

      markersRef.current.push(marker)
    })

    // Auto-fit map to bounds if we have points
    if (allPoints.length > 0 && map.current.isStyleLoaded()) {
      const bounds = new mapboxgl.LngLatBounds()
      allPoints.forEach(point => {
        bounds.extend([point.lng, point.lat])
      })
      
      // Add some padding
      map.current.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 14,
      })
    } else if (allPoints.length > 0) {
      // If map isn't loaded yet, wait for it
      map.current.once('load', () => {
        const bounds = new mapboxgl.LngLatBounds()
        allPoints.forEach(point => {
          bounds.extend([point.lng, point.lat])
        })
        
        map.current!.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 14,
        })
      })
    }

    // Helper function to add/update route
    const addRoute = (routeId: string, coordinates: number[][], color: string = '#10b981', width: number = 3, isDotted: boolean = false) => {
      if (!map.current) return

      const addRouteLayer = () => {
        if (!map.current) return

        if (map.current.getSource(routeId)) {
          // Update existing route
          const source = map.current.getSource(routeId) as mapboxgl.GeoJSONSource
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates,
            },
          })
          
          // Update layer paint properties if needed (especially for dotted lines)
          if (isDotted && map.current.getLayer(routeId)) {
            map.current.setPaintProperty(routeId, 'line-dasharray', [4, 3])
          }
        } else {
          // Add new route
          map.current.addSource(routeId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates,
              },
            },
          })

          const paintProperties: mapboxgl.LinePaint = {
            'line-color': color,
            'line-width': width,
          }
          
          if (isDotted) {
            paintProperties['line-dasharray'] = [4, 3]
          }

          map.current.addLayer({
            id: routeId,
            type: 'line',
            source: routeId,
            layout: {
              'line-join': 'round',
              'line-cap': 'round',
            },
            paint: paintProperties,
          })
        }
      }

      if (map.current.isStyleLoaded()) {
        addRouteLayer()
      } else {
        map.current.once('load', addRouteLayer)
      }
    }

    // Draw single route if provided (as dotted line for witch view)
    // This must be drawn after network edges to ensure proper layering
    if (route && route.length > 1) {
      const routeCoordinates = route.map(point => [point.longitude, point.latitude])
      // Always add route as dotted line for witch view
      addRoute('route', routeCoordinates, '#10b981', 3, true)
      // Ensure route is tracked in ref
      if (!routeLayerRef.current.includes('route')) {
        routeLayerRef.current.push('route')
      }
    } else if (route && route.length <= 1) {
      // Remove route if it exists but route data is invalid (not enough points)
      if (map.current && map.current.getLayer('route')) {
        if (map.current.getSource('route')) {
          map.current.removeLayer('route')
          map.current.removeSource('route')
        }
        routeLayerRef.current = routeLayerRef.current.filter(id => id !== 'route')
      }
    }

    // Draw multiple routes if provided (as dotted lines for courier routes)
    routes.forEach((routePoints, index) => {
      if (routePoints.length > 1) {
        const routeId = `route-${index}`
        const routeCoordinates = routePoints.map(point => [point.longitude, point.latitude])
        const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']
        const color = colors[index % colors.length]
        // Draw as dotted line for courier routes
        addRoute(routeId, routeCoordinates, color, 3, true)
        if (!routeLayerRef.current.includes(routeId)) {
          routeLayerRef.current.push(routeId)
        }
      }
    })

    // Draw network edges if provided
    if (networkEdges.length > 0 && nodeCoordinates) {
      networkEdges.forEach((edge, index) => {
        const fromCoords = nodeCoordinates.get(edge.from)
        const toCoords = nodeCoordinates.get(edge.to)
        
        if (fromCoords && toCoords) {
          const edgeId = `network-edge-${index}`
          const coordinates = [
            [fromCoords.longitude, fromCoords.latitude],
            [toCoords.longitude, toCoords.latitude]
          ]
          
          // Color/thickness based on travel time
          const travelTime = edge.travel_time_minutes || 0
          const color = travelTime < 15 ? '#10b981' : travelTime < 30 ? '#f59e0b' : '#ef4444'
          const width = Math.max(1, Math.min(3, travelTime / 20))
          
          addRoute(edgeId, coordinates, color, width)
          if (!networkLayerRef.current.includes(edgeId)) {
            networkLayerRef.current.push(edgeId)
          }
        }
      })
    }

    // Cleanup: Remove old route layers that are no longer needed
    return () => {
      if (!map.current) return
      
      routeLayerRef.current.forEach(layerId => {
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId)
        }
        if (map.current!.getSource(layerId)) {
          map.current!.removeSource(layerId)
        }
      })
      
      networkLayerRef.current.forEach(layerId => {
        if (map.current!.getLayer(layerId)) {
          map.current!.removeLayer(layerId)
        }
        if (map.current!.getSource(layerId)) {
          map.current!.removeSource(layerId)
        }
      })
      
      routeLayerRef.current = []
      networkLayerRef.current = []
    }
  }, [markers, market, networkEdges, nodeCoordinates, onMarkerClick, route, routes])

  return (
    <div className={cn("w-full h-full min-h-[400px] rounded-lg overflow-hidden", className)}>
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  )
}

