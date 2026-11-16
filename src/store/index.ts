import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import type { Activity, ActivityLog } from '../types'
import { formatDate, generateId, parseDateString } from '../lib/dates'
import { firstFreeColor } from '../lib/colors'
// Import estatico a proposito: Toast.tsx ya importa este modulo de forma estatica,
// asi que un import() dinamico aqui no partiria el bundle -- solo retrasaria el aviso.
import { useToastStore } from './toast'
import { useRescueStore, whatIsOnDisk } from './rescue'

/**
 * Where everything lives. Named rather than written twice: the rescue path reads the same
 * key straight off the disk, and two spellings of it would mean the screen that hands back
 * your data could hand back somebody else's nothing.
 */
export const STORAGE_KEY = 'simple-calendar-storage'

/**
 * The version of what this build writes. 0, which is also zustand's default.
 *
 * A value stored under any other version, older or newer, is refused by `migrate` below
 * and goes to the rescue screen: this build does not know what it holds, so it neither
 * opens it nor writes over it.
 */
export const PERSIST_VERSION = 0

/**
 * Whether what is on the disk, which did not open as a state, has anything to lose (#221).
 *
 * - Bytes that are not JSON at all: yes. A truncated value can have every day in it.
 * - JSON with a non-empty `activities` or `logs`, at the top or under `state`: yes.
 * - `checkinEnabled: false`, at the top or under `state`: yes. The person turned the
 *   check-in off, and opening this as a new installation would turn it back on against
 *   what they chose.
 * - Anything else, such as `null`, `{}` or `{"state":null}`: no. Opening it as a new
 *   installation loses nothing, and the rescue screen would say there is data where there
 *   is none, on every launch, with no way past it.
 */
export function worthRescuing(raw: string | null): boolean {
  if (raw === null) return false
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return true
  }
  if (typeof value !== 'object' || value === null) return false
  const top = value as Record<string, unknown>
  const state =
    typeof top.state === 'object' && top.state !== null
      ? (top.state as Record<string, unknown>)
      : {}
  const holds = (field: unknown) => Array.isArray(field) && field.length > 0
  if ([top.activities, top.logs, state.activities, state.logs].some(holds)) return true
  return top.checkinEnabled === false || state.checkinEnabled === false
}

/**
 * What Daylo says when the disk refuses a write. Agreed word for word: it is the one
 * moment Daylo knows it is about to lose something and can still prevent it, because what
 * was not written is still in memory and Export still works.
 */
export const COULD_NOT_SAVE =
  'Daylo could not save your last changes. Open Settings and export a backup so nothing is lost.'

/**
 * How long a closed notice about failed writes stays closed while the writes go on failing,
 * counted from when the person closed it. Once per tap would bury the screen; never again
 * would leave somebody losing changes all day because they closed one notice in the morning.
 */
const SAY_IT_AGAIN_AFTER_MS = 5 * 60_000

type ViewType = 'year' | 'month'
type ViewTransitionDirection = 'drill-down' | 'drill-up' | null

