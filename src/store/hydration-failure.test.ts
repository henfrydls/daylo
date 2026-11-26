import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCalendarStore, STORAGE_KEY, PERSIST_VERSION } from './index'
import { useRescueStore } from './rescue'

/**
 * What happens when the stored value cannot be read.
 *
 * Driven through zustand's own `persist.rehydrate()` rather than by calling the handler
 * directly, because the handler's signature is the thing that was wrong: the old body took
 * one argument and zustand passes two, and a test that called it with what it expected
 * would have agreed with the bug.
 */
describe('a stored value that will not open', () => {
  /**
   * The wait is load bearing and the reason is worth knowing.
   *
   * The store's storage adapter defers writes and, while one is pending, `getItem` returns
   * what is waiting rather than what is on the disk. So a `setState` here leaves a valid
   * value in hand, and a rehydrate a moment later reads that instead of the corrupt bytes
   * this test just wrote: the test would pass hydration cleanly and prove nothing. Waiting
   * lets the flush happen first, and only then is the disk the thing that answers.
   */
  const settle = () => new Promise((done) => setTimeout(done, 20))

  beforeEach(async () => {
    useRescueStore.setState({ failure: null })
    // Not 'new', which is what a new installation is told: a test that expects 'new' would
    // otherwise pass on the value left from before.
    useCalendarStore.setState({ _hasHydrated: false, _checkinStart: 'update' })
    await settle()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('raises the way out, and does not report itself as loaded', async () => {
    localStorage.setItem(STORAGE_KEY, '{"state":{"logs":[truncated')

    await useCalendarStore.persist.rehydrate()

    expect(useRescueStore.getState().failure).toEqual({
      reason: 'unreadable',
      raw: '{"state":{"logs":[truncated',
    })
    expect(useCalendarStore.getState()._hasHydrated).toBe(false)
  })

  /**
   * The part that makes the screen worth having. Whatever is on the disk is the only copy,
   * and a device that could not be read is the last one that should be written to.
   */
  it('leaves the bytes on the disk exactly as they were', async () => {
    const stored = '{"state":{"activities":[{"id":"a"}],"logs":[trunc'
    localStorage.setItem(STORAGE_KEY, stored)

    await useCalendarStore.persist.rehydrate()

    expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
  })

  it('opens normally and says nothing when the value is fine', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { activities: [], logs: [] }, version: 0 })
    )

    await useCalendarStore.persist.rehydrate()

    expect(useRescueStore.getState().failure).toBeNull()
    expect(useCalendarStore.getState()._hasHydrated).toBe(true)
  })

  /**
   * #221. zustand hands merge `undefined` for three different things: an empty storage, a
   * value that parses but carries no `state`, and a value saved under a version this build
   * does not know how to migrate. Only the first is a new installation. The other two used
   * to open as one, empty, and the first write of the launch put the empty state over what
   * was there.
   */
  describe('something stored that does not open as a state', () => {
    const activity = { id: 'a', name: 'Walk', color: '#10B981' }

    it('treats a value with no state as unreadable, not as a new installation', async () => {
      const stored = JSON.stringify({ activities: [activity], logs: [] })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /** What a copy downgraded from a build that bumped `version` would hold. */
    it('treats a value from a version it cannot migrate as unreadable', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const stored = JSON.stringify({ state: { activities: [activity], logs: [] }, version: 7 })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /**
     * A migrate that has no answer for a version returns undefined, which reaches merge
     * exactly as "nothing stored" does. The guard on the persisted format does not see it,
     * because a migrate exists.
     */
    it('treats a value a migrate could not translate as unreadable', async () => {
      const options = useCalendarStore.persist.getOptions()
      useCalendarStore.persist.setOptions({ version: 1, migrate: () => undefined })
      try {
        const stored = JSON.stringify({ state: { activities: [activity], logs: [] }, version: 0 })
        localStorage.setItem(STORAGE_KEY, stored)

        await useCalendarStore.persist.rehydrate()

        expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
        await settle()
        expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
      } finally {
        useCalendarStore.persist.setOptions({ version: options.version, migrate: options.migrate })
      }
    })

    /**
     * #263's review: hooks run while the rescue screen is up, and the one that starts a
     * new day at midnight calls set(). Every set() is a write. Nothing may reach the disk
     * while the screen that exists to save what is on it is open.
     */
    it('writes nothing while the rescue screen is up, a new day included', async () => {
      const stored = JSON.stringify({ activities: [activity], logs: [] })
      localStorage.setItem(STORAGE_KEY, stored)
      await useCalendarStore.persist.rehydrate()
      expect(useRescueStore.getState().failure).not.toBeNull()

      useCalendarStore.getState().startNewDay('2026-11-17')
      useCalendarStore.setState({ yearMode: 'all' })
      await settle()

      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /** (c) of the rule: a newer build's value, even with nothing recognisable in it. */
    it('treats a value from a newer build as unreadable, even an empty one', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const stored = JSON.stringify({ state: {}, version: 7 })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /** (b) under `state`, with logs and no activities: a day is enough to be worth keeping. */
    it('treats a version it cannot migrate as unreadable when only logs are left', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const stored = JSON.stringify({
        state: { activities: [], logs: [{ id: 'l', activityId: 'a', date: '2026-11-01' }] },
        version: 3,
      })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
    })

    /** #263's second review: an older version is as unknown as a newer one. */
    it('treats a value from an older version as unreadable, even an empty one', async () => {
      const stored = JSON.stringify({ state: {}, version: -1 })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /**
     * A `state` that is not an object used to be spread into the store as an update, and
     * the first write replaced activities and logs. With something to lose beside it, it is
     * unreadable.
     */
    it.each(['"walk"', '7', 'true'])(
      'treats a state of %s beside activities as unreadable',
      async (state) => {
        const stored = `{"state":${state},"activities":[{"id":"a"}]}`
        localStorage.setItem(STORAGE_KEY, stored)

        await useCalendarStore.persist.rehydrate()

        expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
        await settle()
        expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
      }
    )

    it.each(['{"state":"walk"}', '{"state":7}', '{"state":[1]}'])(
      'opens %s, with nothing beside it, as a new installation and not as an update',
      async (stored) => {
        localStorage.setItem(STORAGE_KEY, stored)

        await useCalendarStore.persist.rehydrate()

        expect(useRescueStore.getState().failure).toBeNull()
        expect(useCalendarStore.getState()._checkinStart).toBe('new')
        expect(useCalendarStore.getState()).not.toHaveProperty('0')
      }
    )

    /**
     * Privacy: somebody who turned the check-in off. Opened as new, the check-in would be
     * on again against what they chose.
     */
    it.each(['{"checkinEnabled":false}', '{"state":"x","checkinEnabled":false}'])(
      'treats %s as unreadable rather than turn the check-in back on',
      async (stored) => {
        localStorage.setItem(STORAGE_KEY, stored)

        await useCalendarStore.persist.rehydrate()

        expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      }
    )

    /**
     * #263's second review: a write queued before the rescue screen came up must not land
     * after it, through the flushes on pagehide and visibilitychange that bypass setItem.
     */
    it('drops a write that was waiting when the rescue screen came up', async () => {
      const stored = JSON.stringify({ activities: [activity], logs: [] })
      useCalendarStore.setState({ yearMode: 'all' })
      // Queued, not yet flushed.
      localStorage.setItem(STORAGE_KEY, stored)
      useRescueStore.getState().couldNotOpen({ reason: 'unreadable', raw: stored })

      window.dispatchEvent(new Event('pagehide'))
      await settle()

      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /**
     * The other side of the rule. With nothing to lose, the rescue screen would claim there
     * is data where there is none, on every launch, with no way past it (#220). These open
     * as a new installation.
     */
    it.each(['null', '{}', '{"state":null}', '{"state":{}}'])(
      'opens %s as a new installation',
      async (stored) => {
        localStorage.setItem(STORAGE_KEY, stored)

        await useCalendarStore.persist.rehydrate()

        expect(useRescueStore.getState().failure).toBeNull()
        expect(useCalendarStore.getState()._hasHydrated).toBe(true)
        expect(useCalendarStore.getState()._checkinStart).toBe('new')
      }
    )

    /**
     * #276. Valid JSON under the right version, with the right keys holding the wrong
     * types. Merged as it was, the app drew a blank screen on the first thing that read
     * it. It is the same case as bytes that will not parse: Daylo cannot open it, and the
     * only copy stays exactly as it is.
     */
    const log = {
      id: 'l',
      activityId: 'a',
      date: '2026-11-01',
      completed: true,
      createdAt: '2026-11-01T10:00:00.000Z',
    }
    const whole = {
      ...activity,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    }
    it.each([
      ['activities that are null', { activities: null, logs: [log] }],
      ['logs that are null', { activities: [whole], logs: null }],
      ['activities that are an object', { activities: { a: whole }, logs: [] }],
      ['an activity that is a string', { activities: ['Walk'], logs: [] }],
      ['an activity with no id', { activities: [{ ...whole, id: undefined }], logs: [] }],
      ['an activity whose name is a number', { activities: [{ ...whole, name: 7 }], logs: [] }],
      [
        'an activity with no createdAt',
        { activities: [{ ...whole, createdAt: undefined }], logs: [] },
      ],
      ['a log that is null', { activities: [whole], logs: [null] }],
      [
        'a log whose completed is a string',
        { activities: [whole], logs: [{ ...log, completed: 'yes' }] },
      ],
      ['a log whose date is a number', { activities: [whole], logs: [{ ...log, date: 20261101 }] }],
      ['a log whose note is a number', { activities: [whole], logs: [{ ...log, notes: 7 }] }],
      ['a reminder hour that is a string', { activities: [whole], logs: [], reminderHour: '21' }],
      ['a year mode it does not know', { activities: [whole], logs: [], yearMode: 'grid' }],
      [
        'a check-in switch that is a string',
        { activities: [whole], logs: [], checkinEnabled: 'no' },
      ],
      [
        'a last check-in that is a string',
        { activities: [whole], logs: [], checkinLastAttempt: 'today' },
      ],
      // The right type and nothing a date can be made of. new Date('garbage') is Invalid
      // Date, and date-fns throws a RangeError formatting it: the same blank screen.
      [
        'an activity created on a day that is not a date',
        { activities: [{ ...whole, createdAt: 'garbage' }], logs: [] },
      ],
      [
        'an activity updated on a day that is not a date',
        { activities: [{ ...whole, updatedAt: 'garbage' }], logs: [] },
      ],
      ['a log on an empty date', { activities: [whole], logs: [{ ...log, date: '' }] }],
      ['a log on a date that is a word', { activities: [whole], logs: [{ ...log, date: 'x' }] }],
      [
        'a log on a day no calendar has',
        { activities: [whole], logs: [{ ...log, date: '2026-02-30' }] },
      ],
      [
        'a log created on a day that is not a date',
        { activities: [whole], logs: [{ ...log, createdAt: 'garbage' }] },
      ],
      // Numbers, and handed as they are to the notification plugin.
      ['a reminder hour of 99', { activities: [whole], logs: [], reminderHour: 99 }],
      ['a reminder hour of -5', { activities: [whole], logs: [], reminderHour: -5 }],
      ['a reminder hour of 20.5', { activities: [whole], logs: [], reminderHour: 20.5 }],
      ['a reminder minute of 60', { activities: [whole], logs: [], reminderMinute: 60 }],
      ['a reminder minute of -1', { activities: [whole], logs: [], reminderMinute: -1 }],
    ])('treats a state with %s as unreadable, and leaves it as it was', async (_, state) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const stored = JSON.stringify({ state, version: 0 })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toEqual({ reason: 'unreadable', raw: stored })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
      await settle()
      expect(localStorage.getItem(STORAGE_KEY)).toBe(stored)
    })

    /**
     * The other side of #276: what older versions wrote, and what they left out, is not a
     * wrong type. Missing fields are filled by the defaults; fields that are gone are
     * dropped in merge; null is what the nullable ones hold before they are first set.
     */
    it('still opens what an older version left, with fields missing and fields gone', async () => {
      const stored = JSON.stringify({
        state: {
          activities: [{ ...whole, updatedAt: undefined }],
          logs: [
            { ...log, notes: 'rain' },
            { ...log, id: 'm', notes: null },
          ],
          yearMode: 'byActivity',
          reminderTickDays: 2,
          checkinNoticeSeen: true,
          selectedDate: '2026-03-01',
          currentView: 'year',
          firstOpenedAt: null,
          checkinLastAttempt: { date: '2026-11-01', at: '2026-11-01T10:00:00.000Z', ok: true },
        },
        version: 0,
      })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toBeNull()
      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
      expect(useCalendarStore.getState().activities).toHaveLength(1)
      expect(useCalendarStore.getState().logs).toHaveLength(2)
    })

    /**
     * A log whose createdAt `new Date` reads and parseISO does not, or reads as another
     * day. Daylo never wrote one, but every import let it in. Whoever holds one opens as
     * before, keeps every record, and the value stays on the disk exactly as it was:
     * nothing here decides what date it was meant to be.
     */
    it.each(['2026/11/01', 'Sun Nov 01 2026', '1', '12', '2026-02-30'])(
      'opens a log created on %j, keeps it, and leaves the value as it was',
      async (createdAt) => {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            state: {
              activities: [whole],
              logs: [
                { ...log, createdAt },
                { ...log, id: 'm', date: '2026-11-02' },
              ],
            },
            version: 0,
          })
        )

        await useCalendarStore.persist.rehydrate()

        expect(useRescueStore.getState().failure).toBeNull()
        expect(useCalendarStore.getState()._hasHydrated).toBe(true)
        expect(useCalendarStore.getState().logs).toEqual([
          { ...log, createdAt },
          { ...log, id: 'm', date: '2026-11-02' },
        ])
        await settle()
        const onDisk = JSON.parse(localStorage.getItem(STORAGE_KEY)!).state.logs
        expect(onDisk).toEqual([
          { ...log, createdAt },
          { ...log, id: 'm', date: '2026-11-02' },
        ])
      }
    )

    /**
     * Every field this build writes is checked, so a field added later cannot be left out
     * of the rule by accident: each one, given a value no field of the store can hold,
     * has to send the state to the rescue screen.
     */
    it('checks every field it writes', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { partialize } = useCalendarStore.persist.getOptions()
      const fields = Object.keys(partialize!(useCalendarStore.getState()) as object)
      expect(fields.length).toBeGreaterThan(2)

      const unchecked: string[] = []
      for (const field of fields) {
        useRescueStore.setState({ failure: null })
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ state: { [field]: { not: 'this' } }, version: 0 })
        )
        await useCalendarStore.persist.rehydrate()
        if (useRescueStore.getState().failure === null) unchecked.push(field)
      }

      expect(unchecked).toEqual([])
    })

    /** So that somebody who reached the rescue screen can be told why. */
    it('says which field it could not read', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          state: { activities: [whole], logs: [log, { ...log, id: 'm', date: 'x' }] },
          version: 0,
        })
      )

      await useCalendarStore.persist.rehydrate()

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0].join(' ')).toContain('logs[1].date')
    })

    /**
     * What real copies hold, reconstructed from the store at those tags. 1.0.1 had no
     * partialize, so the whole state went to disk, places included; it wrote ids with
     * generateId, timestamps with toISOString, days with formatDate, and a note could be
     * empty. 1.5.3 wrote the fields its partialize listed, checkinNoticeSeen among them.
     */
    const written = (date: string, n: number) => ({
      id: `1731500000000-${n}abc9xyz`,
      activityId: '1731400000000-k3j9a8d7f',
      date,
      completed: n % 3 !== 0,
      createdAt: `${date}T21:14:05.123Z`,
    })
    const writtenActivity = {
      id: '1731400000000-k3j9a8d7f',
      name: 'Read <10 pages> & stretch',
      color: '#10B981',
      createdAt: '2024-11-12T08:26:40.000Z',
      updatedAt: '2024-11-20T19:02:11.456Z',
    }

    it('opens what 1.0.1 wrote', async () => {
      const stored = JSON.stringify({
        state: {
          activities: [writtenActivity],
          logs: [
            written('2024-11-12', 1),
            { ...written('2024-11-13', 2), notes: '' },
            { ...written('2024-11-14', 3), notes: 'Twenty pages, then the park' },
          ],
          selectedYear: 2024,
          selectedDate: '2024-11-14',
          currentView: 'year',
          selectedMonth: 10,
        },
        version: 0,
      })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toBeNull()
      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
      expect(useCalendarStore.getState().logs).toHaveLength(3)
    })

    it('opens what 1.5.3 wrote', async () => {
      const stored = JSON.stringify({
        state: {
          activities: [writtenActivity, { ...writtenActivity, id: '1762000000000-q1w2e3r4t' }],
          logs: [written('2026-10-30', 1), written('2026-10-31', 2)],
          yearMode: 'byActivity',
          reminderEnabled: true,
          reminderHour: 0,
          reminderTimeChosen: true,
          reminderMinute: 59,
          reminderOffered: true,
          firstOpenedAt: '2026-09-02',
          feedbackInviteSeen: true,
          storeReviewOffered: false,
          checkinEnabled: true,
          checkinNoticeSeen: true,
          checkinId: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
          checkinLastAttempt: { date: '2026-10-31', at: '2026-10-31T09:00:01.000Z', ok: false },
          updateNoticeSeenFor: '1.5.3',
          updatesEnabled: false,
        },
        version: 0,
      })
      localStorage.setItem(STORAGE_KEY, stored)

      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toBeNull()
      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
      expect(useCalendarStore.getState().reminderHour).toBe(0)
      expect(useCalendarStore.getState().reminderMinute).toBe(59)
    })

    it('still opens an empty storage as a new installation', async () => {
      await useCalendarStore.persist.rehydrate()

      expect(useRescueStore.getState().failure).toBeNull()
      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
      expect(useCalendarStore.getState()._checkinStart).toBe('new')
    })
  })
})

/**
 * The other half of #221's trap. A stored version this build does not know must reach the
 * rescue screen, not merge: without a migrate, zustand throws the value away and hands
 * merge undefined, which looks like a new installation.
 */
describe('the persisted format', () => {
  it('refuses every version but its own', () => {
    const { migrate } = useCalendarStore.persist.getOptions()
    expect(migrate).toBeTypeOf('function')
    for (const version of [-1, 1, 7]) {
      expect(() => migrate!({}, version)).toThrow()
    }
  })

  // When this changes, migrate has to translate every earlier version instead of refusing
  // it, or every copy that updates lands on the rescue screen. Change this test with it.
  it('is still at version 0', () => {
    expect(useCalendarStore.persist.getOptions().version ?? 0).toBe(0)
    expect(PERSIST_VERSION).toBe(0)
  })
})
