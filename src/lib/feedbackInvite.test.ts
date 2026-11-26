import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FEEDBACK_MAILTO, openMailto, shouldInviteFeedback } from './feedbackInvite'
import type { ActivityLog } from '../types'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
  isTauri: () => Boolean((globalThis as { isTauri?: boolean }).isTauri),
}))

/** One log per day, created on that day, which is how a person using the app makes them. */
const on = (days: string[]): ActivityLog[] =>
  days.map((day) => ({
    id: day,
    activityId: 'a1',
    date: day,
    completed: true,
    createdAt: day,
  }))

/**
 * Everything true and no more than true, so each test can say what it is about by
 * changing one thing. Seven calendar days from the first record to today, which is the
 * whole gate.
 */
const ready = {
  today: '2026-03-01',
  firstOpenedAt: '2026-02-22',
  logs: on(['2026-02-22']),
  feedbackInviteSeen: false,
  loggedThisSession: true,
  offerThisSession: null,
  reminderOfferPending: false,
} as const

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined)
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('when the invitation is offered', () => {
  it('a week after the first record', () => {
    expect(shouldInviteFeedback(ready)).toBe(true)
  })

  it('never twice', () => {
    expect(shouldInviteFeedback({ ...ready, feedbackInviteSeen: true })).toBe(false)
  })

  // It is mounted behind the day sheet, so there has to be a day sheet.
  it('only once something has been ticked this session', () => {
    expect(shouldInviteFeedback({ ...ready, loggedThisSession: false })).toBe(false)
  })

  // Somebody setting up a new phone is not the person to ask for a favour.
  // A restored backup can carry a year, and the person is still setting a phone up.
  it('not even to somebody who restored a year of records today', () => {
    const aYear = Array.from({ length: 365 }, (_, i) => {
      const day = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)
      return { id: `l${i}`, activityId: 'a1', date: day, completed: true, createdAt: day }
    })

    expect(shouldInviteFeedback({ ...ready, firstOpenedAt: ready.today, logs: aYear })).toBe(false)
  })

  it('never on the first day of an installation', () => {
    expect(shouldInviteFeedback({ ...ready, firstOpenedAt: '2026-03-01' })).toBe(false)
    expect(shouldInviteFeedback({ ...ready, firstOpenedAt: null })).toBe(false)
  })
})

describe('the week it asks about', () => {
  it('is not there at six days', () => {
    expect(shouldInviteFeedback({ ...ready, today: '2026-02-28' })).toBe(false)
  })

  it('is there at seven', () => {
    expect(shouldInviteFeedback({ ...ready, today: '2026-03-01' })).toBe(true)
  })

  // Somebody who restored a backup onto a new phone has lived with Daylo for a year, and
  // the oldest record says so even though this installation is two days old.
  it('counts from the oldest record when a backup was restored', () => {
    const restored = {
      ...ready,
      today: '2026-03-01',
      firstOpenedAt: '2026-02-27',
      logs: on(['2025-05-01']),
    }

    expect(shouldInviteFeedback(restored)).toBe(true)
  })

  // Pinned as it behaves, not as it should: firstOpenedAt is compared with the oldest
  // record as text. A value that is not a day and sorts after the digits ("not a day")
  // loses to the record, and the week counts from the record. One that sorts before them
  // ("1 day") wins, the week is counted from something that is not a date, and the answer
  // is no. The month's figure reads the same field differently (lib/firstDay), and that
  // must not leak in here.
  it('compares a firstOpenedAt that is not a day as text, against the oldest record', () => {
    expect(shouldInviteFeedback({ ...ready, firstOpenedAt: 'not a day' })).toBe(true)
    expect(shouldInviteFeedback({ ...ready, firstOpenedAt: '1 day' })).toBe(false)
  })
})

