import { describe, it, expect } from 'vitest'
import { buildWeekBlocks } from './weekBlocks'
import { formatDate } from './dates'

const done = (...dates: string[]) => new Set(dates)
// A Wednesday, so the last block is a week in progress rather than a tidy one.
const WEDNESDAY = new Date(2026, 8, 9, 12)

describe('the strip', () => {
  it('is twenty six weeks long', () => {
    expect(buildWeekBlocks(done(), WEDNESDAY)).toHaveLength(26)
  })

  it('ends with the week we are in, and starts twenty five before it', () => {
    const blocks = buildWeekBlocks(done(), WEDNESDAY)

    // The Sunday of the week holding 9 September 2026.
    expect(formatDate(blocks[25].start)).toBe('2026-09-06')
    expect(formatDate(blocks[0].start)).toBe('2026-03-15')
  })

  it('starts every block on a Sunday', () => {
    expect(buildWeekBlocks(done(), WEDNESDAY).every((b) => b.start.getDay() === 0)).toBe(true)
  })
})

describe('what each block counts', () => {
  it('counts the days done inside its own week', () => {
    const blocks = buildWeekBlocks(done('2026-09-06', '2026-09-08', '2026-09-09'), WEDNESDAY)

    expect(blocks[25].days).toBe(3)
    expect(blocks[24].days).toBe(0)
  })

  // Seven is the denominator whether or not the week is over, which is what "3/7" means
  // on a Wednesday: three days of the week, not three of the three that have happened.
  it('does not shrink the week it is in', () => {
    const blocks = buildWeekBlocks(done('2026-09-06', '2026-09-07'), WEDNESDAY)

    expect(blocks[25]).toEqual({ start: blocks[25].start, days: 2 })
  })

  it('ignores a day outside the twenty six weeks', () => {
    const blocks = buildWeekBlocks(done('2026-01-05', '2026-03-14'), WEDNESDAY)

    expect(blocks.reduce((total, b) => total + b.days, 0)).toBe(0)
  })

  it('ignores a day still to come', () => {
    const blocks = buildWeekBlocks(done('2026-09-12'), WEDNESDAY)

    // Saturday of the current week is in the window and counts; the week after is not.
    expect(blocks[25].days).toBe(1)
    expect(buildWeekBlocks(done('2026-09-13'), WEDNESDAY).reduce((t, b) => t + b.days, 0)).toBe(0)
  })
})
