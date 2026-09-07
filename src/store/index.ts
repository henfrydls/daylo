import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Activity, ActivityLog } from '../types'
import { generateId } from '../lib/dates'

type ViewType = 'year' | 'month'
type ViewTransitionDirection = 'drill-down' | 'drill-up' | null

// Deferred localStorage adapter for optimistic UI
// UI updates immediately, persistence happens during idle time
const createDeferredStorage = (): StateStorage => {
  let pendingWrite: string | null = null
  let pendingKey: string | null = null
  let scheduledWrite: ReturnType<typeof setTimeout> | number | null = null
  let useIdleCallback = false
  let failureReported = false

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
        // Solo se descarta el pendiente cuando de verdad se escribio. Si falla se
        // conserva para que el siguiente flush lo reintente.
        pendingWrite = null
        pendingKey = null
      } catch (error) {
        // No se silencia: perder datos sin avisar es lo peor que puede hacer una app
        // cuyo argumento es que tus datos son tuyos.
        console.error('[Daylo] No se pudieron guardar los cambios en localStorage:', error)
        if (!failureReported) {
          failureReported = true
          // Import perezoso para no acoplar el storage al arranque del store de avisos.
          import('./toast')
            .then(({ useToastStore }) => {
              useToastStore
                .getState()
                .addToast('No se pudieron guardar tus cambios. Exporta tus datos por seguridad.', 'error')
            })
            .catch(() => {
              /* si ni el aviso carga, el console.error de arriba es lo que queda */
            })
        }
      }
    }
    scheduledWrite = null
  }

  // Red de seguridad: al ocultarse o cerrarse la app hay que escribir YA, sincronicamente.
  // Sin esto, un cierre dentro de la ventana del idle callback pierde el ultimo cambio, que
  // es justo el flujo principal (abrir, marcar el dia, cerrar). En el WebView de Android
  // 'beforeunload' no es fiable; 'pagehide' y visibilitychange->hidden si llegan.
  if (typeof window !== 'undefined') {
    const flushNow = () => {
      if (pendingWrite !== null && pendingKey !== null) {
        cancelScheduledWrite()
        flushWrite(pendingKey)
      }
    }
    window.addEventListener('pagehide', flushNow)
    window.addEventListener('visibilitychange', () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        flushNow()
      }
    })
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
      pendingKey = name

      // Cancel any existing scheduled write
      cancelScheduledWrite()

      // Se sigue difiriendo para que la UI responda al instante, pero con una ventana
      // corta: 1000 ms dejaba un hueco grande de perdida con las animaciones ocupando
      // el hilo. Serializar en cada toggle seria peor con anos de historial acumulado.
      if (useIdleCallback) {
        scheduledWrite = window.requestIdleCallback(() => flushWrite(name), { timeout: 200 })
      } else {
        // Fallback for browsers without requestIdleCallback or Node.js
        scheduledWrite = setTimeout(() => flushWrite(name), 0)
      }
    },
    removeItem: (name: string): void => {
      pendingWrite = null
      pendingKey = null
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
  _hasHydrated: boolean
  _viewTransitionDirection: ViewTransitionDirection

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
  setCurrentView: (view: ViewType, direction?: ViewTransitionDirection) => void
  setSelectedMonth: (month: number) => void
  navigateToMonth: (year: number, month: number) => void

  // Hydration
  setHasHydrated: (value: boolean) => void

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
      currentView: (typeof window !== 'undefined' && window.innerWidth < 640
        ? 'month'
        : 'year') as ViewType,
      selectedMonth: new Date().getMonth(),
      _hasHydrated: false,
      _viewTransitionDirection: null as ViewTransitionDirection,

      setHasHydrated: (value: boolean) => set({ _hasHydrated: value }),

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
      setCurrentView: (view, direction) =>
        set({ currentView: view, _viewTransitionDirection: direction ?? null }),
      setSelectedMonth: (month) => set({ selectedMonth: month }),
      navigateToMonth: (year, month) =>
        set({
          selectedYear: year,
          selectedMonth: month,
          currentView: 'month',
          _viewTransitionDirection: 'drill-down',
        }),

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
      partialize: (state) => ({
        activities: state.activities,
        logs: state.logs,
        selectedYear: state.selectedYear,
        selectedDate: state.selectedDate,
        currentView: state.currentView,
        selectedMonth: state.selectedMonth,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
