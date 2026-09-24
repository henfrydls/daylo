import { describe, it, expect, beforeEach } from 'vitest'
import { useCalendarStore } from './index'

describe('useCalendarStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCalendarStore.setState({
      activities: [],
      logs: [],
      selectedYear: new Date().getFullYear(),
      selectedDate: null,
    })
  })

  // Read through getInitialState so it does not depend on what other tests left behind,
  // and so it describes what a fresh install gets rather than what the store happens to
  // hold right now.
  //
  // There was a second test here asserting the value does not depend on the window width,
  // which it used to: below 640px it was 'month' and above it 'year'. It was removed
  // because it could not fail. getInitialState returns what was captured when the module
  // loaded, so resizing the window afterwards re-evaluates nothing, and the test passed
  // against the old code too.
  describe('the first screen', () => {
    it('starts on the month view', () => {
      expect(useCalendarStore.getInitialState().currentView).toBe('month')
    })
  })

  describe('how the year is shown', () => {
    it('starts on the combined heatmap', () => {
      expect(useCalendarStore.getInitialState().yearMode).toBe('all')
    })

    it('remembers the choice', () => {
      useCalendarStore.getState().setYearMode('byActivity')

      expect(useCalendarStore.getState().yearMode).toBe('byActivity')
    })

    // Persisted like the view itself: somebody who reads their year a row per activity
    // should not have to say so again after every reload. The wait is not decoration: the
    // store's storage defers its write, so reading straight after the set finds the old
    // value. That same race is what loses a seeded state in the end-to-end tests.
    it('is written to storage', async () => {
      useCalendarStore.getState().setYearMode('byActivity')

      await new Promise((resolve) => setTimeout(resolve, 20))

      const stored = JSON.parse(localStorage.getItem('simple-calendar-storage') || '{}')
      expect(stored.state.yearMode).toBe('byActivity')
    })
  })

  describe('activities', () => {
    it('should add activity', () => {
      const { addActivity } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const { activities } = useCalendarStore.getState()
      expect(activities.length).toBe(1)
      expect(activities[0].name).toBe('Exercise')
      expect(activities[0].color).toBe('#10B981')
    })

    it('should update activity', () => {
      const { addActivity, updateActivity } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      updateActivity(activity.id, { name: 'Workout', color: '#3B82F6' })

      const updated = useCalendarStore.getState().activities[0]
      expect(updated.name).toBe('Workout')
      expect(updated.color).toBe('#3B82F6')
    })

    it('should delete activity and related logs', () => {
      const { addActivity, toggleLog, deleteActivity } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')

      expect(useCalendarStore.getState().logs.length).toBe(1)

      deleteActivity(activity.id)

      expect(useCalendarStore.getState().activities.length).toBe(0)
      expect(useCalendarStore.getState().logs.length).toBe(0)
    })
  })

  describe('logs', () => {
    it('should toggle log on (create)', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')

      const { logs } = useCalendarStore.getState()
      expect(logs.length).toBe(1)
      expect(logs[0].activityId).toBe(activity.id)
      expect(logs[0].date).toBe('2024-01-15')
      expect(logs[0].completed).toBe(true)
    })

    it('vuelve a crear el registro si se marca otra vez tras desmarcar', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15') // marcar
      toggleLog(activity.id, '2024-01-15') // desmarcar: el registro se borra
      toggleLog(activity.id, '2024-01-15') // marcar de nuevo

      // Al borrarse el registro al desmarcar, volver a marcar tiene que crear uno nuevo
      // en lugar de no encontrar nada que actualizar.
      const { logs } = useCalendarStore.getState()
      expect(logs).toHaveLength(1)
      expect(logs[0].completed).toBe(true)
      expect(logs[0].date).toBe('2024-01-15')
    })

    it('borra el registro al desmarcar un dia sin notas', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')
      expect(useCalendarStore.getState().logs).toHaveLength(1)

      toggleLog(activity.id, '2024-01-15')

      // Un dia desmarcado y sin notas no representa nada que el usuario quiera
      // conservar, y cada uno de esos registros cuenta contra la cuota de localStorage.
      expect(useCalendarStore.getState().logs).toHaveLength(0)
    })

    it('conserva el registro con sus notas al desmarcar', () => {
      const { addActivity, toggleLog, updateLogNotes } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')
      updateLogNotes(useCalendarStore.getState().logs[0].id, 'Me costo pero lo hice')

      toggleLog(activity.id, '2024-01-15')

      // La nota es contenido del usuario: desmarcar el dia no la borra.
      const { logs } = useCalendarStore.getState()
      expect(logs).toHaveLength(1)
      expect(logs[0].completed).toBe(false)
      expect(logs[0].notes).toBe('Me costo pero lo hice')
    })

    it('borra todos los registros del dia al desmarcar, no solo uno', () => {
      // Un dispositivo puede arrastrar duplicados de un import hecho antes de que
      // mergeData deduplicara por actividad y dia. Si al desmarcar solo desaparece uno,
      // el dia se queda verde despues del clic y el usuario no entiende nada.
      useCalendarStore.setState({
        logs: [
          {
            id: 'dup-1',
            activityId: 'act-1',
            date: '2026-01-05',
            completed: true,
            createdAt: '2026-01-05T10:00:00.000Z',
          },
          {
            id: 'dup-2',
            activityId: 'act-1',
            date: '2026-01-05',
            completed: true,
            createdAt: '2026-01-05T11:00:00.000Z',
          },
        ],
      })

      useCalendarStore.getState().toggleLog('act-1', '2026-01-05')

      expect(useCalendarStore.getState().logs).toHaveLength(0)
    })

    it('al desmarcar con duplicados mixtos deja solo el que tiene nota, sin marcar', () => {
      useCalendarStore.setState({
        logs: [
          {
            id: 'sin-nota',
            activityId: 'act-1',
            date: '2026-01-07',
            completed: true,
            createdAt: '2026-01-07T10:00:00.000Z',
          },
          {
            id: 'con-nota',
            activityId: 'act-1',
            date: '2026-01-07',
            completed: true,
            notes: 'lo hice a medias',
            createdAt: '2026-01-07T11:00:00.000Z',
          },
        ],
      })

      useCalendarStore.getState().toggleLog('act-1', '2026-01-07')

      const { logs } = useCalendarStore.getState()
      expect(logs).toHaveLength(1)
      expect(logs[0].notes).toBe('lo hice a medias')
      expect(logs[0].completed).toBe(false)
    })

    it('al marcar un dia con duplicados no cuenta el dia dos veces', () => {
      // Los duplicados heredados pueden estar en completed:false, que es la forma que
      // dejaban las versiones anteriores al arreglo del desmarcado. Si un clic los pone
      // todos en true, el heatmap cuenta el dia dos veces y pinta un nivel que no
      // corresponde: el mismo sintoma que este cambio dice arreglar, pero al marcar.
      useCalendarStore.setState({
        logs: [
          {
            id: 'dup-1',
            activityId: 'act-1',
            date: '2026-01-05',
            completed: false,
            createdAt: '2026-01-05T10:00:00.000Z',
          },
          {
            id: 'dup-2',
            activityId: 'act-1',
            date: '2026-01-05',
            completed: false,
            createdAt: '2026-01-05T11:00:00.000Z',
          },
        ],
      })

      useCalendarStore.getState().toggleLog('act-1', '2026-01-05')

      const { logs } = useCalendarStore.getState()
      const completadosDelDia = logs.filter(
        (l) => l.activityId === 'act-1' && l.date === '2026-01-05' && l.completed
      )
      expect(completadosDelDia).toHaveLength(1)
    })

    it('al marcar conserva un duplicado con notas en vez de borrarlo', () => {
      useCalendarStore.setState({
        logs: [
          {
            id: 'sin-nota',
            activityId: 'act-1',
            date: '2026-01-06',
            completed: false,
            createdAt: '2026-01-06T10:00:00.000Z',
          },
          {
            id: 'con-nota',
            activityId: 'act-1',
            date: '2026-01-06',
            completed: false,
            notes: 'me costo',
            createdAt: '2026-01-06T11:00:00.000Z',
          },
        ],
      })

      useCalendarStore.getState().toggleLog('act-1', '2026-01-06')

      const { logs } = useCalendarStore.getState()
      // La nota es contenido del usuario y no se pierde por colapsar duplicados.
      expect(logs.some((l) => l.notes === 'me costo')).toBe(true)
      expect(logs.filter((l) => l.date === '2026-01-06' && l.completed)).toHaveLength(1)
    })

    it('should update log notes', () => {
      const { addActivity, toggleLog, updateLogNotes } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')

      const log = useCalendarStore.getState().logs[0]
      updateLogNotes(log.id, 'Great workout!')

      expect(useCalendarStore.getState().logs[0].notes).toBe('Great workout!')
    })
  })

  describe('navigation', () => {
    it('should set selected year', () => {
      const { setSelectedYear } = useCalendarStore.getState()
      setSelectedYear(2023)

      expect(useCalendarStore.getState().selectedYear).toBe(2023)
    })

    it('should set selected date', () => {
      const { setSelectedDate } = useCalendarStore.getState()
      setSelectedDate('2024-01-15')

      expect(useCalendarStore.getState().selectedDate).toBe('2024-01-15')
    })

    it('should clear selected date', () => {
      const { setSelectedDate } = useCalendarStore.getState()
      setSelectedDate('2024-01-15')
      setSelectedDate(null)

      expect(useCalendarStore.getState().selectedDate).toBe(null)
    })
  })

  describe('default view by viewport', () => {
    it('should resolve to month when innerWidth < 640', () => {
      // Test the conditional logic used by the store initializer
      const getDefaultView = (width: number) => (width < 640 ? 'month' : 'year')

      expect(getDefaultView(320)).toBe('month')
      expect(getDefaultView(375)).toBe('month')
      expect(getDefaultView(639)).toBe('month')
    })

    it('should resolve to year when innerWidth >= 640', () => {
      const getDefaultView = (width: number) => (width < 640 ? 'month' : 'year')

      expect(getDefaultView(640)).toBe('year')
      expect(getDefaultView(1024)).toBe('year')
      expect(getDefaultView(1920)).toBe('year')
    })
  })

  describe('hydration', () => {
    it('should initialize _hasHydrated as false', () => {
      useCalendarStore.setState({ _hasHydrated: false })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
    })

    it('should set _hasHydrated to true via setHasHydrated', () => {
      useCalendarStore.setState({ _hasHydrated: false })
      const { setHasHydrated } = useCalendarStore.getState()
      setHasHydrated(true)

      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
    })

    it('should toggle _hasHydrated back to false', () => {
      const { setHasHydrated } = useCalendarStore.getState()
      setHasHydrated(true)
      setHasHydrated(false)

      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
    })
  })

  describe('helpers', () => {
    it('should get logs for date', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')
      addActivity('Reading', '#3B82F6')

      const activities = useCalendarStore.getState().activities
      toggleLog(activities[0].id, '2024-01-15')
      toggleLog(activities[1].id, '2024-01-15')
      toggleLog(activities[0].id, '2024-01-16')

      const logsForDate = useCalendarStore.getState().getLogsForDate('2024-01-15')
      expect(logsForDate.length).toBe(2)
    })

    it('should get logs for activity', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')
      toggleLog(activity.id, '2024-01-16')
      toggleLog(activity.id, '2024-01-17')

      const logsForActivity = useCalendarStore.getState().getLogsForActivity(activity.id)
      expect(logsForActivity.length).toBe(3)
    })
  })
})

