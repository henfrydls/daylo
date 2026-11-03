import { describe, it, expect } from 'vitest'
import { habitsThatExistedOn } from './activityYear'
import type { Activity } from '../types'

function made(id: string, on: string): Activity {
  return {
    id,
    name: id,
    color: '#10B981',
    createdAt: `${on}T09:00:00.000Z`,
    updatedAt: `${on}T09:00:00.000Z`,
  }
}

describe('how many habits existed on a day', () => {
  // Adding a habit used to repaint the whole year paler: a day in March was judged against
  // the habits of today, so creating a fourth one turned half a year grey. Nobody did
  // anything differently in March.
  it('counts only the habits that existed by then', () => {
    const on = habitsThatExistedOn([made('a', '2026-01-10'), made('b', '2026-06-01')])

    expect(on('2026-01-09', 0)).toBe(0)
    expect(on('2026-01-10', 0)).toBe(1)
    expect(on('2026-05-31', 0)).toBe(1)
    expect(on('2026-06-01', 0)).toBe(2)
    expect(on('2026-11-03', 0)).toBe(2)
  })

  it('answers zero when there are no habits at all', () => {
    expect(habitsThatExistedOn([])('2026-11-03', 0)).toBe(0)
  })

  // An imported file can carry logs older than the habit they belong to: the export keeps
  // the logs and the habit is created fresh on the way in. Counting only by createdAt would
  // make a day with work done come out grey, which is worse than the fault being fixed.
  it('never reports fewer habits than the day has completed logs', () => {
    const on = habitsThatExistedOn([made('a', '2026-06-01')])

    expect(on('2026-01-10', 2)).toBe(2)
    expect(on('2026-06-02', 1)).toBe(1)
  })
})
