import { Cauldron, CauldronDataPoint, Anomaly, Ticket, DiscrepancyData } from '@/types'
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

  async getDiscrepancyData(): Promise<DiscrepancyData> {
    await new Promise(resolve => setTimeout(resolve, 200))
    // Mock data matching the structure from discrepancyData.json
    return {
      "cauldron_001": [
        { date: "2025-11-01", descrepency: -21.116002404274184 },
        { date: "2025-11-03", descrepency: -19.387655076845363 },
        { date: "2025-11-04", descrepency: -2.3303230515190307 },
        { date: "2025-11-05", descrepency: -7.906483549783616 },
        { date: "2025-11-06", descrepency: -9.658039460539385 },
        { date: "2025-11-07", descrepency: 37.468000938837065 },
        { date: "2025-11-08", descrepency: -22.4367456805482 },
      ],
      "cauldron_002": [
        { date: "2025-10-31", descrepency: -95.91237799386494 },
        { date: "2025-11-02", descrepency: -17.473982450028643 },
        { date: "2025-11-04", descrepency: -28.72195478526993 },
        { date: "2025-11-05", descrepency: -48.27304421265326 },
        { date: "2025-11-07", descrepency: -14.26059608516971 },
        { date: "2025-11-08", descrepency: -16.50910323992798 },
      ],
      "cauldron_003": [
        { date: "2025-10-31", descrepency: -31.179565125183956 },
        { date: "2025-11-01", descrepency: -84.56283640260847 },
        { date: "2025-11-03", descrepency: -26.764545676547584 },
        { date: "2025-11-04", descrepency: -30.302062510564383 },
        { date: "2025-11-05", descrepency: -28.886526986617355 },
        { date: "2025-11-06", descrepency: -30.414296710572444 },
        { date: "2025-11-08", descrepency: -16.824644819466243 },
        { date: "2025-11-09", descrepency: 10.915863328978503 },
      ],
      "cauldron_004": [
        { date: "2025-10-31", descrepency: -26.338383770121027 },
        { date: "2025-11-01", descrepency: -9.875859552407832 },
        { date: "2025-11-03", descrepency: -10.468623817188927 },
        { date: "2025-11-05", descrepency: -22.007873416377322 },
        { date: "2025-11-07", descrepency: -10.49603436762186 },
        { date: "2025-11-08", descrepency: -37.768794151304064 },
      ],
      "cauldron_005": [
        { date: "2025-10-31", descrepency: -69.91963118849591 },
        { date: "2025-11-02", descrepency: -71.99304271508481 },
        { date: "2025-11-04", descrepency: -120.30616273422785 },
        { date: "2025-11-06", descrepency: -23.971763896484845 },
        { date: "2025-11-07", descrepency: -22.59093696863232 },
        { date: "2025-11-08", descrepency: -62.552384152114485 },
      ],
      "cauldron_006": [
        { date: "2025-10-31", descrepency: -22.07171804033885 },
        { date: "2025-11-02", descrepency: -15.659547152194193 },
        { date: "2025-11-03", descrepency: -17.053420523723872 },
        { date: "2025-11-04", descrepency: -67.9003285932981 },
        { date: "2025-11-06", descrepency: -15.800275117349258 },
        { date: "2025-11-07", descrepency: -17.522171301948788 },
        { date: "2025-11-08", descrepency: -15.63993618179552 },
        { date: "2025-11-09", descrepency: -17.242129537465786 },
      ],
      "cauldron_007": [
        { date: "2025-10-30", descrepency: -35.742004175355646 },
        { date: "2025-11-01", descrepency: -29.098838613620387 },
        { date: "2025-11-02", descrepency: -24.31005136916292 },
        { date: "2025-11-03", descrepency: -43.08591258741444 },
        { date: "2025-11-04", descrepency: -31.826305661345145 },
        { date: "2025-11-05", descrepency: -31.403944610036206 },
        { date: "2025-11-06", descrepency: -25.571210536860008 },
        { date: "2025-11-07", descrepency: -24.916324516167947 },
        { date: "2025-11-09", descrepency: 9.355174224327698 },
      ],
      "cauldron_008": [
        { date: "2025-10-30", descrepency: 3.1874343872444513 },
        { date: "2025-10-31", descrepency: -22.043192823826786 },
        { date: "2025-11-01", descrepency: -17.881601085432564 },
        { date: "2025-11-02", descrepency: -46.37698997729477 },
        { date: "2025-11-03", descrepency: 15.712169843579233 },
        { date: "2025-11-04", descrepency: -43.8179197517176 },
        { date: "2025-11-05", descrepency: -28.367491344872576 },
        { date: "2025-11-06", descrepency: -31.012200560045898 },
        { date: "2025-11-08", descrepency: -9.116033679069844 },
        { date: "2025-11-09", descrepency: -19.247325412405928 },
      ],
      "cauldron_009": [
        { date: "2025-11-01", descrepency: -113.3188539536689 },
        { date: "2025-11-03", descrepency: -63.001440457204126 },
        { date: "2025-11-04", descrepency: -118.80011669132546 },
        { date: "2025-11-06", descrepency: -99.93507139468875 },
        { date: "2025-11-07", descrepency: -98.04172200535606 },
        { date: "2025-11-09", descrepency: -60.042085156327516 },
      ],
      "cauldron_010": [
        { date: "2025-10-30", descrepency: -76.12962729389989 },
        { date: "2025-11-01", descrepency: -96.72806151776666 },
        { date: "2025-11-04", descrepency: -18.81647844747829 },
        { date: "2025-11-05", descrepency: -19.244937771223704 },
        { date: "2025-11-06", descrepency: -19.268402349773396 },
        { date: "2025-11-07", descrepency: -18.824285437123933 },
        { date: "2025-11-08", descrepency: -13.383111147330453 },
        { date: "2025-11-09", descrepency: -39.790503498807 },
      ],
      "cauldron_011": [
        { date: "2025-10-30", descrepency: -56.1344442502226 },
        { date: "2025-10-31", descrepency: -18.0989874726086 },
        { date: "2025-11-02", descrepency: -28.703083483161237 },
        { date: "2025-11-03", descrepency: -119.24185558505212 },
        { date: "2025-11-05", descrepency: -15.573871365844127 },
        { date: "2025-11-06", descrepency: -33.34648440976764 },
        { date: "2025-11-07", descrepency: -78.01848140422607 },
        { date: "2025-11-09", descrepency: -74.83236650556685 },
      ],
      "cauldron_012": [
        { date: "2025-10-30", descrepency: -5.181527516189732 },
        { date: "2025-11-01", descrepency: -27.331419493827894 },
        { date: "2025-11-02", descrepency: -8.493518174990527 },
        { date: "2025-11-04", descrepency: -24.827535019560628 },
        { date: "2025-11-06", descrepency: -19.149044892279846 },
        { date: "2025-11-07", descrepency: -20.610126132925757 },
        { date: "2025-11-08", descrepency: -35.373642764014846 },
      ],
    }
  },
}

