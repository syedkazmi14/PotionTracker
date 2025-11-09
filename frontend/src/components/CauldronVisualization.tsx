import { useMemo } from 'react'
import { LiveCauldron } from '@/hooks/useLiveData'

interface CauldronVisualizationProps {
  cauldron: LiveCauldron | null
  takenLiters: number
}

export function CauldronVisualization({ cauldron, takenLiters }: CauldronVisualizationProps) {
  // Extract cauldron number from ID (e.g., "cauldron_001" -> "1" or "1" -> "1")
  // MUST be called before any early returns to follow Rules of Hooks
  const cauldronNumber = useMemo(() => {
    if (!cauldron?.id) return '?'
    const match = cauldron.id.toString().match(/\d+/)
    return match ? match[0] : cauldron.id
  }, [cauldron?.id])

  // Calculate the current fill after taking liters
  const currentFill = useMemo(() => {
    if (!cauldron || !cauldron.max_volume || cauldron.max_volume === 0) return 0
    
    // Start with current level, subtract what was taken
    const currentLevel = cauldron.currentLevel || 0
    const remainingLiters = Math.max(0, currentLevel - (takenLiters || 0))
    const fillPercent = (remainingLiters / cauldron.max_volume) * 100
    
    return Math.min(100, Math.max(0, fillPercent))
  }, [cauldron, takenLiters])

  const currentLiters = useMemo(() => {
    if (!cauldron) return 0
    const currentLevel = cauldron.currentLevel || 0
    return Math.max(0, currentLevel - (takenLiters || 0))
  }, [cauldron, takenLiters])

  if (!cauldron) {
    return (
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg">
        <p className="text-muted-foreground">Select a cauldron to view visualization</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Cauldron Container */}
      <div className="relative w-full max-w-xs mx-auto">
        {/* Cauldron Label */}
        <div className="text-center mb-4">
          <h3 className="text-2xl font-bold">Cauldron #{cauldronNumber}</h3>
          <p className="text-sm text-muted-foreground mt-1">{cauldron.name}</p>
        </div>

        {/* Cauldron Visual Container */}
        <div className="relative mx-auto" style={{ width: '200px', height: '300px' }}>
          {/* Cauldron Body - rounded bottom, wider at top */}
          <div 
            className="absolute inset-0 bg-gradient-to-b from-gray-300 to-gray-400 rounded-t-lg border-4 border-gray-500 shadow-2xl overflow-hidden"
            style={{ borderBottomLeftRadius: '120px', borderBottomRightRadius: '120px' }}
          >
            {/* Purple Fill - grows from bottom with gradient */}
            <div
              className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-in-out"
              style={{
                height: `${currentFill}%`,
                background: currentFill >= 80 
                  ? 'linear-gradient(to top, #6b21a8 0%, #9333ea 50%, #a855f7 100%)'
                  : currentFill >= 30 
                  ? 'linear-gradient(to top, #7c3aed 0%, #a855f7 50%, #c084fc 100%)'
                  : 'linear-gradient(to top, #8b5cf6 0%, #c084fc 50%, #d8b4fe 100%)',
                borderBottomLeftRadius: '120px',
                borderBottomRightRadius: '120px',
              }}
            >
              {/* Fill Level Indicator - only show if fill is high enough */}
              {currentFill > 15 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white font-bold text-3xl drop-shadow-2xl">
                    {currentFill.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {/* Cauldron Rim/Edge - decorative top edge */}
            <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-b from-gray-500 to-gray-400 rounded-t-lg"></div>
            
            {/* Cauldron Handles (optional decorative elements) */}
            <div className="absolute top-1/2 -left-2 w-4 h-12 bg-gray-500 rounded-l-full"></div>
            <div className="absolute top-1/2 -right-2 w-4 h-12 bg-gray-500 rounded-r-full"></div>
          </div>
        </div>

        {/* Info Display */}
        <div className="mt-4 space-y-2 text-center">
          <div className="flex justify-between items-center px-4 py-2 bg-muted rounded-lg">
            <span className="text-sm font-medium">Current Fill:</span>
            <span className="text-sm font-bold">{currentLiters.toFixed(1)}L / {cauldron.max_volume || 0}L</span>
          </div>
          <div className="flex justify-between items-center px-4 py-2 bg-muted rounded-lg">
            <span className="text-sm font-medium">Taken:</span>
            <span className="text-sm font-bold text-red-600">{takenLiters.toFixed(1)}L</span>
          </div>
          <div className="flex justify-between items-center px-4 py-2 bg-muted rounded-lg">
            <span className="text-sm font-medium">Fill Percentage:</span>
            <span className="text-sm font-bold">{currentFill.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

