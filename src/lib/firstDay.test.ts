import { describe, it, expect, afterEach } from 'vitest'
import { firstDay, localDay, monthStart } from './firstDay'
import type { ActivityLog } from '../types'

const log = (date: string, createdAt: string): ActivityLog => ({
  id: `${date}-${createdAt}`,
  activityId: 'a',
  date,
  completed: true,
  createdAt,
})

// vitest.config.ts runs everything in Asia/Kolkata. These switch the zone inside the test
// (Node reads TZ again when it changes) and put it back after. The app's tsconfig has no
// Node types, hence the cast.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env
const ZONE = env.TZ
afterEach(() => {
  env.TZ = ZONE
})

/** Runs `check` in `zone`, after making sure the clock really moved there. */
function inZone(zone: string, offsetMinutes: number, check: () => void) {
  env.TZ = zone
  // getTimezoneOffset is minutes behind UTC: positive to the west.
  expect(new Date(2026, 10, 20, 12).getTimezoneOffset()).toBe(offsetMinutes)
  check()
}

describe('the person first day', () => {
  it('is the earliest of the day the app was opened and the days given', () => {
    expect(firstDay('2026-11-20', ['2026-11-22', '2026-11-21'])).toBe('2026-11-20')
    expect(firstDay('2026-11-20', ['2026-11-22', '2025-03-01'])).toBe('2025-03-01')
    expect(firstDay(null, ['2026-11-22', '2026-11-21'])).toBe('2026-11-21')
    expect(firstDay(null, [])).toBeNull()
  })

  // Somebody who opens Daylo today and marks the six days before it made every record
  // today. The month counts from the first of those days, so no marked day is left out.
  it('for the month, counts the day a record is for as well as the day it was made', () => {
    const made = new Date(2026, 10, 25, 12).toISOString()
    expect(monthStart('2026-11-25', [log('2026-11-19', made), log('2026-11-25', made)])).toBe(
      '2026-11-19'
    )
  })

  it('for the month, passes over a record whose moment does not parse', () => {
    expect(monthStart('2026-11-25', [log('2026-11-24', 'not a moment')])).toBe('2026-11-24')
  })

  it('leaves a stored day as it is, and has none for a string that is not one', () => {
    expect(localDay('2026-11-20')).toBe('2026-11-20')
    expect(localDay(null)).toBeNull()
    expect(localDay('soon')).toBeNull()
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
      expect(monthStart(moment, [])).toBe('2026-11-19')
      expect(monthStart(null, [log('2026-11-20', moment)])).toBe('2026-11-19')
    })
  })

  it('east of UTC, early in the morning, is the morning day and not the one before', () => {
    inZone('Pacific/Auckland', -780, () => {
      // 00:30 on 1 November in Auckland is 11:30 on 31 October in UTC: another month.
      const moment = new Date(2026, 10, 1, 0, 30).toISOString()
      expect(moment.slice(0, 10)).toBe('2026-10-31')

      expect(localDay(moment)).toBe('2026-11-01')
      expect(monthStart(moment, [])).toBe('2026-11-01')
      expect(monthStart(null, [log('2026-11-01', moment)])).toBe('2026-11-01')
    })
  })
})
