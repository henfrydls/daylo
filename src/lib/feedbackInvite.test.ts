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
 * changing one thing. Seven calendar days from the first open to today, and three days
 * with a record on them, which is exactly the gate and not a day over it.
 */
const ready = {
  today: '2026-03-01',
  firstOpenedAt: '2026-02-22',
  logs: on(['2026-02-22', '2026-02-24', '2026-02-26']),
  feedbackInviteSeen: false,
  loggedThisSession: true,
  offerThisSession: null,
  reminderOfferPending: false,
  checkinNoticePending: false,
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
  it('after a week and three days of use', () => {
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
      logs: on(['2025-05-01', '2025-05-02', '2025-05-03']),
    }

    expect(shouldInviteFeedback(restored)).toBe(true)
  })
})

describe('the three days it counts', () => {
  it('are days the app was used, not days that were ticked', () => {
    // Thirty days filled in one afternoon is one afternoon of living with it.
    const oneSitting = Array.from({ length: 30 }, (_, i) => ({
      id: `l${i}`,
      activityId: 'a1',
      date: `2026-02-${String(i + 1).padStart(2, '0')}`,
      completed: true,
      createdAt: '2026-02-28',
    }))

    expect(shouldInviteFeedback({ ...ready, logs: oneSitting })).toBe(false)
  })

  it('are not enough at two', () => {
    expect(shouldInviteFeedback({ ...ready, logs: on(['2026-02-22', '2026-02-24']) })).toBe(false)
  })

  // The gate asks for a record in this session, so the day the band could appear is
  // always one of the three. Three days of use is today and two days before it, which is
  // the smallest number that still means "came back".
  it('include today, because something was recorded this session', () => {
    const untilYesterday = on(['2026-02-22', '2026-02-24', '2026-02-26'])
    const todayToo = [...untilYesterday, ...on(['2026-03-01'])]

    expect(new Set(untilYesterday.map((l) => l.createdAt)).size).toBe(3)
    expect(shouldInviteFeedback({ ...ready, logs: todayToo })).toBe(true)
  })

  it('count a day that was unticked as well, because the app was still opened', () => {
    const withNotes = on(['2026-02-22', '2026-02-24'])
    withNotes.push({
      id: 'x',
      activityId: 'a1',
      date: '2026-02-26',
      completed: false,
      createdAt: '2026-02-26',
    })

    expect(shouldInviteFeedback({ ...ready, logs: withNotes })).toBe(true)
  })

  it('needs at least one record at all', () => {
    expect(shouldInviteFeedback({ ...ready, logs: [] })).toBe(false)
  })
})

// Three things want the same session and none of them may talk over another.
describe('giving way to the other two offers', () => {
  // The slot still has two possible holders in the type, because the store's field does:
  // nothing claims it for the check-in any more, and a session it somehow held would
  // still have to silence this.
  it('stands down when one has already been made this session', () => {
    expect(shouldInviteFeedback({ ...ready, offerThisSession: 'reminder' })).toBe(false)
    expect(shouldInviteFeedback({ ...ready, offerThisSession: 'checkin' })).toBe(false)
  })

  it('stands down while either of the other two is still owed', () => {
    expect(shouldInviteFeedback({ ...ready, reminderOfferPending: true })).toBe(false)
    expect(shouldInviteFeedback({ ...ready, checkinNoticePending: true })).toBe(false)
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
