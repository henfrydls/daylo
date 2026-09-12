import { describe, it, expect } from 'vitest'
import { currentStreak, longestStreak } from './streaks'

const on = (...dates: string[]) => new Set(dates)
const march = (day: number) => new Date(2026, 2, day, 12)

describe('the current streak', () => {
  it('counts the run of days ending today', () => {
    expect(currentStreak(on('2026-03-02', '2026-03-03', '2026-03-04'), march(4))).toBe(3)
  })

  it('is nothing when there is nothing', () => {
    expect(currentStreak(on(), march(4))).toBe(0)
  })

  // A day is not lost until it is over. Counting back from yesterday when today has not
  // been ticked yet is the difference between a streak that encourages and one that
  // punishes you every morning.
  it('survives a today that has not happened yet', () => {
    expect(currentStreak(on('2026-03-02', '2026-03-03'), march(4))).toBe(2)
  })

  it('ends once yesterday is missing too', () => {
    expect(currentStreak(on('2026-03-01', '2026-03-02'), march(4))).toBe(0)
  })

  it('stops at the first gap rather than counting every day ever done', () => {
    expect(
      currentStreak(on('2026-02-20', '2026-02-21', '2026-03-03', '2026-03-04'), march(4))
    ).toBe(2)
  })

  it('crosses the end of a month', () => {
    expect(
      currentStreak(on('2026-02-27', '2026-02-28', '2026-03-01'), new Date(2026, 2, 1, 12))
    ).toBe(3)
  })

  // A day in the future is not part of a run that ends today.
  it('ignores anything after today', () => {
    expect(currentStreak(on('2026-03-04', '2026-03-10'), march(4))).toBe(1)
  })
})

describe('the current streak, continued', () => {
  // A streak belongs to the person, not to the calendar. Cutting it on 1 January told
  // everybody their run had ended because a year did.
  it('crosses the end of a year', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']
    expect(currentStreak(on(...dates), new Date(2026, 0, 2, 12))).toBe(4)
  })
})

describe('the longest streak', () => {
  it('is nothing when there is nothing', () => {
    expect(longestStreak(on(), march(4))).toBe(0)
  })

  it('is one for a single day', () => {
    expect(longestStreak(on('2026-01-07'), march(4))).toBe(1)
  })

  it('is the best run anywhere, not the most recent one', () => {
    const dates = on(
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-03-03',
      '2026-03-04'
    )
    expect(longestStreak(dates, march(4))).toBe(4)
  })

  it('carries a run across a month and a year', () => {
    const dates = on('2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03')
    expect(longestStreak(dates, march(4))).toBe(5)
  })

  // An import can carry dates in the future. A run nobody has lived yet is not a record.
  it('never counts a day still to come', () => {
    const dates = on('2026-03-04', '2026-06-01', '2026-06-02', '2026-06-03')
    expect(longestStreak(dates, march(4))).toBe(1)
  })

  // A Set keeps insertion order, and the logs it is built from arrive in whatever order
  // the store holds them. Without sorting first, a run written down out of order reads as
  // a pile of single days.
  it('does not care what order the days were logged in', () => {
    const shuffled = on('2026-03-03', '2026-03-01', '2026-03-04', '2026-03-02')
    expect(longestStreak(shuffled, march(4))).toBe(4)
  })

  it('does not join two runs separated by a gap', () => {
    expect(longestStreak(on('2026-03-01', '2026-03-03'), march(4))).toBe(1)
  })
})
