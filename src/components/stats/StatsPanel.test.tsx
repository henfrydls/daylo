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
  //
  // The whole list rather than the absence of one label: a card for the run under any
  // other name would walk straight past a search for "Current Streak".
  it('has these three figures and no other', () => {
    show(['2026-03-02', '2026-03-03', '2026-03-04'])

    expect(screen.getAllByTestId('stat-label').map((label) => label.textContent)).toEqual([
      'Active Days',
      'This Month',
      'Longest Streak',
    ])
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
// Nothing held this figure's value until the way it is worked out changed, which is the
// wrong moment to find that out.
describe('this month', () => {
  it('is the days with something done over the days gone by', () => {
    // 2 and 4 March, read on the 4th: two of four.
    show(['2026-03-02', '2026-03-04'])

    expect(figure('This Month')).toBe('50%')
  })

  it('is over the whole of the month when the year on screen is over', () => {
    // March 2025 has all 31 of its days behind it.
    show(['2025-03-10'], 2025)

    expect(figure('This Month')).toBe('3%')
  })

  // The same as the year's row of months: nothing was missed yet, and 0% reads as a
  // failure. The dash is for the eye; a screen reader is told the month has not started.
  it('has no figure in a year that has not come', () => {
    show(['2026-03-04'], 2027)

    const value = screen.getByText('This Month').previousElementSibling!
    expect(value.querySelector('[aria-hidden="true"]')?.textContent).toBe('–')
    expect(value.querySelector('.sr-only')?.textContent).toBe('Not started yet')
    expect(value.textContent).not.toContain('%')
  })
})

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

// Each figure says what period it covers, because the three are not all about the same
// one: looking at a year with nothing in it, "Active Days 0 this year" sits beside a
// longest streak of 4 earned in another year, and without the subtitles the 4 reads as
// if it belonged to the year on screen.
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

// The year's row of months and the phone's month cards read the same rule
// (lib/monthCompletion), so this is the number they show for the month too.
describe('this month, on the day the views disagreed', () => {
  it('is four days of the twenty gone by', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    show(['2026-11-02', '2026-11-05', '2026-11-11', '2026-11-20'])

    expect(figure('This Month')).toBe('20%')
  })
})
