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

