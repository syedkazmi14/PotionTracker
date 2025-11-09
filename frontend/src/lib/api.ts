import { Cauldron, CauldronDataPoint, Anomaly, Ticket, DiscrepancyData, CauldronInfo, CauldronLevelsData, Forecast, DailySchedule, Courier, Market, Network, TicketsResponse, TransportTicket } from '@/types'
import { DateTime } from 'luxon'

// Mock data
const mockCauldrons: Cauldron[] = [
  {
    id: '1',
    name: 'Cauldron 1',
    level: 85,
    status: 'online',
    latitude: 32.7767,
    longitude: -96.7970,
    lastUpdate: DateTime.now().toISO(),
    potions: 42,
  },
  {
    id: '2',
    name: 'Cauldron 2',
    level: 45,
    status: 'warning',
    latitude: 32.7800,
    longitude: -96.8000,
    lastUpdate: DateTime.now().minus({ minutes: 5 }).toISO(),
    potions: 18,
  },
  {
    id: '3',
    name: 'Cauldron 3',
    level: 12,
    status: 'error',
    latitude: 32.7700,
    longitude: -96.7900,
    lastUpdate: DateTime.now().minus({ minutes: 15 }).toISO(),
    potions: 3,
  },
  {
    id: '4',
    name: 'Cauldron 4',
    level: 92,
    status: 'online',
    latitude: 32.7750,
    longitude: -96.7950,
    lastUpdate: DateTime.now().toISO(),
    potions: 55,
  },
  {
    id: '5',
    name: 'Cauldron 5',
    level: 25,
    status: 'online',
    latitude: 32.7850,
    longitude: -96.8050,
    lastUpdate: DateTime.now().toISO(),
    potions: 12,
  },
  {
    id: '6',
    name: 'Cauldron 6',
    level: 65,
    status: 'online',
    latitude: 32.7650,
    longitude: -96.7850,
    lastUpdate: DateTime.now().toISO(),
    potions: 32,
  },
  {
    id: '7',
    name: 'Cauldron 7',
    level: 88,
    status: 'online',
    latitude: 32.7900,
    longitude: -96.8100,
    lastUpdate: DateTime.now().toISO(),
    potions: 48,
  },
  {
    id: '8',
    name: 'Cauldron 8',
    level: 15,
    status: 'warning',
    latitude: 32.7600,
    longitude: -96.7800,
    lastUpdate: DateTime.now().minus({ minutes: 10 }).toISO(),
    potions: 5,
  },
  {
    id: '9',
    name: 'Cauldron 9',
    level: 72,
    status: 'online',
    latitude: 32.7950,
    longitude: -96.8150,
    lastUpdate: DateTime.now().toISO(),
    potions: 38,
  },
  {
    id: '10',
    name: 'Cauldron 10',
    level: 95,
    status: 'online',
    latitude: 32.7550,
    longitude: -96.7750,
    lastUpdate: DateTime.now().toISO(),
    potions: 58,
  },
  {
    id: '11',
    name: 'Cauldron 11',
    level: 35,
    status: 'online',
    latitude: 32.8000,
    longitude: -96.8200,
    lastUpdate: DateTime.now().toISO(),
    potions: 15,
  },
  {
    id: '12',
    name: 'Cauldron 12',
    level: 0,
    status: 'offline',
    latitude: 32.7500,
    longitude: -96.7700,
    lastUpdate: DateTime.now().minus({ hours: 2 }).toISO(),
    potions: 0,
  },
]

const generateMockDataPoints = (cauldronId: string, hours: number = 24): CauldronDataPoint[] => {
  const points: CauldronDataPoint[] = []
  const now = DateTime.now()
  const baseLevel = mockCauldrons.find(c => c.id === cauldronId)?.level || 50

  for (let i = hours; i >= 0; i--) {
    const time = now.minus({ hours: i })
    const variation = Math.sin(i / 2) * 10 + Math.random() * 5
    points.push({
      time: time.toISO(),
      level: Math.max(0, Math.min(100, baseLevel + variation)),
    })
  }
  return points
}

const mockAnomalies: Anomaly[] = [
  {
    id: '1',
    cauldronId: '2',
    severity: 'medium',
    message: 'Level dropped below 50%',
    timestamp: DateTime.now().minus({ hours: 2 }).toISO(),
    resolved: false,
  },
  {
    id: '2',
    cauldronId: '3',
    severity: 'critical',
    message: 'Level critically low',
    timestamp: DateTime.now().minus({ hours: 1 }).toISO(),
    resolved: false,
  },
  {
    id: '3',
    cauldronId: '1',
    severity: 'low',
    message: 'Minor fluctuation detected',
    timestamp: DateTime.now().minus({ minutes: 30 }).toISO(),
    resolved: true,
  },
]

const mockTickets: Ticket[] = [
  {
    id: '1',
    cauldronId: '3',
    title: 'Low level alert',
    description: 'Cauldron Gamma level has dropped below 20%',
    status: 'open',
    createdAt: DateTime.now().minus({ hours: 2 }).toISO(),
    updatedAt: DateTime.now().minus({ hours: 2 }).toISO(),
  },
  {
    id: '2',
    cauldronId: '2',
    title: 'Maintenance required',
    description: 'Cauldron Beta needs routine maintenance',
    status: 'in-progress',
    createdAt: DateTime.now().minus({ days: 1 }).toISO(),
    updatedAt: DateTime.now().minus({ hours: 3 }).toISO(),
  },
]

