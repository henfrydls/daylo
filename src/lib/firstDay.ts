import { isValid, parseISO } from 'date-fns'
import { formatDate } from './dates'
import { completedDates } from './activityYear'
import type { ActivityLog } from '../types'

/** A day as the app writes firstOpenedAt (formatDate). */
const PLAIN_DAY = /^\d{4}-\d{2}-\d{2}$/
/** A whole moment as the app writes createdAt (toISOString), or with an offset. */
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * A stored day or moment as the local day it fell on, or null when it says neither.
 *
 * `firstOpenedAt` is written as a local day, but it is a plain string in storage and a
 * backup can bring back anything. A moment ("2026-11-20T03:30:00.000Z") is turned into
 * the day it was where the person is, never cut at the tenth character: that is the UTC
 * day, and for anybody west of Greenwich in the evening, or east of it in the morning, it
 * is the wrong one.
 *
 * Only those two shapes, and only real days: parseISO alone reads "2026" and "2026-11" as
 * the 1st of something, and a day is checked by writing it back, so "2026-13-45" and
 * "2026-02-30" do not pass. Anything else is null, never a RangeError from the format.
 */
export function localDay(value: string | null): string | null {
  if (value === null) return null
  if (PLAIN_DAY.test(value)) {
    const day = parseISO(value)
    return isValid(day) && formatDate(day) === value ? value : null
  }
  if (!MOMENT.test(value)) return null
  const moment = parseISO(value)
  return isValid(moment) ? formatDate(moment) : null
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
 * Done only, by completedDates, the same reading of "a day done" as every figure. A day unticked is kept as a record when it has a
 * note, and it is not a day done: a day ticked by mistake, given a note and unticked must
 * not become somebody's first day. By the day each record is for, not the day it was made:
 * somebody who opens Daylo today and marks the six days before it made every record today.
 */
export function oldestDone(logs: ActivityLog[]): string | null {
  return earliest(...completedDates(logs))
}

/**
 * The person's first day, from which the month and the year they started in are counted:
 * the earliest of the day this installation was first opened, the days done in the
 * records it holds, and `kept`, the earliest day done in records it has let go of (see
 * `firstDayKept` in the store). Deleting an activity or replacing everything on import
 * does not move it forward. Unticking the oldest day done does: that is the person saying
 * it was not done.
 *
 * Never later than `today`. firstOpenedAt written in Auckland and read while it is still
 * the day before here, or a clock set back, would otherwise leave the month we are in with
 * no figure and "This Month" blank.
 *
 * It is the rule the invitation to give feedback follows (lib/feedbackInvite), the
 * earliest of the first opening and the oldest record, read for the figures: by the days
 * done, and with a stored value that is not a day read as nothing. The invitation keeps its
 * own reading, by the day each record was made.
 */
export function personFirstDay(
  firstOpenedAt: string | null,
  logs: ActivityLog[],
  kept: string | null,
  today: string
): string | null {
  const first = earliest(localDay(kept), localDay(firstOpenedAt), oldestDone(logs))
  return first === null ? null : earliest(first, today)
}
