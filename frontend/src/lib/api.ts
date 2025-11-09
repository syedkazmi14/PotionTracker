import { Cauldron, CauldronDataPoint, Anomaly, Ticket } from '@/types'
import { DateTime } from 'luxon'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Mock data
const mockCauldrons: Cauldron[] = [
  {
    id: '1',
    name: 'Cauldron Alpha',
    level: 85,
    status: 'online',
    latitude: 32.7767,
    longitude: -96.7970,
    lastUpdate: DateTime.now().toISO(),
    potions: 42,
  },
  {
    id: '2',
    name: 'Cauldron Beta',
    level: 45,
    status: 'warning',
    latitude: 32.7800,
    longitude: -96.8000,
    lastUpdate: DateTime.now().minus({ minutes: 5 }).toISO(),
    potions: 18,
  },
  {
    id: '3',
    name: 'Cauldron Gamma',
    level: 12,
    status: 'error',
    latitude: 32.7700,
    longitude: -96.7900,
    lastUpdate: DateTime.now().minus({ minutes: 15 }).toISO(),
    potions: 3,
  },
  {
    id: '4',
    name: 'Cauldron Delta',
    level: 92,
    status: 'online',
    latitude: 32.7750,
    longitude: -96.7950,
    lastUpdate: DateTime.now().toISO(),
    potions: 55,
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
    await new Promise(resolve => setTimeout(resolve, 200))
    return generateMockDataPoints(id, hours)
  },

  async getAnomalies(cauldronId?: string): Promise<Anomaly[]> {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (cauldronId) {
      return mockAnomalies.filter(a => a.cauldronId === cauldronId)
    }
    return [...mockAnomalies]
  },

  async getTickets(cauldronId?: string): Promise<Ticket[]> {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (cauldronId) {
      return mockTickets.filter(t => t.cauldronId === cauldronId)
    }
    return [...mockTickets]
  },
}

