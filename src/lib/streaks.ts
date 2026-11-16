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
 * Whether yesterday can still be saved, and if so the run it would make.
 *
 * Yesterday is open when it is empty and a run of three or more was going into it: the run
 * that ended **the day before yesterday**. Logging it then joins that run to today, and the
 * number returned is the one the header will show once it is logged, today counted if today
 * is already in. It is worked out with `currentStreak` over the same days plus yesterday, so
 * it is not an estimate, which is what lets the screen say it in the future tense.
 *
 * `null` is every other morning, and on those Daylo says nothing at all: a line that only
 * ever appeared the day after a miss would be, by existing, the mark of the miss.
 *
 * Two halves, and each one is load-bearing:
 * - Asked the ordinary way, the streak is already 0 here, because an empty yesterday is
 *   exactly what ends it. A rule reading `currentStreak(done, today)` would never once fire.
 * - The `has` on the day before yesterday. `currentStreak` forgives a day, so asked about
 *   that day without checking it is there, it walks one further back and answers about a
 *   run that ended earlier, and logging yesterday would join nothing to anything.
 *
 * Three, and not one or two: rescuing a run of one or two is not worth a word on screen.
 */
export function yesterdayStillOpen(done: ReadonlySet<string>, today: Date): number | null {
  const yesterday = formatDate(subDays(today, 1))
  const before = subDays(today, 2)
  if (done.has(yesterday)) return null
  if (!done.has(formatDate(before))) return null
  if (currentStreak(done, before) < 3) return null

  return currentStreak(new Set([...done, yesterday]), today)
}

/**
 * The second day, and only that one: one day has ever been logged, it was yesterday, and
 * today is still open.
 *
 * Read from the logs, so nothing is saved to know it and it ends by itself: logging today
 * makes two days, and a day later yesterday is no longer the one there was. A backup
 * comes home with more than one day in it, so somebody who imported never sees it.
 */
export function isSecondDay(done: ReadonlySet<string>, today: Date): boolean {
  return done.size === 1 && done.has(formatDate(subDays(today, 1)))
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

/**
 * Whether the run going now is the best there has ever been.
 *
 * What the streak sheet's second tile is called: "Your best ever" when it is, "Longest"
 * when it is not. Beside a run of the same length, "Longest" reads as a second fact when it
 * is the same one. Never with no run, because nothing equalling nothing is not a record.
 */
export function isBestEver(current: number, best: number): boolean {
  return current > 0 && current === best
}

export interface RecentDay {
  /** yyyy-MM-dd */
  date: string
  /** Whether anything was logged that day. */
  done: boolean
  isToday: boolean
}

/**
 * The last `count` days ending today, oldest first, so today is always the last one.
 *
 * Read with the same set the streak is read from, so a day the sheet shows as done is a day
 * the streak counts.
 */
export function lastDays(done: ReadonlySet<string>, today: Date, count: number): RecentDay[] {
  return Array.from({ length: count }, (_, i) => {
    const date = formatDate(subDays(today, count - 1 - i))
    return { date, done: done.has(date), isToday: i === count - 1 }
  })
}