export const api = {
  async getCauldrons(): Promise<Cauldron[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300))
    return [...mockCauldrons]
  },

  async getCauldron(id: string): Promise<Cauldron | null> {
    await new Promise(resolve => setTimeout(resolve, 200))
    const cauldron = mockCauldrons.find(c => c.id === id)
    return cauldron || null
  },

  async getCauldronData(id: string, hours: number = 24): Promise<CauldronDataPoint[]> {
    try {
      // Fetch real data from API
      const response = await fetch('http://localhost:5000/api/cauldron-levels-data')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: CauldronLevelsData[] = await response.json()
      
      // Filter and transform data for this cauldron
      const now = DateTime.now()
      const cutoffTime = now.minus({ hours })
      
      const points: CauldronDataPoint[] = data
        .filter(item => {
          const timestamp = DateTime.fromISO(item.timestamp)
          return timestamp >= cutoffTime && item.cauldron_levels[id] !== undefined
        })
        .map(item => ({
          time: item.timestamp,
          level: item.cauldron_levels[id] || 0,
        }))
        .sort((a, b) => DateTime.fromISO(a.time).toMillis() - DateTime.fromISO(b.time).toMillis())
      
      return points
    } catch (error) {
      console.error('Failed to fetch cauldron data:', error)
      // Fallback to mock data if API fails
      return generateMockDataPoints(id, hours)
    }
  },

  async getAnomalies(cauldronId?: string): Promise<Anomaly[]> {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (cauldronId) {
      return mockAnomalies.filter(a => a.cauldronId === cauldronId)
    }
    return [...mockAnomalies]
  },

  async getTickets(cauldronId?: string): Promise<TransportTicket[]> {
    try {
      const response = await fetch('http://localhost:5000/api/tickets')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data: TicketsResponse = await response.json()
      
      // Filter by cauldron ID if provided
      let tickets = data.transport_tickets || []
      if (cauldronId) {
        tickets = tickets.filter(t => t.cauldron_id === cauldronId)
      }
      
      // Sort by date (newest first)
      tickets.sort((a, b) => {
        const dateA = DateTime.fromISO(a.date)
        const dateB = DateTime.fromISO(b.date)
        return dateB.toMillis() - dateA.toMillis()
      })
      
      return tickets
    } catch (error) {
      console.error('Failed to fetch tickets:', error)
      // Fallback to empty array if API fails
      return []
    }
  },

  async getTicketsMetadata(): Promise<TicketsResponse> {
    try {
      const response = await fetch('http://localhost:5000/api/tickets')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch tickets metadata:', error)
      return {
        metadata: {
          total_tickets: 0,
          suspicious_tickets: 0,
          date_range: { start: '', end: '' }
        },
        transport_tickets: []
      }
    }
  },

  async createTicket(data: { cauldronId: string; title: string; description: string }): Promise<Ticket> {
    await new Promise(resolve => setTimeout(resolve, 300))
    const newTicket: Ticket = {
      id: `ticket-${Date.now()}`,
      cauldronId: data.cauldronId,
      title: data.title,
      description: data.description,
      status: 'open',
      createdAt: DateTime.now().toISO(),
      updatedAt: DateTime.now().toISO(),
    }
    mockTickets.push(newTicket)
    return newTicket
  },

  async getCauldronsInfo(): Promise<CauldronInfo[]> {
    try {
      // Use local backend proxy to avoid CORS issues
      const response = await fetch('http://localhost:5000/api/cauldrons-info')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch cauldrons info:', error)
      throw error
    }
  },

  async getCauldronLevelsData(): Promise<CauldronLevelsData[]> {
    try {
      // Use local backend proxy to avoid CORS issues
      const response = await fetch('http://localhost:5000/api/cauldron-levels-data')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch cauldron levels data:', error)
      throw error
    }
  },

  async getDiscrepancyData(): Promise<DiscrepancyData> {
    try {
      // Fetch from Python backend endpoint
      const response = await fetch('http://localhost:5000/api/get_descrepencies/')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch discrepancy data:', error)
      // Fallback to empty data if API fails
      return {}
    }
  },

  async getForecast(): Promise<Forecast[]> {
    try {
      const response = await fetch('http://localhost:5000/api/Forecast')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch forecast data:', error)
      throw error
    }
  },

  async getDailySchedule(date?: string): Promise<DailySchedule> {
    try {
      const url = date 
        ? `http://localhost:5000/api/Schedule/daily?date=${date}`
        : 'http://localhost:5000/api/Schedule/daily'
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch schedule data:', error)
      throw error
    }
  },

  async getCouriers(): Promise<Courier[]> {
    try {
      const response = await fetch('http://localhost:5000/api/couriers')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch couriers:', error)
      throw error
    }
  },

  async getMarket(): Promise<Market> {
    try {
      const response = await fetch('http://localhost:5000/api/market')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch market:', error)
      throw error
    }
  },

  async getNetwork(): Promise<Network> {
    try {
      const response = await fetch('http://localhost:5000/api/network')
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Failed to fetch network:', error)
      throw error
    }
  },
}

