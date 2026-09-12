import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { YearByActivity } from './YearByActivity'
import type { Activity, ActivityLog, HeatmapLevel } from '../../types'

const onSelectDate = vi.fn()

const activity = (id: string, name: string, color: string): Activity => ({
  id,
  name,
  color,
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

const ACTIVITIES = [activity('a1', 'Hiking', '#8B5CF6'), activity('a2', 'Walk', '#EF4444')]

const LOGS = [
  log('a1', '2026-03-02'),
  log('a1', '2026-03-03'),
  log('a1', '2026-03-04'),
  log('a2', '2026-01-15'),
  // Unticked days are kept when they carry a note; they are not days the thing was done.
  log('a2', '2026-03-04', false),
]

function paint(props: Partial<Parameters<typeof YearByActivity>[0]> = {}) {
  return render(
    <YearByActivity
      year={2026}
      activities={ACTIVITIES}
      logs={LOGS}
      dayData={new Map<string, { completedCount: number; level: HeatmapLevel }>()}
      activeDays={4}
      selectedDate={null}
      onSelectDate={onSelectDate}
      {...props}
    />
  )
}

const row = (name: string) => screen.getByTestId(`activity-row-${name}`)

beforeEach(() => {
  onSelectDate.mockReset()
  vi.setSystemTime(new Date(2026, 2, 4, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the rows', () => {
  it('gives every activity one, in the order they are listed', () => {
    paint()

    const names = screen.getAllByTestId(/^activity-row-/).map((r) => r.dataset.testid)
    expect(names).toEqual(['activity-row-Hiking', 'activity-row-Walk', 'activity-row-All'])
  })

  it('says how many days and how long a run', () => {
    paint()

    expect(row('Hiking')).toHaveTextContent('3 days')
    expect(row('Hiking')).toHaveTextContent('3 day streak')
    // One day in January, and nothing since: the run is over.
    expect(row('Walk')).toHaveTextContent('1 day')
    expect(row('Walk')).toHaveTextContent('0 day streak')
  })

  // An unticked log is a day with a note on it, not a day the thing was done. Counting it
  // would inflate every figure on this screen.
  it('counts only the days actually done', () => {
    paint()

    expect(row('Walk')).not.toHaveTextContent('2 days')
  })

  it('paints each activity in its own colour', () => {
    paint()

    const cell = within(row('Hiking'))
      .getAllByTestId('day-cell')
      .find((c) => c.dataset.date === '2026-03-04')
    expect(cell).toHaveStyle({ backgroundColor: '#8B5CF6' })
  })

  // The totals row is what the other view shows, kept at the bottom so the two can be
  // compared without switching.
  it('ends with the year as a whole', () => {
    paint()

    expect(row('All')).toHaveTextContent('All activities')
    expect(row('All')).toHaveTextContent('4 active days')
  })
})

describe('with nothing to show', () => {
  it('says so instead of drawing an empty frame', () => {
    paint({ activities: [], logs: [] })

    expect(screen.getByText(/no activities yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId(/^activity-row-/)).not.toBeInTheDocument()
  })
})

// One set of month names for the stack. The columns of every row are the same weeks, so
// repeating the names four times says nothing new and costs a line of height each.
it('writes the month names once, above the first row', () => {
  paint()

  expect(screen.getAllByText('Jan')).toHaveLength(1)
  expect(within(row('Hiking')).getByText('Jan')).toBeInTheDocument()
})
