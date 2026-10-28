'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export type EventEditor =
  | { kind: 'create'; date: string }
  | { kind: 'edit'; eventId: string }
  | null

type ScheduleUiState = {
  eventEditor: EventEditor
  openCreate: (date: string) => void
  openEdit: (eventId: string) => void
  closeEventEditor: () => void
  reset: () => void
}

function createScheduleUiStore() {
  return createStore<ScheduleUiState>(set => ({
    eventEditor: null,
    openCreate: date => set({ eventEditor: { kind: 'create', date } }),
    openEdit: eventId => set({ eventEditor: { kind: 'edit', eventId } }),
    closeEventEditor: () => set({ eventEditor: null }),
    reset: () => set({ eventEditor: null })
  }))
}

const ScheduleUiContext = createContext<StoreApi<ScheduleUiState> | null>(null)

export function ScheduleUiProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createScheduleUiStore)
  return <ScheduleUiContext.Provider value={store}>{children}</ScheduleUiContext.Provider>
}

export function useScheduleUiStore<T>(selector: (state: ScheduleUiState) => T) {
  const store = useContext(ScheduleUiContext)
  if (!store) throw new Error('ScheduleUiProvider is missing')
  return useStore(store, selector)
}
