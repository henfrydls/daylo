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

/** Everything true, so each test can say what it is about by changing one thing. */
const ready = {
  today: '2026-03-01',
  firstOpenedAt: '2026-02-10',
  logs: on([
    '2026-02-10',
    '2026-02-11',
    '2026-02-12',
    '2026-02-13',
    '2026-02-14',
    '2026-02-15',
    '2026-02-16',
    '2026-02-17',
  ]),
  feedbackInviteSeen: false,
  loggedThisSession: true,
  offerThisSession: null,
  reminderOfferPending: false,
  checkinOfferPending: false,
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
  it('after two weeks and eight days of use', () => {
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

describe('the two weeks it asks about', () => {
  it('are not there at thirteen days', () => {
    expect(shouldInviteFeedback({ ...ready, today: '2026-02-23' })).toBe(false)
  })

  it('are there at fourteen', () => {
    expect(shouldInviteFeedback({ ...ready, today: '2026-02-24' })).toBe(true)
  })

  // Somebody who restored a backup onto a new phone has lived with Daylo for a year, and
  // the oldest record says so even though this installation is two days old.
  it('count from the oldest record when a backup was restored', () => {
    const restored = {
      ...ready,
      today: '2026-03-01',
      firstOpenedAt: '2026-02-27',
      logs: on([
        '2025-05-01',
        '2025-05-02',
        '2025-05-03',
        '2025-05-04',
        '2025-05-05',
        '2025-05-06',
        '2025-05-07',
        '2025-05-08',
      ]),
    }

    expect(shouldInviteFeedback(restored)).toBe(true)
  })
})

describe('the eight days it counts', () => {
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

  it('are not enough at seven', () => {
    expect(
      shouldInviteFeedback({
        ...ready,
        logs: on([
          '2026-02-10',
          '2026-02-11',
          '2026-02-12',
          '2026-02-13',
          '2026-02-14',
          '2026-02-15',
          '2026-02-16',
        ]),
      })
    ).toBe(false)
  })

  it('count a day that was unticked as well, because the app was still opened', () => {
    const withNotes = on([
      '2026-02-10',
      '2026-02-11',
      '2026-02-12',
      '2026-02-13',
      '2026-02-14',
      '2026-02-15',
      '2026-02-16',
    ])
    withNotes.push({
      id: 'x',
      activityId: 'a1',
      date: '2026-02-17',
      completed: false,
      createdAt: '2026-02-17',
    })

    expect(shouldInviteFeedback({ ...ready, logs: withNotes })).toBe(true)
  })

  it('needs at least one record at all', () => {
    expect(shouldInviteFeedback({ ...ready, logs: [] })).toBe(false)
  })
})

// Three things want the same session and none of them may talk over another.
describe('giving way to the other two offers', () => {
  it('stands down when one has already been made this session', () => {
    expect(shouldInviteFeedback({ ...ready, offerThisSession: 'reminder' })).toBe(false)
    expect(shouldInviteFeedback({ ...ready, offerThisSession: 'checkin' })).toBe(false)
  })

  it('stands down when either of them is still owed', () => {
    expect(shouldInviteFeedback({ ...ready, reminderOfferPending: true })).toBe(false)
    expect(shouldInviteFeedback({ ...ready, checkinOfferPending: true })).toBe(false)
  })
})

describe('the letter it opens', () => {
  it('is addressed and filled in, and says nothing about the person', () => {
    expect(FEEDBACK_MAILTO).toBe(
      'mailto:daylo@henfrydls.com?subject=Two%20weeks%20with%20Daylo&body=What%20I%20am%20tracking%3A%0D%0A%0D%0AWhat%20works%3A%0D%0A%0D%0AWhat%20I%20wish%20it%20did%3A%0D%0A'
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
