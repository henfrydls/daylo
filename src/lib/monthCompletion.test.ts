import { describe, it, expect, vi, afterEach } from 'vitest'
import { monthCompletion } from './monthCompletion'

const on = (...dates: string[]) => {
  const done = new Set(dates)
  return (date: string) => done.has(date)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the month completion figure', () => {
  // The case that made the year and the statistics disagree: four days marked by the 20th
  // of November read 13% on the year (four of thirty) and 20% in the statistics (four of
  // twenty). The month is not over, so the days still to come are not missed yet.
  it('counts the current month over its days up to and including today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    const done = on('2026-11-02', '2026-11-05', '2026-11-11', '2026-11-20')

    expect(monthCompletion(2026, 10, done, new Date())).toEqual({
      daysDone: 4,
      daysCounted: 20,
      percentage: 20,
    })
  })

  it('counts a month already over across all of its days', () => {
    const done = on('2026-10-01', '2026-10-15', '2026-10-31')

    expect(monthCompletion(2026, 9, done, new Date(2026, 10, 20, 12))).toEqual({
      daysDone: 3,
      daysCounted: 31,
      percentage: 10,
    })
  })

  it('counts the same month of a year already over across all of its days', () => {
    expect(monthCompletion(2025, 10, on('2025-11-30'), new Date(2026, 10, 20, 12))).toEqual({
      daysDone: 1,
      daysCounted: 30,
      percentage: 3,
    })
  })

  // An import can carry dates in the future. A day still to come is not counted on top
  // either, or the figure could pass 100%.
  it('does not count a day after today, even when it is marked', () => {
    const done = on('2026-11-20', '2026-11-21', '2026-11-30')

    expect(monthCompletion(2026, 10, done, new Date(2026, 10, 20, 12))).toEqual({
      daysDone: 1,
      daysCounted: 20,
      percentage: 5,
    })
  })

  it('counts the first of the month as a whole day on the first', () => {
    expect(monthCompletion(2026, 10, on('2026-11-01'), new Date(2026, 10, 1, 0, 5))).toEqual({
      daysDone: 1,
      daysCounted: 1,
      percentage: 100,
    })
  })

  // Nothing was missed yet in a month that has not begun, so it has no figure at all.
  it('has no figure for a month that has not begun', () => {
    const today = new Date(2026, 10, 20, 12)

    expect(monthCompletion(2026, 11, on('2026-12-01'), today)).toBeNull()
    expect(monthCompletion(2027, 0, on(), today)).toBeNull()
  })
})
