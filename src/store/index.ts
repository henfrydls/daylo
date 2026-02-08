import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Activity, ActivityLog } from '../types'
import { generateId } from '../lib/dates'

type ViewType = 'year' | 'month'

// Deferred localStorage adapter for optimistic UI
// UI updates immediately, persistence happens during idle time
const createDeferredStorage = (): StateStorage => {
  let pendingWrite: string | null = null
  let scheduledWrite: ReturnType<typeof setTimeout> | number | null = null
  let useIdleCallback = false

  // Check if requestIdleCallback is available (browser environment)
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    useIdleCallback = true
  }

  const cancelScheduledWrite = () => {
    if (scheduledWrite !== null) {
      if (useIdleCallback) {
        window.cancelIdleCallback(scheduledWrite as number)
      } else {
        clearTimeout(scheduledWrite as ReturnType<typeof setTimeout>)
      }
      scheduledWrite = null
    }
  }

  const flushWrite = (key: string) => {
    if (pendingWrite !== null) {
      try {
        localStorage.setItem(key, pendingWrite)
      } catch {
        // Ignore storage errors
      }
      pendingWrite = null
    }
    scheduledWrite = null
  }

  return {
    getItem: (name: string): string | null => {
      // If we have a pending write, return that value for consistency
      if (pendingWrite !== null) {
        return pendingWrite
      }
      return localStorage.getItem(name)
    },
    setItem: (name: string, value: string): void => {
      pendingWrite = value

      // Cancel any existing scheduled write
      cancelScheduledWrite()

      // Schedule write during idle time for instant UI response
      if (useIdleCallback) {
        scheduledWrite = window.requestIdleCallback(() => flushWrite(name), { timeout: 1000 })
      } else {
        // Fallback for browsers without requestIdleCallback or Node.js
        scheduledWrite = setTimeout(() => flushWrite(name), 0)
      }
    },
    removeItem: (name: string): void => {
      pendingWrite = null
      cancelScheduledWrite()
      localStorage.removeItem(name)
    },
  }
}

interface CalendarState {
  activities: Activity[]
  logs: ActivityLog[]
  selectedYear: number
  selectedDate: string | null
  currentView: ViewType
  selectedMonth: number

  // Activity actions
  addActivity: (name: string, color: string) => void
  updateActivity: (id: string, updates: Partial<Pick<Activity, 'name' | 'color'>>) => void
  deleteActivity: (id: string) => void

  // Log actions
  toggleLog: (activityId: string, date: string) => void
  updateLogNotes: (logId: string, notes: string) => void

  // Navigation
  setSelectedYear: (year: number) => void
  setSelectedDate: (date: string | null) => void
  setCurrentView: (view: ViewType) => void
  setSelectedMonth: (month: number) => void
  navigateToMonth: (year: number, month: number) => void

  // Helpers
  getLogsForDate: (date: string) => ActivityLog[]
  getLogsForActivity: (activityId: string) => ActivityLog[]
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      activities: [],
      logs: [],
      selectedYear: new Date().getFullYear(),
      selectedDate: null,
      currentView: 'year' as ViewType,
      selectedMonth: new Date().getMonth(),

      addActivity: (name, color) => {
        const now = new Date().toISOString()
        const newActivity: Activity = {
          id: generateId(),
          name,
          color,
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({
          activities: [...state.activities, newActivity],
        }))
      },

      updateActivity: (id, updates) => {
        set((state) => ({
          activities: state.activities.map((activity) =>
            activity.id === id
              ? { ...activity, ...updates, updatedAt: new Date().toISOString() }
              : activity
          ),
        }))
      },

      deleteActivity: (id) => {
        set((state) => ({
          activities: state.activities.filter((a) => a.id !== id),
          logs: state.logs.filter((l) => l.activityId !== id),
        }))
      },

      toggleLog: (activityId, date) => {
        const existingLog = get().logs.find((l) => l.activityId === activityId && l.date === date)

        if (existingLog) {
          set((state) => ({
            logs: state.logs.map((l) =>
              l.id === existingLog.id ? { ...l, completed: !l.completed } : l
            ),
          }))
        } else {
          const newLog: ActivityLog = {
            id: generateId(),
            activityId,
            date,
            completed: true,
            createdAt: new Date().toISOString(),
          }
          set((state) => ({
            logs: [...state.logs, newLog],
          }))
        }
      },

      updateLogNotes: (logId, notes) => {
        set((state) => ({
          logs: state.logs.map((l) => (l.id === logId ? { ...l, notes } : l)),
        }))
      },

      setSelectedYear: (year) => set({ selectedYear: year }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      setCurrentView: (view) => set({ currentView: view }),
      setSelectedMonth: (month) => set({ selectedMonth: month }),
      navigateToMonth: (year, month) =>
        set({ selectedYear: year, selectedMonth: month, currentView: 'month' }),

      getLogsForDate: (date) => {
        return get().logs.filter((l) => l.date === date && l.completed)
      },

      getLogsForActivity: (activityId) => {
        return get().logs.filter((l) => l.activityId === activityId && l.completed)
      },
    }),
    {
      name: 'simple-calendar-storage',
      storage: createJSONStorage(() => createDeferredStorage()),
    }
  )
)
