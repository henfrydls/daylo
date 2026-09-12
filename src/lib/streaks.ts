import { subDays } from 'date-fns'
import { formatDate } from './dates'

/**
 * How many days in a row, ending now, something was done.
 *
 * Today not being ticked yet does not end a streak: the count falls back to yesterday, so
 * a person who opens Daylo in the morning is not told their run is over before the day has
 * had a chance to happen. Once yesterday is missing too, it is over.
 */
export function currentStreak(done: ReadonlySet<string>, today: Date): number {
  let cursor = done.has(formatDate(today)) ? today : subDays(today, 1)
  let streak = 0

  while (done.has(formatDate(cursor))) {
    streak += 1
    cursor = subDays(cursor, 1)
  }

  return streak
}
