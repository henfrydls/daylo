import { describe, it, expect, afterEach } from 'vitest'
import { earliest, localDay, oldestDone, personFirstDay } from './firstDay'
import type { ActivityLog } from '../types'

const log = (date: string, completed = true, createdAt = `${date}T12:00:00.000Z`): ActivityLog => ({
  id: `${date}-${completed}`,
  activityId: 'a',
  date,
  completed,
  createdAt,
})

// vitest.config.ts runs everything in Asia/Kolkata. These switch the zone inside the test
// (Node reads TZ again when it changes) and put it back after. The app's tsconfig has no
// Node types, hence the cast.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env
const ZONE = env.TZ
afterEach(() => {
  // Assigning undefined would leave the text "undefined" as the zone: put back exactly
  // what was there, absence included.
  if (ZONE === undefined) delete env.TZ
  else env.TZ = ZONE
})

/** Runs `check` in `zone`, after making sure the clock really moved there. */
function inZone(zone: string, offsetMinutes: number, check: () => void) {
  env.TZ = zone
  // getTimezoneOffset is minutes behind UTC: positive to the west.
  expect(new Date(2026, 10, 20, 12).getTimezoneOffset()).toBe(offsetMinutes)
  check()
}

/** A today after every day in these tests, so the cap below is not what they are about. */
const T = '2026-11-30'

describe('a stored day', () => {
  it('is left as it is when it is a day', () => {
    expect(localDay('2026-11-20')).toBe('2026-11-20')
    expect(localDay(null)).toBeNull()
  })

  // A backup can bring back anything in a string field. Nothing here may throw on it: a
  // RangeError from a date format takes the whole screen down.
  it('is none at all when the string is not a day or a moment', () => {
    expect(localDay('')).toBeNull()
    expect(localDay('nonsense')).toBeNull()
    expect(localDay('soon')).toBeNull()
  })

  // Only the two shapes the app writes: a day, as firstOpenedAt is written (formatDate),
  // and a whole moment, as createdAt is (toISOString). parseISO alone takes "2026" and
  // "2026-11" as the 1st of something, and "2026-13-45" must not pass as a day.
  it('is none for a day that is not on the calendar, or for part of one', () => {
    expect(localDay('2026-13-45')).toBeNull()
    expect(localDay('2026-02-30')).toBeNull()
    expect(localDay('2026')).toBeNull()
    expect(localDay('2026-11')).toBeNull()
    expect(localDay('2026-11-20T03')).toBeNull()
  })

  it('reads a moment the app wrote as the local day it fell on', () => {
    const written = new Date(2026, 10, 20, 9, 15).toISOString()
    expect(localDay(written)).toBe('2026-11-20')
  })
})

describe('the person first day', () => {
  it('is the earliest of the days given, whichever are missing', () => {
    expect(earliest('2026-11-20', null, '2026-11-19')).toBe('2026-11-19')
    expect(earliest(null, null)).toBeNull()
  })

  it('is the earliest of the day Daylo was first opened and the days done', () => {
    expect(personFirstDay('2026-11-20', [log('2026-11-22')], null, T)).toBe('2026-11-20')
    expect(personFirstDay('2026-11-20', [log('2025-03-01')], null, T)).toBe('2025-03-01')
    expect(personFirstDay(null, [log('2026-11-22'), log('2026-11-21')], null, T)).toBe('2026-11-21')
    expect(personFirstDay(null, [], null, T)).toBeNull()
  })

  // Somebody who opens Daylo today and marks the six days before it made every record
  // today: the day a record is for is what counts, so no marked day is left out.
  it('counts the day a record is for, not the day it was made', () => {
    const today = '2026-11-25T12:00:00.000Z'
    expect(personFirstDay('2026-11-25', [log('2026-11-19', true, today)], null, T)).toBe(
      '2026-11-19'
    )
  })

  // A day unticked is kept as a record only when it has a note. It is not a day done and
  // does not say the person was here: the figures do not count it, and neither does this.
  it('passes over a record that is not done', () => {
    expect(oldestDone([log('2026-11-01', false), log('2026-11-25')])).toBe('2026-11-25')
    expect(personFirstDay('2026-11-25', [log('2026-11-01', false)], null, T)).toBe('2026-11-25')
  })

  // A first day after today: firstOpenedAt written in Auckland and read while it is still
  // the day before here, or a clock set back. The month we are in had no figure at all and
  // "This Month" went blank. No first day is later than today.
  it('is today at the latest', () => {
    expect(personFirstDay('2026-11-26', [], null, '2026-11-25')).toBe('2026-11-25')
    expect(personFirstDay('2026-11-20', [], null, '2026-11-25')).toBe('2026-11-20')
    expect(personFirstDay(null, [], null, '2026-11-25')).toBeNull()
  })

  // What the store kept from records that have gone (see firstDayKept in the store).
  it('takes what was kept from records that have gone', () => {
    expect(personFirstDay('2026-11-20', [log('2026-11-22')], '2026-10-01', T)).toBe('2026-10-01')
    expect(personFirstDay('2026-11-20', [log('2026-11-22')], 'nonsense', T)).toBe('2026-11-20')
  })
})

// The fault of #175: a day read off a moment with toISOString().slice(0, 10) is the UTC
// day. Each case is a first use close to midnight, where the UTC day is another one.
describe('the person first day, where the person is', () => {
  it('west of UTC, late in the evening, is the evening day and not the next one', () => {
    inZone('America/Santo_Domingo', 240, () => {
      // 23:30 on 19 November in Santo Domingo is 03:30 on the 20th in UTC.
      const moment = new Date(2026, 10, 19, 23, 30).toISOString()
      expect(moment.slice(0, 10)).toBe('2026-11-20')

      expect(localDay(moment)).toBe('2026-11-19')
      expect(personFirstDay(moment, [log('2026-11-20')], null, T)).toBe('2026-11-19')
    })
  })

  it('east of UTC, early in the morning, is the morning day and not the one before', () => {
    inZone('Pacific/Auckland', -780, () => {
      // 00:30 on 1 November in Auckland is 11:30 on 31 October in UTC: another month.
      const moment = new Date(2026, 10, 1, 0, 30).toISOString()
      expect(moment.slice(0, 10)).toBe('2026-10-31')

      expect(localDay(moment)).toBe('2026-11-01')
      expect(personFirstDay(moment, [log('2026-11-01')], null, T)).toBe('2026-11-01')
    })
  })
})
