import { addDays, startOfWeek, subWeeks } from 'date-fns'
import { formatDate } from './dates'

export interface WeekBlock {
  /** The Sunday the week begins on. */
  start: Date
  /** Days done inside it, out of seven, whether or not the week is over. */
  days: number
}

/** Half a year, which is as much as a phone can show a week at a time and still be read. */
export const WEEKS_ON_A_PHONE = 26

/**
 * The last twenty six weeks as one block each.
 *
 * A phone cannot show three hundred and sixty five squares and mean anything by them, so
 * the unit becomes the week: a block is darker the more days of that week were done. The
 * denominator stays seven even for the week in progress, because "3/7" on a Wednesday
 * says three days of this week, and rebasing it on the days elapsed would make the last
 * block jump around as the week went on.
 */
export function buildWeekBlocks(
  done: ReadonlySet<string>,
  end: Date,
  weeks: number = WEEKS_ON_A_PHONE
): WeekBlock[] {
  const lastStart = startOfWeek(end, { weekStartsOn: 0 })

  return Array.from({ length: weeks }, (_, index) => {
    const start = subWeeks(lastStart, weeks - 1 - index)
    let days = 0
    for (let day = 0; day < 7; day++) {
      if (done.has(formatDate(addDays(start, day)))) days += 1
    }
    return { start, days }
  })
}
