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
 * is the wrong one.
 */
export function localDay(value: string | null): string | null {
  if (value === null) return null
  if (PLAIN_DAY.test(value)) return value
  const moment = parseISO(value)
  return Number.isNaN(moment.getTime()) ? null : formatDate(moment)
}

/** The day a record was made, where the person was: a day they had the app open. */
export const recordDay = (log: ActivityLog): string => formatDate(parseISO(log.createdAt))

/**
 * The person's first day: the earliest of the day this installation was first opened and
 * the days of the records it holds.
 *
 * Somebody who restored a backup onto a new phone has lived with Daylo for a year and is
 * not new because the handset is: their records are older than `firstOpenedAt`, and they
 * win. The callers choose which days of a record count, and the invitation to give
 * feedback and the month's figure choose differently (see each).
 *
 * Null when there is nothing to go on. Days are YYYY-MM-DD, which sorts as it reads.
 */
export function firstDay(firstOpenedAt: string | null, days: Iterable<string>): string | null {
  let start = localDay(firstOpenedAt)
  for (const day of days) if (start === null || day < start) start = day
  return start
}

/**
 * The first day as the month's figure counts it: the invitation's rule (the day each
 * record was made), plus the day each record is for.
 *
 * The day it is for matters on the first day itself. Somebody who opens Daylo today and
 * marks the six days before it has made every record today, and counting from today alone
 * would say "1 of 1" over a week of green squares. It can only move the first day earlier,
 * so it never hides a day that is marked.
 */
export function monthStart(firstOpenedAt: string | null, logs: readonly ActivityLog[]) {
  const days: string[] = []
  for (const log of logs) {
    days.push(log.date)
    // Through localDay, so a record whose moment does not parse is passed over here
    // rather than taking the whole screen down with a RangeError.
    const made = localDay(log.createdAt)
    if (made !== null) days.push(made)
  }
  return firstDay(firstOpenedAt, days)
}
