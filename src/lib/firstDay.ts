import { parseISO } from 'date-fns'
import { formatDate } from './dates'
import type { ActivityLog } from '../types'

const PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A stored day or moment as the local day it fell on, or null when it says neither.
 *
 * `firstOpenedAt` is written as a local day, but it is a plain string in storage and a
 * backup can bring back anything. A moment ("2026-11-20T03:30:00.000Z") is turned into
 * the day it was where the person is, never cut at the tenth character: that is the UTC
 * day, and for anybody west of Greenwich in the evening, or east of it in the morning, it
 * is the wrong one. Anything else is null, never a RangeError from the date format.
 */
export function localDay(value: string | null): string | null {
  if (value === null) return null
  if (PLAIN_DAY.test(value)) return value
  const moment = parseISO(value)
  return Number.isNaN(moment.getTime()) ? null : formatDate(moment)
}

/** The earliest of some days, YYYY-MM-DD, which sorts as it reads. Null for none. */
export function earliest(...days: (string | null)[]): string | null {
  let first: string | null = null
  for (const day of days) if (day !== null && (first === null || day < first)) first = day
  return first
}

/**
 * The oldest day with something done in these records, or null.
 *
 * Done only, as every figure counts. A day unticked is kept as a record when it has a
 * note, and it is not a day done: a day ticked by mistake, given a note and unticked must
 * not become somebody's first day. By the day each record is for, not the day it was made:
 * somebody who opens Daylo today and marks the six days before it made every record today.
 */
export function oldestDone(logs: readonly ActivityLog[]): string | null {
  let first: string | null = null
  for (const log of logs) {
    if (log.completed && (first === null || log.date < first)) first = log.date
  }
  return first
}

/**
 * The person's first day, from which the month and the year they started in are counted:
 * the earliest of the day this installation was first opened, the days done in the
 * records it holds, and `kept`, the earliest day done in records it has let go of (see
 * `firstDayKept` in the store, which is what makes this day only ever move back).
 *
 * It is the rule the invitation to give feedback follows (lib/feedbackInvite), the
 * earliest of the first opening and the oldest record, read for the figures: by the days
 * done, and with a stored value that is not a day read as nothing. The invitation keeps its
 * own reading, by the day each record was made.
 */
export function personFirstDay(
  firstOpenedAt: string | null,
  logs: readonly ActivityLog[],
  kept: string | null
): string | null {
  return earliest(localDay(kept), localDay(firstOpenedAt), oldestDone(logs))
}
