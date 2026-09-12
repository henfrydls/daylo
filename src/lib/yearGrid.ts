import { addDays, startOfWeek, endOfWeek } from 'date-fns'

/**
 * The year laid out the way a contribution graph reads: one column per week, seven rows,
 * Sunday at the top.
 *
 * The first column starts on the Sunday on or before January 1st and the last ends on the
 * Saturday on or after December 31st, so the rows are weekdays all the way across. The
 * cells that fall outside the year are null: they exist to hold the shape, and nothing
 * should be drawn in them.
 */
export interface YearGrid {
  /** Columns of seven, top to bottom Sunday to Saturday. */
  weeks: (Date | null)[][]
  /** Where to write each month's name: the column its first day falls in. */
  monthLabels: { month: number; column: number }[]
}

export function buildYearGrid(year: number): YearGrid {
  const first = new Date(year, 0, 1)
  const last = new Date(year, 11, 31)
  const start = startOfWeek(first, { weekStartsOn: 0 })
  const end = endOfWeek(last, { weekStartsOn: 0 })

  const weeks: (Date | null)[][] = []
  const monthLabels: { month: number; column: number }[] = []

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7)) {
    const column: (Date | null)[] = []
    for (let row = 0; row < 7; row++) {
      const date = addDays(cursor, row)
      // Outside the year is padding, not a day. A grid that ran into the neighbouring
      // years would colour days that belong to a different total.
      column.push(date.getFullYear() === year ? date : null)

      if (date.getFullYear() === year && date.getDate() === 1) {
        monthLabels.push({ month: date.getMonth(), column: weeks.length })
      }
    }
    weeks.push(column)
  }

  return { weeks, monthLabels }
}
