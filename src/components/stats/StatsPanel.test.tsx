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

describe('what the panel no longer says', () => {
  // The run moved to the header in 1.6, where it is on every screen and at every width
  // instead of in the corner of a panel the month view does not show on a phone. Two
  // places with the same number is how they start disagreeing.
  //
  // The five tests that were here did not go with it. Three of them were about the rule
  // itself and live in streaks.test.ts: the run ending today, a today that has not
  // happened yet, and the end once yesterday is missing too, plus the one about crossing
  // the new year. The fourth, that the number is the same whatever year is on screen, is
  // now in App.test.tsx, because that is where the number is.
  it('does not say the current streak any more', () => {
    show(['2026-03-02', '2026-03-03', '2026-03-04'])

    expect(screen.queryByText('Current Streak')).not.toBeInTheDocument()
  })

  // Three cards in a two column grid leaves a hole. The two that follow the year on screen
  // sit together and the one about the person takes the width, which is the difference the
  // comment in the panel was already making in words.
  it('gives the longest streak the width the other one left', () => {
    show(['2026-03-04'])

    const card = screen.getByText('Longest Streak').parentElement
    expect(card?.className).toContain('col-span-2')
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
    expect(under('This Month')).toBe('completion')
    expect(under('Longest Streak')).toBe('all time')
  })
})
