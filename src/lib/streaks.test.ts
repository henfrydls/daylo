import { describe, it, expect } from 'vitest'
import { currentStreak } from './streaks'

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
