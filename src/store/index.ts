import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Activity, ActivityLog } from '../types'
import { formatDate, generateId } from '../lib/dates'
// Import estatico a proposito: Toast.tsx ya importa este modulo de forma estatica,
// asi que un import() dinamico aqui no partiria el bundle -- solo retrasaria el aviso.
import { useToastStore } from './toast'

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
          useToastStore
            .getState()
            .addToast(
              'No se pudieron guardar tus cambios. Exporta tus datos por seguridad.',
              'error'
            )
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

      // El diferido coalesce escrituras a localStorage: la durabilidad no depende de
      // esta ventana, sino del flush de 'pagehide' y visibilitychange de arriba, asi que
      // conviene que sea holgada. Con una ventana corta cada clic de navegacion
      // (cambiar de mes, de vista, elegir un dia) acaba en una escritura propia, porque
      // partialize tambien persiste esos campos.
      //
      // Ojo: esto NO ahorra serializacion. createJSONStorage hace el JSON.stringify de
      // forma sincrona en cada set(), antes de llamar a este adaptador; lo que se
      // coalesce es la escritura en disco, nada mas.
      if (useIdleCallback) {
        scheduledWrite = window.requestIdleCallback(() => flushWrite(name), { timeout: 1000 })
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
  /**
   * How the year reads: everything in one heatmap, or a row per activity. Persisted,
   * because somebody who prefers one should not have to say so after every reload.
   */
  yearMode: 'all' | 'byActivity'
  selectedMonth: number
  _hasHydrated: boolean
  _viewTransitionDirection: ViewTransitionDirection

  /**
   * The daily reminder. Off until asked for, and only ever on Android: the setting is
   * hidden everywhere else. reminderOffered records that the one-time question has been
   * put, so that saying "not now" is not re-asked on the next activity, or the one after.
   */
  reminderEnabled: boolean
  reminderHour: number
  reminderMinute: number
  reminderOffered: boolean

  /**
   * The first day this installation was opened, local, `YYYY-MM-DD`. Written once and
   * never again, so it says how long the app has been on this device rather than how
   * recently it was used. Somebody updating from 1.2 gets the day they updated, which is
   * the earliest thing that can honestly be said about them.
   *
   * It answers two different questions and on purpose: for the check-in it is about this
   * installation, and for the invitation it is one half of "how long has this person
   * lived with Daylo", the other half being the oldest record they hold.
   */
  firstOpenedAt: string | null
  /** Whether the two-week invitation has been put. One invitation, not one drawing. */
  feedbackInviteSeen: boolean

  /** Whether the check-in is on. Off unless somebody said otherwise. */
  checkinEnabled: boolean
  /**
   * The random number this installation uses, made here and tied to nothing. It exists
   * only while the check-in is on: turning it off deletes it, and turning it on again
   * makes a new one, so the two seasons cannot be joined by anyone, us included.
   */
  checkinId: string | null
  /**
   * The last time Daylo tried to send, whether or not it arrived. It is what keeps
   * "once a day at most" true across launches, and what the settings sheet reports.
   * There is no queue behind it: a try is recorded and the day is spent.
   */
  checkinLastAttempt: { date: string; at: string; ok: boolean } | null

  /**
   * Whether anything was ticked or unticked in this session. Not persisted: it exists so
   * the invitation can appear while the day sheet still covers the screen, and a session
   * that has not touched a day has not opened that sheet.
   */
  _loggedThisSession: boolean
  /**
   * Which of the three one-time offers has already been made in this session, if any.
   * Not persisted. Three things want the same moment and none may talk over another.
   */
  _offerThisSession: 'reminder' | 'checkin' | null

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
  setYearMode: (mode: 'all' | 'byActivity') => void
  setSelectedMonth: (month: number) => void
  navigateToMonth: (year: number, month: number) => void

  // Reminder
  setReminder: (enabled: boolean, hour?: number, minute?: number) => void
  markReminderOffered: () => void
  /** Records the first day, once. Called when the store finishes hydrating. */
  markOpened: () => void
  markFeedbackInviteSeen: () => void
  /** Takes this session's offer slot, if nobody has taken it. */
  claimOffer: (kind: 'reminder' | 'checkin') => void

  // Check-in
  /** The switch and the number together, because they are one fact. */
  setCheckin: (enabled: boolean, id: string | null) => void
  recordCheckinAttempt: (date: string, at: string, ok: boolean) => void

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
      // Month, everywhere. The year view answers "how did the year go"; the month view is
      // where a person ticks today off, which is what they open the app to do. This used
      // to depend on the window being narrower than 640px, so the same person got a
      // different first screen on their phone and on their laptop.
      //
      // Only a fresh install sees it. currentView is persisted, and anything that touches
      // the store writes the whole persisted slice, so anyone who has ever used Daylo
      // already has a view stored and keeps it. That is deliberate: changing it for them
      // would overrule a choice some of them made on purpose, and there is no way to tell
      // those apart from the ones who never touched the toggle.
      currentView: 'month' as ViewType,
      yearMode: 'all' as const,
      selectedMonth: new Date().getMonth(),
      _hasHydrated: false,
      _viewTransitionDirection: null as ViewTransitionDirection,

      reminderEnabled: false,
      // Nine in the evening: late enough that the day has happened, early enough not to
      // land after somebody has gone to sleep.
      reminderHour: 21,
      reminderMinute: 0,
      reminderOffered: false,

      firstOpenedAt: null,
      feedbackInviteSeen: false,
      checkinEnabled: false,
      checkinId: null,
      checkinLastAttempt: null,
      _loggedThisSession: false,
      _offerThisSession: null,

      setReminder: (enabled, hour, minute) =>
        set((state) => ({
          reminderEnabled: enabled,
          reminderHour: hour ?? state.reminderHour,
          reminderMinute: minute ?? state.reminderMinute,
        })),

      markReminderOffered: () => set({ reminderOffered: true }),

      // Once, and never again: the second call has to be a no-op or the field would mean
      // "the last day the app was opened", which is a different fact and not the one
      // anything here asks for.
      markOpened: () =>
        set((state) =>
          state.firstOpenedAt === null ? { firstOpenedAt: formatDate(new Date()) } : {}
        ),

      markFeedbackInviteSeen: () => set({ feedbackInviteSeen: true }),

      claimOffer: (kind) =>
        set((state) => (state._offerThisSession === null ? { _offerThisSession: kind } : {})),

      // Off clears everything the season produced, in the same set as the switch itself:
      // there is no instant in which the check-in is off and the number it was using is
      // still on disk, and none in which Daylo remembers when it last spoke to a server
      // it is no longer speaking to.
      setCheckin: (enabled, id) =>
        set(
          enabled
            ? { checkinEnabled: true, checkinId: id }
            : { checkinEnabled: false, checkinId: null, checkinLastAttempt: null }
        ),

      recordCheckinAttempt: (date, at, ok) => set({ checkinLastAttempt: { date, at, ok } }),

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
        // Whatever else this does, the session has now touched a day. The invitation
        // needs that: it mounts behind the day sheet, and this is what says the sheet is
        // open. Unticking counts too — the app was used either way.
        set({ _loggedThisSession: true })
        const existingLog = get().logs.find((l) => l.activityId === activityId && l.date === date)

        if (existingLog) {
          // Se opera sobre TODOS los registros de ese dia y actividad, no solo sobre el
          // que devolvio find: un dispositivo puede arrastrar duplicados de un import
          // hecho antes de que mergeData deduplicara por actividad y dia, y si el clic
          // solo tocara uno, el dia se quedaria verde despues de desmarcarlo.
          const esDeEsteDia = (l: ActivityLog) => l.activityId === activityId && l.date === date

          if (existingLog.completed) {
            // Al desmarcar, los registros sin notas se borran en vez de guardarse con
            // completed:false. Un dia desmarcado y sin contenido del usuario no
            // representa nada que quiera conservar, y cada registro cuenta contra la
            // cuota de localStorage. Los que tengan notas se conservan desmarcados: la
            // nota si es contenido suyo.
            set((state) => ({
              logs: state.logs
                .filter((l) => !(esDeEsteDia(l) && !l.notes?.trim()))
                .map((l) => (esDeEsteDia(l) ? { ...l, completed: false } : l)),
            }))
            return
          }

          // Al marcar se COLAPSA en vez de propagar. Poner completed:true en todos los
          // registros del dia haria que el heatmap contara el dia dos veces y pintara un
          // nivel que no corresponde -- el mismo defecto que este cambio arregla, pero al
          // marcar. Se marca solo el registro encontrado y se descartan los duplicados
          // sin notas; los que tengan notas se conservan como esten, porque la nota es
          // contenido del usuario.
          set((state) => ({
            logs: state.logs
              .filter((l) => !(esDeEsteDia(l) && l.id !== existingLog.id && !l.notes?.trim()))
              .map((l) => (l.id === existingLog.id ? { ...l, completed: true } : l)),
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
      setYearMode: (mode) => set({ yearMode: mode }),

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
        yearMode: state.yearMode,
        selectedMonth: state.selectedMonth,
        reminderEnabled: state.reminderEnabled,
        reminderHour: state.reminderHour,
        reminderMinute: state.reminderMinute,
        reminderOffered: state.reminderOffered,
        firstOpenedAt: state.firstOpenedAt,
        feedbackInviteSeen: state.feedbackInviteSeen,
        checkinEnabled: state.checkinEnabled,
        checkinId: state.checkinId,
        checkinLastAttempt: state.checkinLastAttempt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
