import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { cn } from '@/lib/utils'

interface MapViewProps {
  className?: string
  markers?: Array<{
    id: string
    latitude: number
    longitude: number
    status: string
    name: string
    level: number
  }>
  onMarkerClick?: (id: string) => void
}

export function MapView({ className, markers = [], onMarkerClick }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])

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
        center: [-96.7970, 32.7767],
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
    if (!map.current || markers.length === 0) return

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    // Add new markers
    markers.forEach(({ id, latitude, longitude, status, name, level }) => {
      const getLevelColor = (level: number, status: string) => {
        // If offline, return gray
        if (status === 'offline') {
          return '#6b7280'
        }
        
        // Calculate color based on level
        // Green (0-30%) -> Yellow (30-80%) -> Red (80-100%)
        if (level >= 0 && level < 30) {
          // Green: #10b981
          return '#10b981'
        } else if (level >= 30 && level < 80) {
          // Interpolate between green and yellow
          const ratio = (level - 30) / 50 // 0 to 1 as level goes from 30 to 80
          const r = Math.round(16 + (245 - 16) * ratio) // 16 -> 245
          const g = Math.round(185 + (158 - 185) * ratio) // 185 -> 158
          const b = Math.round(129 + (30 - 129) * ratio) // 129 -> 30
          return `rgb(${r}, ${g}, ${b})`
        } else {
          // Interpolate between yellow and red
          const ratio = (level - 80) / 20 // 0 to 1 as level goes from 80 to 100
          const r = Math.round(245 + (239 - 245) * ratio) // 245 -> 239
          const g = Math.round(158 + (68 - 158) * ratio) // 158 -> 68
          const b = Math.round(30 + (68 - 30) * ratio) // 30 -> 68
          return `rgb(${r}, ${g}, ${b})`
        }
      }

      const el = document.createElement('div')
      el.className = 'marker'
      el.style.width = '20px'
      el.style.height = '20px'
      el.style.borderRadius = '50%'
      el.style.backgroundColor = getLevelColor(level, status)
      el.style.border = '2px solid white'
      el.style.cursor = 'pointer'
      el.title = `${name} - ${level}%`

      const marker = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(map.current!)

      if (onMarkerClick) {
        el.addEventListener('click', () => onMarkerClick(id))
      }

      markersRef.current.push(marker)
    })
  }, [markers, onMarkerClick])

  return (
    <div className={cn("w-full h-full min-h-[400px] rounded-lg overflow-hidden", className)}>
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  )
}

