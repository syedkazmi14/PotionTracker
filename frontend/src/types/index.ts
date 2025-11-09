import { z } from 'zod'

export const CauldronSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number(),
  status: z.enum(['online', 'offline', 'warning', 'error']),
  latitude: z.number(),
  longitude: z.number(),
  lastUpdate: z.string(),
  potions: z.number().optional(),
})

export const CauldronDataPointSchema = z.object({
  time: z.string(),
  level: z.number(),
})

export const AnomalySchema = z.object({
  id: z.string(),
  cauldronId: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  message: z.string(),
  timestamp: z.string(),
  resolved: z.boolean(),
})

export const TicketSchema = z.object({
  id: z.string(),
  cauldronId: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['open', 'in-progress', 'resolved']),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// EOG API Ticket Types
export type TransportTicket = {
  ticket_id: string
  cauldron_id: string
  amount_collected: number
  courier_id: string
  date: string
}

export type TicketMetadata = {
  total_tickets: number
  suspicious_tickets: number
  date_range: {
    start: string
    end: string
  }
}

export type TicketsResponse = {
  metadata: TicketMetadata
  transport_tickets: TransportTicket[]
}

export const DiscrepancyDataPointSchema = z.object({
  date: z.string(),
  descrepency: z.number(),
})

export type Cauldron = z.infer<typeof CauldronSchema>
export type CauldronDataPoint = z.infer<typeof CauldronDataPointSchema>
export type Anomaly = z.infer<typeof AnomalySchema>
export type Ticket = z.infer<typeof TicketSchema>
export type DiscrepancyDataPoint = z.infer<typeof DiscrepancyDataPointSchema>
export type DiscrepancyData = Record<string, DiscrepancyDataPoint[]>

// API Response Types
export type CauldronInfo = {
  id: string
  name: string
  latitude: number
  longitude: number
  max_volume: number
}

export type CauldronLevelsData = {
  timestamp: string
  cauldron_levels: Record<string, number>
}

export type TrendLineDataPoint = {
  time: string
  [cauldronId: string]: string | number | null
}

// Forecast Types
export type ForecastPoint = {
  timestamp: string
  level: number
  percentage: number
}

export type Forecast = {
  cauldron_id: string
  current_level: number
  max_volume: number
  current_percentage: number
  brew_rate_liters_per_hour: number
  forecast_points: ForecastPoint[]
  time_to_80_percent: string | null
  time_to_100_percent: string | null
  at_risk_12h: boolean
}

// Schedule Types
export type CourierAssignment = {
  courier: string
  courier_id: string
  route: string[]
  cauldrons_visited: string[]
  start: string
  end: string
  travel_time_minutes: number
  total_time_minutes: number
  volume_collected: number
  distance_km?: number
}

export type DailySchedule = {
  date: string
  couriers_needed: number
  assignments: CourierAssignment[]
  unassigned_pickups?: number
  total_distance_km?: number
}

// Network Types
export type NetworkEdge = {
  from: string
  to: string
  travel_time_minutes: number
}

export type Network = {
  edges: NetworkEdge[]
  description?: string
}

// Courier Types
export type Courier = {
  courier_id?: string
  id?: string
  name: string
  max_carrying_capacity: number
}

// Market Types
export type Market = {
  id: string
  name: string
  latitude: number
  longitude: number
  description?: string
}