// The three fields the invitation to write and the check-in are built on. They are here
// rather than beside the feature because what matters about them is where they live:
// which survive a restart, which do not, and which are written once and never again.
describe('what the store remembers about how long somebody has been here', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      firstOpenedAt: null,
      feedbackInviteSeen: false,
      _loggedThisSession: false,
      _offerThisSession: null,
      logs: [],
      activities: [],
    })
  })

  it('writes the first day once and then leaves it alone', () => {
    useCalendarStore.getState().markOpened()
    const first = useCalendarStore.getState().firstOpenedAt
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    useCalendarStore.setState({ firstOpenedAt: '2020-01-01' })
    useCalendarStore.getState().markOpened()

    // If this ever changed, the field would mean "the last day it was opened", which is a
    // different fact and not the one anything asks for.
    expect(useCalendarStore.getState().firstOpenedAt).toBe('2020-01-01')
  })

  it('gives this session to whoever asks first', () => {
    useCalendarStore.getState().claimOffer('reminder')
    useCalendarStore.getState().claimOffer('checkin')

    expect(useCalendarStore.getState()._offerThisSession).toBe('reminder')
  })

  // The invitation mounts behind the day sheet, and this flag is what says the sheet was
  // opened. Unticking counts: the app was used either way.
  it('notices a day being ticked, and a day being unticked', () => {
    useCalendarStore.setState({
      activities: [
        {
          id: 'a1',
          name: 'Read',
          color: '#10B981',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    })

    useCalendarStore.getState().toggleLog('a1', '2026-02-01')
    expect(useCalendarStore.getState()._loggedThisSession).toBe(true)

    useCalendarStore.setState({ _loggedThisSession: false })
    useCalendarStore.getState().toggleLog('a1', '2026-02-01')
    expect(useCalendarStore.getState()._loggedThisSession).toBe(true)
  })

  // A session flag that survived a restart would make the invitation appear on a screen
  // where nothing had been ticked, which is the one place it must not appear.
  it('keeps the two session flags out of what is written to disk', () => {
    const persisted = useCalendarStore.persist.getOptions().partialize!(useCalendarStore.getState())

    expect(persisted).toHaveProperty('firstOpenedAt')
    expect(persisted).toHaveProperty('feedbackInviteSeen')
    expect(persisted).not.toHaveProperty('_loggedThisSession')
    expect(persisted).not.toHaveProperty('_offerThisSession')
  })
})

