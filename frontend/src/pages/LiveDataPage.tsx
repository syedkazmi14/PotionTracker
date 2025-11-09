import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wifi, WifiOff, Activity } from 'lucide-react'
import { DateTime } from 'luxon'

interface LiveData {
  taken_liters: number
  reported_liters: number
  discrepancy: number
  timestamp: string | null
  connected: boolean
}

const API_BASE_URL = 'http://localhost:5000'

export function LiveDataPage() {
  const [takenLiters, setTakenLiters] = useState(0)
  const [reportedLiters, setReportedLiters] = useState(0)
  const [liveData, setLiveData] = useState<LiveData>({
    taken_liters: 0,
    reported_liters: 0,
    discrepancy: 0,
    timestamp: null,
    connected: false,
  })
  const [isPolling, setIsPolling] = useState(false)

  // Poll for live data from TCP socket
  useEffect(() => {
    if (!isPolling) return

    const fetchLiveData = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/live_data`)
        if (response.ok) {
          const data: LiveData = await response.json()
          setLiveData(data)
          
          // Update sliders if data comes from hardware
          if (data.connected && data.timestamp) {
            setTakenLiters(data.taken_liters)
            setReportedLiters(data.reported_liters)
          }
        }
      } catch (error) {
        console.error('Error fetching live data:', error)
      }
    }

    fetchLiveData()
    const interval = setInterval(fetchLiveData, 1000) // Poll every second

    return () => clearInterval(interval)
  }, [isPolling])

  // Calculate discrepancy
  const discrepancy = takenLiters - reportedLiters

  // Update live data when sliders change
  const handleUpdate = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/live_data/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taken_liters: takenLiters,
          reported_liters: reportedLiters,
        }),
      })

      if (response.ok) {
        const data: LiveData = await response.json()
        setLiveData(data)
      }
    } catch (error) {
      console.error('Error updating live data:', error)
    }
  }

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never'
    try {
      return DateTime.fromISO(timestamp).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)
    } catch {
      return timestamp
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Live Data</h2>
        <p className="text-muted-foreground">
          Test live data from hardware via TCP socket connection
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Manual Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Manual Input</CardTitle>
            <CardDescription>
              Adjust sliders to test discrepancy calculation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Slider
                label="Taken Liters"
                value={takenLiters}
                onChange={(e) => setTakenLiters(parseFloat(e.target.value))}
                min={0}
                max={1000}
                step={0.1}
                valueLabel={`${takenLiters.toFixed(1)} L`}
              />
              
              <Slider
                label="Reported Liters (Ticket)"
                value={reportedLiters}
                onChange={(e) => setReportedLiters(parseFloat(e.target.value))}
                min={0}
                max={1000}
                step={0.1}
                valueLabel={`${reportedLiters.toFixed(1)} L`}
              />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Discrepancy</span>
                <Badge
                  variant="outline"
                  className={
                    Math.abs(discrepancy) < 1
                      ? 'bg-green-500/20 text-green-400 border-green-500/50'
                      : Math.abs(discrepancy) < 10
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                      : 'bg-red-500/20 text-red-400 border-red-500/50'
                  }
                >
                  {discrepancy > 0 ? '+' : ''}
                  {discrepancy.toFixed(2)} L
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {discrepancy > 0
                  ? 'More was taken than reported'
                  : discrepancy < 0
                  ? 'Less was taken than reported'
                  : 'No discrepancy'}
              </p>
            </div>

            <Button onClick={handleUpdate} className="w-full">
              Update Live Data
            </Button>
          </CardContent>
        </Card>

        {/* Live Data from Hardware */}
        <Card>
          <CardHeader>
            <CardTitle>Hardware Connection</CardTitle>
            <CardDescription>
              Real-time data from TCP socket connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {liveData.connected ? (
                  <>
                    <Wifi className="h-5 w-5 text-green-500" />
                    <span className="text-sm font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-5 w-5 text-gray-500" />
                    <span className="text-sm font-medium">Not Connected</span>
                  </>
                )}
              </div>
              <Button
                variant={isPolling ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsPolling(!isPolling)}
              >
                <Activity className="h-4 w-4 mr-2" />
                {isPolling ? 'Stop Polling' : 'Start Polling'}
              </Button>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Taken Liters:</span>
                <span className="font-medium">{liveData.taken_liters.toFixed(2)} L</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Reported Liters:</span>
                <span className="font-medium">{liveData.reported_liters.toFixed(2)} L</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-medium">Discrepancy:</span>
                <Badge
                  variant="outline"
                  className={
                    Math.abs(liveData.discrepancy) < 1
                      ? 'bg-green-500/20 text-green-400 border-green-500/50'
                      : Math.abs(liveData.discrepancy) < 10
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                      : 'bg-red-500/20 text-red-400 border-red-500/50'
                  }
                >
                  {liveData.discrepancy > 0 ? '+' : ''}
                  {liveData.discrepancy.toFixed(2)} L
                </Badge>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-xs text-muted-foreground">Last Update:</span>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(liveData.timestamp)}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                TCP Server: <code className="bg-muted px-1 rounded">0.0.0.0:8888</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Send JSON: <code className="bg-muted px-1 rounded">
                  {`{"taken_liters": 100, "reported_liters": 95}`}
                </code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Or CSV: <code className="bg-muted px-1 rounded">100,95</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

