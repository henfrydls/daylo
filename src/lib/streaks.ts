import { subDays } from 'date-fns'
import { formatDate } from './dates'

/**
 * The one rule for streaks in Daylo, agreed before this was written:
 *
 * | case | what it returns |
 * |---|---|
 * | nothing logged at all | 0 |
 * | today done | the run ending today |
 * | today not done yet, yesterday done | the run ending yesterday |
 * | yesterday not done either | 0, a whole day went by |
 * | a gap further back | the run stops at the gap |
 * | the run crosses the end of a month | it keeps going |
 * | the run crosses the end of a year | it keeps going, because a streak belongs to the person and not to the calendar |
 * | a day logged in the future | never counted, in either figure |
 *
 * Both figures are read over every log there is, not over the year being looked at. The
 * current streak is the one ending today whatever year is on screen, and the longest is
 * the best there has ever been.
 */

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

/**
 * The best run there has ever been, up to today.
 *
 * Days still to come are not part of it: an imported file can carry dates in the future,
 * and a streak nobody has lived yet is not an achievement.
 */
export function longestStreak(done: ReadonlySet<string>, today: Date): number {
  const limit = formatDate(today)
  const days = [...done].filter((date) => date <= limit).sort()
  if (days.length === 0) return 0

  let best = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    const expected = formatDate(subDays(new Date(`${days[i]}T12:00:00`), 1))
    run = expected === days[i - 1] ? run + 1 : 1
    best = Math.max(best, run)
  }

  return best
}