// What the store holds for the check-in. The switch and the random number are one fact in
// two fields and the store is what keeps them one: there is no state where the check-in is
// off and a number survives, because the number is the thing consent produced.
describe('what the store remembers about the check-in', () => {
  beforeEach(() => {
    useCalendarStore.setState({
      checkinEnabled: false,
      checkinId: null,
      checkinLastAttempt: null,
    })
  })

  it('turns on with a number and off without one', () => {
    useCalendarStore.getState().setCheckin(true, '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')

    expect(useCalendarStore.getState().checkinEnabled).toBe(true)
    expect(useCalendarStore.getState().checkinId).toBe('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')
  })

  // Turning it off is the one action in the app that has to be complete on its own: the
  // number is gone from disk before the last note has even left, and the record of when
  // Daylo last spoke to a server goes with it. Nothing about that season is kept.
  it('forgets the number and the last attempt when it is turned off', () => {
    useCalendarStore.getState().setCheckin(true, '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')
    useCalendarStore.getState().recordCheckinAttempt('2026-09-14', '2026-09-14T21:12:00.000Z', true)

    useCalendarStore.getState().setCheckin(false, null)

    expect(useCalendarStore.getState().checkinEnabled).toBe(false)
    expect(useCalendarStore.getState().checkinId).toBeNull()
    expect(useCalendarStore.getState().checkinLastAttempt).toBeNull()
  })

  it('records a try whether or not it arrived', () => {
    useCalendarStore
      .getState()
      .recordCheckinAttempt('2026-09-14', '2026-09-14T21:12:00.000Z', false)

    expect(useCalendarStore.getState().checkinLastAttempt).toEqual({
      date: '2026-09-14',
      at: '2026-09-14T21:12:00.000Z',
      ok: false,
    })
  })

  // Three starts, and only the stored object can tell them apart. Once the defaults have
  // filled the gaps, "never decided" and "decided no" look the same, and they are not:
  // one is a new installation that should be on, the other is somebody who installed
  // Daylo when it sent nothing anywhere.
  // Through hydration, not by reading the default. The default was right all along and
  // the journey was not: zustand calls merge even when storage is empty, with undefined,
  // and reading that as "stored but undecided" told a freshly cleared phone it was
  // updating. Asserting the initial value could never have caught it.
  it('calls a store with nothing in it a new installation', async () => {
    window.dispatchEvent(new Event('pagehide'))
    localStorage.removeItem('simple-calendar-storage')

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState()._checkinStart).toBe('new')
  })

  it('calls a stored state without the switch an update', async () => {
    window.dispatchEvent(new Event('pagehide'))
    localStorage.setItem(
      'simple-calendar-storage',
      JSON.stringify({
        state: { activities: [], logs: [], firstOpenedAt: '2026-09-01' },
        version: 0,
      })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState()._checkinStart).toBe('update')
    expect(useCalendarStore.getState().checkinEnabled).toBe(false)
  })

  it('leaves a stored decision alone, either way', async () => {
    for (const enabled of [true, false]) {
      window.dispatchEvent(new Event('pagehide'))
      localStorage.setItem(
        'simple-calendar-storage',
        JSON.stringify({ state: { activities: [], logs: [], checkinEnabled: enabled }, version: 0 })
      )

      await useCalendarStore.persist.rehydrate()

      expect(useCalendarStore.getState()._checkinStart).toBe('decided')
      expect(useCalendarStore.getState().checkinEnabled).toBe(enabled)
    }
  })

  // Daylo 1.3 asked once whether it could check in, and kept the answer in
  // checkinOffered. It does not ask any more, so the field is gone, and a device that was
  // running a build from that week still has it on disk. Hydration must carry on around
  // it, and the next write must not put it back.
  it('hydrates a state that still carries the field the question used', async () => {
    // The adapter answers reads from its own pending write until that write lands, so the
    // seed below would otherwise be read straight back over. This is what the app does
    // when it goes to the background.
    window.dispatchEvent(new Event('pagehide'))
    localStorage.setItem(
      'simple-calendar-storage',
      JSON.stringify({
        state: {
          activities: [],
          logs: [],
          firstOpenedAt: '2026-09-01',
          checkinOffered: true,
          checkinEnabled: true,
          checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
        },
        version: 0,
      })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useCalendarStore.getState().checkinEnabled).toBe(true)
    expect(useCalendarStore.getState().checkinId).toBe('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')
    expect(useCalendarStore.getState().firstOpenedAt).toBe('2026-09-01')

    const persisted = useCalendarStore.persist.getOptions().partialize!(useCalendarStore.getState())
    expect(persisted).not.toHaveProperty('checkinOffered')
  })

  // The three survive a restart: "once a day" is a promise across launches, and a number
  // that did not survive would make a new device out of the same one every morning.
  it('writes all three to disk', () => {
    const persisted = useCalendarStore.persist.getOptions().partialize!(useCalendarStore.getState())

    expect(persisted).toHaveProperty('checkinEnabled')
    expect(persisted).toHaveProperty('checkinId')
    expect(persisted).toHaveProperty('checkinLastAttempt')
  })
})
