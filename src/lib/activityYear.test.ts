import { describe, it, expect } from 'vitest'
import { summariseActivities } from './activityYear'
import type { Activity, ActivityLog } from '../types'

const activity = (id: string, name: string): Activity => ({
  id,
  name,
  color: '#10B981',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const log = (activityId: string, date: string, completed = true): ActivityLog => ({
  id: `${activityId}-${date}`,
  activityId,
  date,
  completed,
  createdAt: date,
})

const TODAY = new Date(2026, 2, 4, 12)

describe('summarising a year by activity', () => {
  it('keeps the order the activities are in', () => {
    const rows = summariseActivities([activity('a', 'Hiking'), activity('b', 'Walk')], [], TODAY)

    expect(rows.map((r) => r.activity.name)).toEqual(['Hiking', 'Walk'])
  })

  it('counts the days done and the run they are on', () => {
    const rows = summariseActivities(
      [activity('a', 'Hiking')],
      [log('a', '2026-03-02'), log('a', '2026-03-03'), log('a', '2026-03-04')],
      TODAY
    )

    expect(rows[0]).toMatchObject({ days: 3, streak: 3 })
    expect(rows[0].done.has('2026-03-02')).toBe(true)
  })

  // An unticked log is a day with a note on it, not a day the thing was done.
  it('ignores a log that was unticked', () => {
    const rows = summariseActivities(
      [activity('a', 'Hiking')],
      [log('a', '2026-03-04', false)],
      TODAY
    )

    expect(rows[0].days).toBe(0)
  })

  it('never lends one activity the days of another', () => {
    const rows = summariseActivities(
      [activity('a', 'Hiking'), activity('b', 'Walk')],
      [log('a', '2026-03-04'), log('b', '2026-01-01')],
      TODAY
    )

    expect(rows[0].days).toBe(1)
    expect(rows[1].done.has('2026-03-04')).toBe(false)
  })

  it('gives an activity with nothing logged an empty row rather than none', () => {
    const rows = summariseActivities([activity('a', 'Hiking')], [], TODAY)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ days: 0, streak: 0 })
  })
})
