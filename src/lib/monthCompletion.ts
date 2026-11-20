import { formatDate } from './dates'

/** How a month stands: the days with something done over the days that count. */
export interface MonthCompletion {
  daysDone: number
  daysCounted: number
  percentage: number
}

/**
 * The one rule for a month's completion figure, wherever it is shown: the year's row of
 * months, the phone's month cards and "This Month" in the statistics.
 *
 * A day counts as done when anything was completed on it. The days that count are the
 * month's days up to and including today: all of them in a month already over, and only
 * the ones gone by in the month we are in, because a day still to come has not been
 * missed. Each view used to work this out on its own, and the year divided the current
 * month by all of its days while the statistics divided by the days gone by: four days
 * marked by the 20th of November read 13% in one place and 20% in the other.
 *
 * A day after today is never counted as done either, even when an import carries one, or
 * the figure could pass 100%. A month that has not begun has no figure at all: null,
 * because nothing has been missed yet and the caller decides how to say so.
 */
export function monthCompletion(
  year: number,
  month: number,
  isDone: (date: string) => boolean,
  today: Date
): MonthCompletion | null {
  const limit = formatDate(today)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  let daysCounted = 0
  let daysDone = 0
  for (let day = 1; day <= daysInMonth; day++) {
    const date = formatDate(new Date(year, month, day))
    if (date > limit) break
    daysCounted += 1
    if (isDone(date)) daysDone += 1
  }

  if (daysCounted === 0) return null

  return { daysDone, daysCounted, percentage: Math.round((daysDone / daysCounted) * 100) }
}
