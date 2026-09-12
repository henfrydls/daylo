import { describe, it, expect } from 'vitest'
import { buildYearGrid } from './yearGrid'
import { formatDate } from './dates'

const flat = (year: number) => buildYearGrid(year).weeks.flat()
const days = (year: number) => flat(year).filter((d): d is Date => d !== null)

describe('the shape of the year', () => {
  it('is seven rows deep, always', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      const { weeks } = buildYearGrid(year)
      expect(weeks.every((w) => w.length === 7)).toBe(true)
    }
  })

  // A year does not begin on a Sunday, and the grid reads down the week, so January 1st
  // has to sit in the first column at its own weekday, with padding above it.
  it('puts January 1st in the first column at its own weekday', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028]) {
      const first = new Date(year, 0, 1)
      const column = buildYearGrid(year).weeks[0]
      expect(column[first.getDay()] && formatDate(column[first.getDay()]!)).toBe(formatDate(first))
      expect(column.slice(0, first.getDay()).every((c) => c === null)).toBe(true)
    }
  })

  // 53 is the usual answer and the one everybody quotes, but a leap year that begins on a
  // Saturday needs 54 columns. Hard-coding 53 would drop the last days of it.
  it('is 53 columns for 2026 and 54 for 2028', () => {
    expect(buildYearGrid(2026).weeks).toHaveLength(53)
    expect(buildYearGrid(2028).weeks).toHaveLength(54)
  })
})

describe('the days in it', () => {
  it('holds every day of the year, once, in order', () => {
    const got = days(2026).map(formatDate)
    expect(got[0]).toBe('2026-01-01')
    expect(got[got.length - 1]).toBe('2026-12-31')
    expect(got).toHaveLength(365)
    expect(new Set(got).size).toBe(365)
  })

  it('counts a leap day', () => {
    expect(days(2028)).toHaveLength(366)
    expect(days(2028).map(formatDate)).toContain('2028-02-29')
  })

  // The padding exists to line the first and last weeks up. Anywhere else it would be a
  // hole in the year.
  it('pads only at the two ends', () => {
    const cells = flat(2026)
    const first = cells.findIndex((c) => c !== null)
    const last = cells.length - 1 - [...cells].reverse().findIndex((c) => c !== null)
    expect(cells.slice(first, last + 1).every((c) => c !== null)).toBe(true)
  })
})

describe('the month labels', () => {
  it('names all twelve, each over the column its first day falls in', () => {
    const { weeks, monthLabels } = buildYearGrid(2026)
    expect(monthLabels).toHaveLength(12)

    for (const { month, column } of monthLabels) {
      const inColumn = weeks[column].filter((d): d is Date => d !== null)
      expect(inColumn.some((d) => d.getMonth() === month && d.getDate() === 1)).toBe(true)
    }
  })

  it('puts January over the first column', () => {
    expect(buildYearGrid(2026).monthLabels[0]).toEqual({ month: 0, column: 0 })
  })
})