// Deferred localStorage adapter for optimistic UI
// UI updates immediately, persistence happens during idle time
const createDeferredStorage = (): StateStorage => {
  let pendingWrite: string | null = null
  let pendingKey: string | null = null
  let scheduledWrite: ReturnType<typeof setTimeout> | number | null = null
  let useIdleCallback = false
  // The notice about failed writes, while it is on the screen.
  let noticeId: string | null = null
  // When the person closed it, during a run of failures. Null when there is no run: before
  // the first failure, and again after any write that goes through.
  let noticeClosedAt: number | null = null
  let stopWatchingNotice: (() => void) | null = null

  const stopWatching = () => {
    stopWatchingNotice?.()
    stopWatchingNotice = null
  }

  const showNotice = () => {
    noticeClosedAt = null
    noticeId = useToastStore.getState().addToast(COULD_NOT_SAVE, 'error', { untilDismissed: true })
    // Watched so that the five minutes start when it goes, which is when the person closed
    // it: nothing else takes it down while the writes keep failing.
    stopWatchingNotice = useToastStore.subscribe((state) => {
      if (noticeId !== null && !state.toasts.some((t) => t.id === noticeId)) {
        noticeId = null
        noticeClosedAt = Date.now()
        stopWatching()
      }
    })
  }

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

  // The rescue screen came up: whatever was waiting to be written is dropped, not written
  // later. It was queued before anything knew the disk held something this build could
  // not read, and the flushes on idle, pagehide and visibilitychange would otherwise
  // still put it there.
  useRescueStore.subscribe((state) => {
    if (state.failure !== null) {
      pendingWrite = null
      pendingKey = null
      cancelScheduledWrite()
    }
  })

  const flushWrite = (key: string) => {
    if (useRescueStore.getState().failure !== null) {
      pendingWrite = null
      pendingKey = null
      scheduledWrite = null
      return
    }
    if (pendingWrite !== null) {
      try {
        localStorage.setItem(key, pendingWrite)
        // The pending value is only dropped once it has really been written. If the write
        // fails it is kept, so the next flush tries it again.
        pendingWrite = null
        pendingKey = null
        // The disk works again: a notice still asking for a backup is no longer true, and
        // if it fails after this, that is news, and is said again.
        stopWatching()
        if (noticeId !== null) useToastStore.getState().removeToast(noticeId)
        noticeId = null
        noticeClosedAt = null
      } catch (error) {
        // Not swallowed: losing data without a word is the worst thing an app can do when
        // its whole case is that your data is yours.
        console.error('[Daylo] Could not save changes to localStorage:', error)
        // Once per run of failures, not once per tap: every tap is another write. Never a
        // second copy over one still on the screen. Again if the person closed it and the
        // writes still fail five minutes after they did. A clock put back since then makes
        // the time negative, and that counts as long enough: otherwise the notice would
        // stay quiet for as long as the clock moved.
        const sinceClosed = noticeClosedAt === null ? null : Date.now() - noticeClosedAt
        const closedLongEnough =
          sinceClosed === null || sinceClosed < 0 || sinceClosed >= SAY_IT_AGAIN_AFTER_MS
        if (noticeId === null && closedLongEnough) showNotice()
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
      // Nothing is written while the rescue screen is up. Whatever is on the disk is the
      // only copy, and hooks still run behind that screen: the new day at midnight calls
      // set(), and persist turns every set() into a write here. Dropping it at the one
      // door every write goes through covers that and anything added later.
      if (useRescueStore.getState().failure !== null) return
      pendingWrite = value
      pendingKey = name

      // Cancel any existing scheduled write
      cancelScheduledWrite()

      // The deferral coalesces writes to localStorage. Durability does not depend on this
      // window but on the 'pagehide' and visibilitychange flush above, so it can be
      // generous. With a short one every navigation tap (another month, the other view, a
      // day) ends in a write of its own: persist writes on every set(), even one that only
      // changes fields partialize leaves out.
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
      if (useRescueStore.getState().failure !== null) return
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
   * Whether the time came from the person rather than from us.
   *
   * The offer proposes the next hour on the hour, which is right for somebody who has
   * never thought about it and wrong for somebody who went into Settings and picked one
   * before the offer was ever put. This is how those two are told apart.
   */
  reminderTimeChosen: boolean

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
  /** Whether the invitation to write has been put. One invitation, not one drawing. */
  feedbackInviteSeen: boolean
  /**
   * Whether this copy has already been pointed at the Microsoft Store's own rating.
   * Once per installation: a second ask is nagging, and the first one was either taken
   * or deliberately ignored.
   */
  storeReviewOffered: boolean

  /**
   * Whether the check-in is on. On from the first launch of a new installation, off for
   * anybody updating from a version that promised the app sent nothing.
   */
  checkinEnabled: boolean
  /** Whether the one-line notice about the check-in has been shown. Once per install. */
  checkinNoticeSeen: boolean
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
   * Which of the one-time offers has already been made in this session, if any.
   * Not persisted. Several things want the same moment and none may talk over another.
   */
  _offerThisSession: 'reminder' | 'checkin' | null
  /**
   * What the stored state says about the check-in, decided once while hydrating and not
   * persisted:
   *
   *   'new'      nothing was stored at all, so this is a new installation
   *   'update'   something was stored, from before the check-in existed
   *   'decided'  something was stored and it carries a decision to respect
   *
   * The difference matters because the default is not the same for everybody. A new
   * installation starts with the check-in on and is told so. Somebody updating installed
   * Daylo under "it sends nothing anywhere", and that promise is not withdrawn behind
   * their back: they stay off and are invited instead.
   */
  _checkinStart: 'new' | 'update' | 'decided'
  /**
   * Whether the check-in notice has been shown in this session. Not persisted, and it
   * exists because showing the line is what marks it seen: without this, the condition
   * that put it there would answer no a moment later and take it off the screen.
   */
  _checkinNoticeShown: boolean
  /**
   * Whether the question has been put in this session. Not persisted, and it is here for
   * the same reason as the flag above: putting the question is what spends it, so the
   * condition that opened it answers no a moment later and would close it again.
   */
  _feedbackAsked: boolean
  /**
   * The version whose update card has already been shown, or null. Persisted, and by
   * version rather than as a flag: the card is put once per release, so dismissing 1.5.0
   * must not also dismiss 1.5.1.
   *
   * Showing it is what spends it, the way the check-in's line works. The X means "later",
   * and later is the dot on the menu, not the card coming back.
   */
  updateNoticeSeenFor: string | null
  /**
   * Whether Daylo asks GitHub about newer versions. On by default, and that default is
   * the decision: the alternative needed a line offering to turn it on, which is the kind
   * of line this app was told not to have.
   */
  updatesEnabled: boolean

  // Activity actions
  /**
   * Without a color, the activity gets the first one nobody wears yet, the same one the
   * forms offer. The rule lives here so that any way of making an activity follows it.
   */
  addActivity: (name: string, color?: string) => void
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
  /**
   * The day changed with the app open: Month, on the month that holds it, with no sheet.
   * Given the day that was applied, `YYYY-MM-DD`, so there is one answer to what it is.
   */
  startNewDay: (day: string) => void

  // Reminder
  setReminder: (enabled: boolean, hour?: number, minute?: number) => void
  markReminderOffered: () => void
  markReminderTimeChosen: () => void
  /** Records the first day, once. Called when the store finishes hydrating. */
  markOpened: () => void
  markFeedbackInviteSeen: () => void
  markStoreReviewOffered: () => void
  /** The question was put. Spends it for good and keeps it open for this session. */
  markFeedbackAsked: () => void
  /** The update card for this version has been put. */
  markUpdateNoticeSeen: (version: string) => void
  setUpdatesEnabled: (enabled: boolean) => void
  /** Takes this session's offer slot, if nobody has taken it. */
  claimOffer: (kind: 'reminder' | 'checkin') => void

  // Check-in
  /** The switch and the number together, because they are one fact. */
  setCheckin: (enabled: boolean, id: string | null) => void
  recordCheckinAttempt: (date: string, at: string, ok: boolean) => void
  markCheckinNoticeSeen: () => void

  // Hydration
  setHasHydrated: (value: boolean) => void

  // Helpers
  getLogsForDate: (date: string) => ActivityLog[]
  getLogsForActivity: (activityId: string) => ActivityLog[]
}

const OPENED_AT = new Date()

/**
 * Where somebody is, as opposed to what they have. None of these is written to disk, and
 * merge drops each of them on the way in, because every copy installed before 1.5.3 has
 * them stored. One list for both halves, so the next place added to the store cannot be
 * left out of one of them; `src/store/open-on-today.test.ts` checks both against it.
 */
export const WHERE_SOMEBODY_IS = [
  'selectedDate',
  'selectedMonth',
  'selectedYear',
  'currentView',
] as const satisfies readonly (keyof CalendarState)[]

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      activities: [],
      logs: [],
      // One reading of the clock for both, so a store built in the last instant of
      // December cannot come up with this year's December's month and next year's year.
      selectedYear: OPENED_AT.getFullYear(),
      selectedDate: null,
      // Month, everywhere. The year view answers "how did the year go"; the month view is
      // where a person ticks today off, which is what they open the app to do. This used
      // to depend on the window being narrower than 640px, so the same person got a
      // different first screen on their phone and on their laptop.
      //
      // And every launch sees it, not only a fresh install. The view used to be kept, on
      // the grounds that some people chose the year on purpose; what it did in practice was
      // bring back to the year anybody who had tapped Year once, or swiped sideways on a
      // phone without meaning to, where there is no Today bar and no obvious way to tick
      // today off. The year is one tap away for whoever wants it.
      currentView: 'month' as ViewType,
      yearMode: 'all' as const,
      selectedMonth: OPENED_AT.getMonth(),
      _hasHydrated: false,
      _viewTransitionDirection: null as ViewTransitionDirection,

      reminderEnabled: false,
      // Nine in the evening: late enough that the day has happened, early enough not to
      // land after somebody has gone to sleep.
      reminderHour: 21,
      reminderMinute: 0,
      reminderOffered: false,
      reminderTimeChosen: false,

      firstOpenedAt: null,
      feedbackInviteSeen: false,
      storeReviewOffered: false,
      checkinEnabled: false,
      checkinNoticeSeen: false,
      checkinId: null,
      checkinLastAttempt: null,
      _loggedThisSession: false,
      _offerThisSession: null,
      // Nothing stored is what a new installation looks like: merge is only called when
      // there is something to merge.
      _checkinStart: 'new',
      _checkinNoticeShown: false,
      _feedbackAsked: false,
      updateNoticeSeenFor: null,
      updatesEnabled: true,

      setReminder: (enabled, hour, minute) =>
        set((state) => ({
          reminderEnabled: enabled,
          reminderHour: hour ?? state.reminderHour,
          reminderMinute: minute ?? state.reminderMinute,
        })),

      markReminderOffered: () => set({ reminderOffered: true }),

      markReminderTimeChosen: () => set({ reminderTimeChosen: true }),

      // Once, and never again: the second call has to be a no-op or the field would mean
      // "the last day the app was opened", which is a different fact and not the one
      // anything here asks for.
      markOpened: () =>
        set((state) =>
          state.firstOpenedAt === null ? { firstOpenedAt: formatDate(new Date()) } : {}
        ),

      markFeedbackInviteSeen: () => set({ feedbackInviteSeen: true }),

      markStoreReviewOffered: () => set({ storeReviewOffered: true }),

      markFeedbackAsked: () => set({ feedbackInviteSeen: true, _feedbackAsked: true }),

      markUpdateNoticeSeen: (version) => set({ updateNoticeSeenFor: version }),

      setUpdatesEnabled: (enabled) => set({ updatesEnabled: enabled }),

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

      markCheckinNoticeSeen: () => set({ checkinNoticeSeen: true, _checkinNoticeShown: true }),

      setHasHydrated: (value: boolean) => set({ _hasHydrated: value }),

      addActivity: (name, color) => {
        const now = new Date().toISOString()
        const newActivity: Activity = {
          id: generateId(),
          name,
          color: color ?? firstFreeColor(get().activities.map((a) => a.color)),
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
        // Whatever else this does, the session has now touched a day, and the invitation
        // needs that. Unticking counts too: the app was used either way.
        //
        // This used to say the invitation "mounts behind the day sheet", which was true
        // of the band and stopped being true in 1.4 when the band became a dialog: a
        // dialog is drawn above the sheet, not behind it. The sentence outlived what it
        // described. App.tsx is where that is handled now, by waiting for the sheet to
        // close rather than by drawing underneath it.
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

      // Where somebody was yesterday is not where they want to be today, and yesterday's
      // sheet left open would let them tick yesterday believing it was today. The new day
      // starts where opening the app starts: Month, on the month that holds today, with no
      // sheet. An app that stays alive overnight, in the background on Android or open on a
      // desktop, is not treated differently from one opened this morning. With no drill
      // animation: nobody drilled anywhere. The session flags are not touched: they pair
      // with state in App that does not start again with the day.
      startNewDay: (day) => {
        const date = parseDateString(day)
        set({
          selectedYear: date.getFullYear(),
          selectedMonth: date.getMonth(),
          selectedDate: null,
          currentView: 'month',
          _viewTransitionDirection: null,
        })
      },

      getLogsForDate: (date) => {
        return get().logs.filter((l) => l.date === date && l.completed)
      },

      getLogsForActivity: (activityId) => {
        return get().logs.filter((l) => l.activityId === activityId && l.completed)
      },
    }),
    {
      name: STORAGE_KEY,
      version: PERSIST_VERSION,
      // Called only for a value stored under a version other than this one, older or
      // newer. There is no translation for any of them, so it refuses, and the refusal
      // reaches onRehydrateStorage with the error: the rescue screen, the bytes untouched.
      // Without a migrate zustand logs and hands merge undefined, which looks like an
      // empty storage. A version bump has to replace this with a real migration.
      migrate: (_persisted, version) => {
        throw new Error(
          `What is stored under ${STORAGE_KEY} is version ${version}, and this build reads ${PERSIST_VERSION}`
        )
      },
      storage: createJSONStorage(() => createDeferredStorage()),
      // Where somebody was is not kept, and the four missing names are the whole of this
      // decision: `selectedDate`, `selectedMonth`, `selectedYear` and `currentView`.
      //
      // Daylo is for today, and it used to open wherever it was left. Somebody who looked
      // at March in March came back in November and was shown March, with today a swipe
      // away and nothing on the screen saying so; the day sheet came back open too, over a
      // day that had stopped being the day. The view was the same kind of thing: one tap on
      // Year, or one sideways swipe on a phone, and every launch after that opened on
      // twelve cards with no Today bar. The defaults are today's month, so leaving these
      // out is the whole of the fix.
      //
      // What is kept is what is a preference rather than a place: how somebody likes the
      // year read.
      partialize: (state) => ({
        activities: state.activities,
        logs: state.logs,
        yearMode: state.yearMode,
        reminderEnabled: state.reminderEnabled,
        reminderHour: state.reminderHour,
        reminderTimeChosen: state.reminderTimeChosen,
        reminderMinute: state.reminderMinute,
        reminderOffered: state.reminderOffered,
        firstOpenedAt: state.firstOpenedAt,
        feedbackInviteSeen: state.feedbackInviteSeen,
        storeReviewOffered: state.storeReviewOffered,
        checkinEnabled: state.checkinEnabled,
        checkinNoticeSeen: state.checkinNoticeSeen,
        checkinId: state.checkinId,
        checkinLastAttempt: state.checkinLastAttempt,
        updateNoticeSeenFor: state.updateNoticeSeenFor,
        updatesEnabled: state.updatesEnabled,
      }),
      // The default merge would do, except that it cannot say whether a field was absent
      // or merely false: by the time anything else can look, the default has filled the
      // gap. This runs with the stored object in hand, before that happens, and it is the
      // only moment at which "this install has never been asked" is a fact rather than a
      // guess.
      //
      // It is called even when there is nothing stored, with undefined, which is not what
      // the name suggests and is worth knowing: zustand's hydrate resolves to
      // `[false, void 0]` for an empty storage and calls merge with that anyway
      // (zustand/middleware.js). Reading undefined as "stored but undecided" told a phone
      // with a freshly cleared app that it was updating, so it stayed off and said the
      // wrong line. Nothing at all is a new installation; an object without the switch is
      // an update.
      //
      // Except that undefined does not only mean nothing at all (#221). zustand also hands
      // it over for a value that parses but has no `state`. Read as a new installation,
      // that opened an empty app, and the first write of the launch put the empty state
      // over the only copy. So the disk is asked, and if what is there has anything to
      // lose (worthRescuing, above), this is "I could not read it", not "there is
      // nothing". An empty `state`, and a `state` that is not an object at all (a string,
      // a number), are read the same way: neither carries anything to merge, and the
      // second, merged as it was, became an update whose first write replaced the
      // activities and logs. A stored version this build does not know never gets here:
      // migrate refuses it first. Throwing hands it to the same path
      // as a value that will not parse: zustand calls onRehydrateStorage with the error,
      // the rescue screen comes up with the bytes untouched, and nothing is written,
      // because merge throwing means zustand never sets the state it would have saved.
      merge: (persisted, current) => {
        const notAState =
          persisted == null || typeof persisted !== 'object' || Array.isArray(persisted)
        const empty = notAState || Object.keys(persisted as object).length === 0
        if (empty) {
          const onDisk = whatIsOnDisk(() => localStorage.getItem(STORAGE_KEY))
          if (worthRescuing(onDisk.raw)) {
            throw new Error(`What is stored under ${STORAGE_KEY} does not open as a state`)
          }
          return { ...current, _checkinStart: 'new' }
        }

        // Where somebody was is dropped on the way in, not only left out on the way out.
        // Every copy already installed has these four on disk from before this change, and
        // partialize only decides what is written: without this, the first launch after
        // updating would still open on March, or on the year, and the second one would be
        // the fixed one. The fix that works on the next launch and not on this one is the
        // fix nobody sees.
        const stored = { ...(persisted as Partial<CalendarState>) }
        for (const place of WHERE_SOMEBODY_IS) delete stored[place]
        return {
          ...current,
          ...stored,
          _checkinStart: 'checkinEnabled' in stored ? 'decided' : 'update',
        }
      },
      /**
       * The second argument is the one that was being dropped, and dropping it was the
       * whole of the bug.
       *
       * zustand calls this with `(undefined, error)` when hydration throws, which a
       * truncated or otherwise unparseable value in storage does, and a browser with site
       * data blocked does too. The old body was `state?.setHasHydrated(true)`: the `?.`
       * quietly swallowed exactly that case, `_hasHydrated` stayed false, and App returned
       * the loading skeleton for ever. No header, no Settings, no Export, over data still
       * sitting on the disk.
       *
       * Nothing here may touch `useCalendarStore`. This runs from inside `create()`, so
       * that const is still in its temporal dead zone and naming it would throw from the
       * handler for a failure. The rescue store is separate for that reason among others.
       *
       * And nothing here writes. A device that could not be read is the last device that
       * should be written to: whatever is there is the only copy, and the screen this
       * raises exists to get it off intact.
       */
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          useRescueStore
            .getState()
            .couldNotOpen(whatIsOnDisk(() => localStorage.getItem(STORAGE_KEY)))
          return
        }
        state?.setHasHydrated(true)
      },
    }
  )
)
