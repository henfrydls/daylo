import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsPanel } from './StatsPanel'
import { useCalendarStore } from '../../store'
import type { ActivityLog } from '../../types'

const ACTIVITY = {
  id: 'a1',
  name: 'Hiking',
  color: '#8B5CF6',
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
}

const logsOn = (dates: string[]): ActivityLog[] =>
  dates.map((date) => ({ id: date, activityId: 'a1', date, completed: true, createdAt: date }))

/** The number under a card's title, which is what somebody actually reads. */
function figure(label: string): string {
  const title = screen.getByText(label)
  const card = title.parentElement!
  return card.querySelector('div')!.textContent!.trim()
}

function show(dates: string[], year = 2026) {
  useCalendarStore.setState({ activities: [ACTIVITY], logs: logsOn(dates), selectedYear: year })
  render(<StatsPanel />)
}

beforeEach(() => {
  // Wednesday 4 March 2026.
  vi.setSystemTime(new Date(2026, 2, 4, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the current streak', () => {
  it('counts the run ending today', () => {
    show(['2026-03-02', '2026-03-03', '2026-03-04'])

    expect(figure('Current Streak')).toBe('3')
  })

  // The panel used to say 0 for the whole of a day until the person ticked it, while the
  // rows in the year view said 2 for the same data. One rule now, and it is this one.
  it('counts from yesterday while today is still untouched', () => {
    show(['2026-03-02', '2026-03-03'])

    expect(figure('Current Streak')).toBe('2')
  })

  it('is over once a whole day has gone by unticked', () => {
    show(['2026-03-01', '2026-03-02'])

    expect(figure('Current Streak')).toBe('0')
  })

  // It used to reset on 1 January because the panel only looked at the selected year, so
  // a run through the new year was cut in half by the calendar.
  it('carries on across the new year', () => {
    vi.setSystemTime(new Date(2026, 0, 2, 12))
    show(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'])

    expect(figure('Current Streak')).toBe('4')
  })

  // Current means now. Looking at an old year does not change what run you are on today.
  it('is the same number whatever year is on screen', () => {
    show(['2026-03-03', '2026-03-04'], 2024)

    expect(figure('Current Streak')).toBe('2')
  })
})

describe('the longest streak', () => {
  it('is the best there has ever been, not the best of this year', () => {
    show(['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2026-03-04'])

    expect(figure('Longest Streak')).toBe('4')
  })
})

describe('what stays tied to the year on screen', () => {
  it('counts active days in the selected year only', () => {
    show(['2025-06-01', '2026-03-03', '2026-03-04'])

    expect(figure('Active Days')).toBe('2')
  })

  it('counts them in the year being looked at, not in this one', () => {
    show(['2025-06-01', '2025-06-02', '2026-03-04'], 2025)

    expect(figure('Active Days')).toBe('2')
  })
})

// An import can carry dates in the future. They used to be counted as active days while
// the days elapsed, which is the denominator, stopped at today: a file with next year in
// it could say more days active than there have been.
describe('days that have not happened', () => {
  it('does not count a day still to come as active', () => {
    show(['2026-03-04', '2026-06-01', '2026-06-02'])

    expect(figure('Active Days')).toBe('1')
  })

  it('never says more active days than days gone by', () => {
    show(['2026-11-01', '2026-11-02', '2026-11-03'])

    expect(figure('Active Days')).toBe('0')
  })
})

describe('with nothing logged', () => {
  it('shows zeros rather than nothing', () => {
    show([])

    expect(figure('Current Streak')).toBe('0')
    expect(figure('Longest Streak')).toBe('0')
    expect(figure('Active Days')).toBe('0')
  })
})

// Each figure says what period it covers, because the four are not all about the same
// one: looking at a year with nothing in it, "Active Days 0 this year" sits beside a
// current streak that is alive today, and without the subtitles the 4 reads as if it
// belonged to the year on screen.
describe('what period each figure covers', () => {
  it('says it under the number', () => {
    show(['2026-03-04'])

    // The card is value, label, subtitle; the subtitle is the one after the label.
    const under = (label: string) => screen.getByText(label).nextElementSibling!.textContent!.trim()

    expect(under('Active Days')).toBe('this year')
    expect(under('Current Streak')).toBe('today')
    expect(under('Longest Streak')).toBe('all time')
  })
})
