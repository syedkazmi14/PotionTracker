import { create } from 'zustand'
import { DateTime } from 'luxon'

interface FilterState {
  timeRange: {
    start: DateTime
    end: DateTime
  }
  status: string[]
  selectedCauldron: string | null
  setTimeRange: (start: DateTime, end: DateTime) => void
  setStatus: (status: string[]) => void
  setSelectedCauldron: (id: string | null) => void
}

export const useStore = create<FilterState>((set) => ({
  timeRange: {
    start: DateTime.now().minus({ days: 1 }),
    end: DateTime.now(),
  },
  status: [],
  selectedCauldron: null,
  setTimeRange: (start, end) => set({ timeRange: { start, end } }),
  setStatus: (status) => set({ status }),
  setSelectedCauldron: (id) => set({ selectedCauldron: id }),
}))

