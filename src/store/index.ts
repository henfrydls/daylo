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
 * What Daylo says when the disk refuses a write. Agreed word for word: it is the one
 * moment Daylo knows it is about to lose something and can still prevent it, because what
 * was not written is still in memory and Export still works.
 */
export const COULD_NOT_SAVE =
  'Daylo could not save your last changes. Open Settings and export a backup so nothing is lost.'

type ViewType = 'year' | 'month'
type ViewTransitionDirection = 'drill-down' | 'drill-up' | null

interface DeferredStorage extends StateStorage {
  /**
   * The exact string this window last read from the disk or wrote to it. Anything else
   * there was written by another window, and that is how coming back to the front tells
   * whether there is something to take in.
   */
  lastSeen: () => string | null
  /** Whether this window has a change of its own still waiting to be written. */
  hasPendingWrite: () => boolean
}

// Deferred localStorage adapter for optimistic UI
// UI updates immediately, persistence happens during idle time
const createDeferredStorage = (): DeferredStorage => {
  let pendingWrite: string | null = null
  let pendingKey: string | null = null
  let lastSeen: string | null = null
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
        lastSeen = pendingWrite
        // The pending value is only dropped once it has really been written. If the write
        // fails it is kept, so the next flush tries it again.
        pendingWrite = null
        pendingKey = null
        // The disk works again. If it fails after this, that is news, and is said again.
        failureReported = false
      } catch (error) {
        // Not swallowed: losing data without a word is the worst thing an app can do when
        // its whole case is that your data is yours.
        console.error('[Daylo] Could not save changes to localStorage:', error)
        // Once per run of failures, not once per tap: every tap is another write. And
        // never a second copy over one still on the screen.
        if (!failureReported) {
          failureReported = true
          const toasts = useToastStore.getState()
          if (!toasts.toasts.some((t) => t.message === COULD_NOT_SAVE)) {
            toasts.addToast(COULD_NOT_SAVE, 'error', { untilDismissed: true })
          }
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
      lastSeen = localStorage.getItem(name)
      return lastSeen
    },
    setItem: (name: string, value: string): void => {
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
      pendingWrite = null
      pendingKey = null
      cancelScheduledWrite()
      localStorage.removeItem(name)
    },
    lastSeen: () => lastSeen,
    hasPendingWrite: () => pendingWrite !== null,
  }
}

/**
 * Created once, here, so that the code listening for other windows after the store exists
 * can ask it what this window last saw.
 */
const deferredStorage = createDeferredStorage()

/**
 * True only while this window is taking in what another window wrote. merge and the
 * rehydrate callback read it: taking in somebody else's records is not a launch, and must
 * not decide the launch's questions again.
 */
let adoptingFromAnotherWindow = false

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

/**
 * Another window's records, over this window's session.
 *
 * Only what is kept on disk comes across. Whatever starts with `_` belongs to this session
 * and is left as it is, `_checkinStart` above all: it was decided at launch, it says which
 * line of the check-in a new copy sees and whether the check-in starts, and a second window
 * writing must not decide it again. Where somebody is stays too: nobody should be moved to
 * another month because they ticked a day somewhere else.
 */
function takeInRecords(persisted: unknown, current: CalendarState): CalendarState {
  if (persisted == null || typeof persisted !== 'object') return current
  const records = { ...(persisted as Record<string, unknown>) }
  for (const key of Object.keys(records)) {
    if (key.startsWith('_')) delete records[key]
  }
  for (const place of WHERE_SOMEBODY_IS) delete records[place]
  return { ...current, ...records }
}

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
      storage: createJSONStorage(() => deferredStorage),
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
      merge: (persisted, current) => {
        if (adoptingFromAnotherWindow) return takeInRecords(persisted, current)
        if (persisted == null) return { ...current, _checkinStart: 'new' }

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
        // Taking in another window's records: this window is already open and already
        // hydrated, and what it holds stays on screen whatever happened. Marking it
        // hydrated again would also be a write, and two windows that answered each other's
        // writes with one of their own would never stop.
        if (adoptingFromAnotherWindow) return
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

/**
 * Whether a string from the disk is something zustand can open. Checked before taking it
 * in, because zustand answers one it cannot parse with the rescue screen, which is right
 * for a launch with nothing else to show and wrong for a window that holds good data.
 */
function isReadable(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { state?: unknown }).state === 'object' &&
      (parsed as { state?: unknown }).state !== null
    )
  } catch {
    return false
  }
}

/**
 * Takes in what another window of Daylo wrote, before this one can write over it.
 *
 * Somebody who thinks Daylo has not refreshed opens it again. They tick today in the new
 * window, close it, go back to the old one and tap anything: the old one wrote everything
 * it held in memory, which did not hold today, and the tick was gone without a word. Now
 * the old window reads the disk again first, so its next write carries the tick.
 *
 * Not when this window has a change of its own still waiting to be written: then this
 * window wins, as it always did, and the change goes out as usual. That takes ticking in
 * two windows within a second or two of each other; merging record by record would be
 * another piece of work.
 *
 * Not on the rescue screen either, which exists to get the data off the disk intact, and
 * not over a disk that is empty or cannot be read: what this window holds is good, and an
 * empty or half-written value from elsewhere must not replace it or bring up the rescue.
 *
 * rehydrate() writes nothing (zustand hydrates through its internal set, and the callback
 * above returns early while this runs), which is what stops two windows answering each
 * other for ever. It is also synchronous, because the storage is: the flag around it is
 * cleared after merge has run, not before.
 */
function takeInWhatAnotherWindowWrote() {
  if (deferredStorage.hasPendingWrite()) return
  if (!useCalendarStore.getState()._hasHydrated) return
  let raw: string | null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (raw === null || raw === deferredStorage.lastSeen() || !isReadable(raw)) return
  adoptingFromAnotherWindow = true
  try {
    void useCalendarStore.persist.rehydrate()
  } finally {
    adoptingFromAnotherWindow = false
  }
}

// Two ways to hear about another window. Browsers tell the other tabs with 'storage'. Two
// processes of the desktop app's web view may never tell each other (likely with WebKitGTK
// on Linux, not measured), so coming back to the front also compares the disk with what
// this window last saw. Hooked here and not with the flush on hiding, because the store has
// to exist first.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.storageArea === localStorage) {
      takeInWhatAnotherWindowWrote()
    }
  })
  window.addEventListener('focus', takeInWhatAnotherWindowWrote)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') takeInWhatAnotherWindowWrote()
  })
}
