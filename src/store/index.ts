import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Activity, ActivityLog } from '../types'
import { generateId } from '../lib/dates'

interface CalendarState {
  activities: Activity[]
  logs: ActivityLog[]
  selectedYear: number
  selectedDate: string | null

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
        const existingLog = get().logs.find(
          (l) => l.activityId === activityId && l.date === date
        )

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

      getLogsForDate: (date) => {
        return get().logs.filter((l) => l.date === date && l.completed)
      },

      getLogsForActivity: (activityId) => {
        return get().logs.filter((l) => l.activityId === activityId && l.completed)
      },
    }),
    {
      name: 'simple-calendar-storage',
    }
  )
)