describe('how many days were used no longer counts', () => {
  // It asked for three distinct days of use as well, and that condition is gone. A week
  // between the first record and today already means somebody came back, which is the
  // only thing the three days were measuring, and it means it with one condition less to
  // explain and one less to get wrong.
  it('one day of use is enough, a week later', () => {
    expect(shouldInviteFeedback({ ...ready, logs: on(['2026-02-22']) })).toBe(true)
  })

  // Thirty days filled in one afternoon used to be refused for being one afternoon. It is
  // accepted now, and deliberately: what is being asked is whether a week has passed with
  // this person still here, not how busy they were.
  it('so does a month filled in one sitting, once the week has passed', () => {
    const oneSitting = Array.from({ length: 30 }, (_, i) => ({
      id: `l${i}`,
      activityId: 'a1',
      date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      completed: true,
      createdAt: '2026-02-22',
    }))

    expect(shouldInviteFeedback({ ...ready, logs: oneSitting })).toBe(true)
  })

  it('needs at least one record at all', () => {
    expect(shouldInviteFeedback({ ...ready, logs: [] })).toBe(false)
  })
})

// Two things want the same session and neither may talk over the other.
describe('giving way to the reminder offer', () => {
  it('stands down when it has already been made this session', () => {
    expect(shouldInviteFeedback({ ...ready, offerThisSession: 'reminder' })).toBe(false)
  })

  it('stands down while it is still owed', () => {
    expect(shouldInviteFeedback({ ...ready, reminderOfferPending: true })).toBe(false)
  })
})

describe('the letter it opens', () => {
  it('is addressed and filled in, and says nothing about the person', () => {
    expect(FEEDBACK_MAILTO).toBe(
      'mailto:daylo@henfrydls.com?subject=How%20Daylo%20is%20going&body=What%20I%20am%20tracking%3A%0D%0A%0D%0AWhat%20works%3A%0D%0A%0D%0AWhat%20I%20wish%20it%20did%3A%0D%0A'
    )
  })

  it('goes through the platform when there is one', async () => {
    vi.stubGlobal('isTauri', true)

    await expect(openMailto(FEEDBACK_MAILTO)).resolves.toBe('opened')

    expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', { url: FEEDBACK_MAILTO })
  })

  // A phone with no mail app rejects, and the band has to keep the address on screen.
  it('says so when the platform refuses', async () => {
    vi.stubGlobal('isTauri', true)
    invoke.mockRejectedValue(new Error('ActivityNotFoundException'))

    await expect(openMailto(FEEDBACK_MAILTO)).resolves.toBe('failed')
  })

  it('leaves it to the browser everywhere else', async () => {
    await expect(openMailto(FEEDBACK_MAILTO)).resolves.toBe('opened')

    expect(invoke).not.toHaveBeenCalled()
  })
})

/**
 * A log whose createdAt parseISO cannot read used to throw a RangeError from here, and
 * App renders this on every tick. Such a record does not count towards the week; it is
 * not a reason to stop the app.
 */
describe('a record whose creation date does not read', () => {
  const with_ = (createdAt: string): ActivityLog => ({
    id: createdAt,
    activityId: 'a1',
    date: '2026-02-22',
    completed: true,
    createdAt,
  })

  it.each(['2026/11/01', 'Sun Nov 01 2026', '1', '12', '2026-02-30', 'garbage', ''])(
    'does not throw on %j',
    (bad) => {
      expect(() => shouldInviteFeedback({ ...ready, logs: [with_(bad)] })).not.toThrow()
    }
  )

  it('does not count, so it cannot make somebody older than they are', () => {
    // firstOpenedAt alone is three days ago; the unreadable record is the only thing
    // that could have said a week, and it does not.
    expect(
      shouldInviteFeedback({
        ...ready,
        firstOpenedAt: '2026-02-26',
        logs: [with_('2020/01/01'), ...on(['2026-02-27'])],
      })
    ).toBe(false)
  })

  it('leaves the others to count as before', () => {
    expect(
      shouldInviteFeedback({ ...ready, logs: [with_('garbage'), ...on(['2026-02-22'])] })
    ).toBe(true)
  })

  it('falls back to the first day the app was opened when no record reads', () => {
    expect(shouldInviteFeedback({ ...ready, logs: [with_('garbage')] })).toBe(true)
    expect(
      shouldInviteFeedback({ ...ready, firstOpenedAt: '2026-02-26', logs: [with_('garbage')] })
    ).toBe(false)
  })
})
