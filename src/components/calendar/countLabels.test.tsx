import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthView } from './MonthView'
import { YearView } from './YearView'
import { YearByActivity } from './YearByActivity'
import { useCalendarStore } from '../../store'
import type { Activity, ActivityLog, HeatmapLevel } from '../../types'

/**
 * The counts said "1 active days" and "1/1 activities". One activity and one day is where
 * everybody starts, so the first screen a person saw got its English wrong.
 *
 * Each label is read with one and with two. A singular has to be read as a whole word:
 * "1 active day" is also the start of "1 active days".
 */

const initialStoreState = useCalendarStore.getState()

const activity = (id: string, name: string): Activity => ({
  id,
  name,
  color: '#10B981',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const done = (activityId: string, date: string): ActivityLog => ({
  id: `${activityId}-${date}`,
  activityId,
  date,
  completed: true,
  createdAt: date,
})

const TODAY = new Date(2026, 10, 13, 12)
const TODAY_STR = '2026-11-13'

function screenWidth(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(TODAY)
  useCalendarStore.setState({
    ...initialStoreState,
    activities: [],
    logs: [],
    selectedYear: 2026,
    selectedMonth: 10,
    selectedDate: null,
    currentView: 'month',
    _hasHydrated: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the Today bar on a phone', () => {
  beforeEach(() => screenWidth(false))

  it('says activity when there is one to do', () => {
    useCalendarStore.setState({ activities: [activity('a1', 'Read')] })
    render(<MonthView />)

    const bar = screen.getByTestId('log-today-bar')
    expect(bar).toHaveTextContent(/0\/1 activity$/)
    expect(bar).toHaveAttribute('aria-label', 'Log today: 0 of 1 activity completed')
  })

  // The word follows the total: "1/1 activity" is one activity, done.
  it('still says activity once the one is done', () => {
    useCalendarStore.setState({
      activities: [activity('a1', 'Read')],
      logs: [done('a1', TODAY_STR)],
    })
    render(<MonthView />)

    const bar = screen.getByTestId('log-today-bar')
    expect(bar).toHaveTextContent(/1\/1 activity$/)
    expect(bar).toHaveAttribute('aria-label', 'Log today: 1 of 1 activity completed')
  })

  it('says activities when there are more', () => {
    useCalendarStore.setState({
      activities: [activity('a1', 'Read'), activity('a2', 'Walk')],
      logs: [done('a1', TODAY_STR)],
    })
    render(<MonthView />)

    const bar = screen.getByTestId('log-today-bar')
    expect(bar).toHaveTextContent(/1\/2 activities$/)
    expect(bar).toHaveAttribute('aria-label', 'Log today: 1 of 2 activities completed')
  })
})

describe('a day in the month', () => {
  beforeEach(() => screenWidth(true))

  it('is read out as one activity completed, or as two', () => {
    useCalendarStore.setState({
      activities: [activity('a1', 'Read'), activity('a2', 'Walk')],
      logs: [done('a1', '2026-11-12'), done('a1', TODAY_STR), done('a2', TODAY_STR)],
    })
    render(<MonthView />)

    expect(
      screen.getByRole('button', { name: '2026-11-12, 1 activity completed' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '2026-11-13, 2 activities completed' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '2026-11-14, 0 activities completed' })
    ).toBeInTheDocument()
  })
})

describe('the summary under the year', () => {
  beforeEach(() => {
    screenWidth(true)
    useCalendarStore.setState({ currentView: 'year' })
  })

  const line = (words: RegExp) => screen.getByText(words)

  it('speaks of one active day, one completion and one activity', () => {
    useCalendarStore.setState({
      activities: [activity('a1', 'Read')],
      logs: [done('a1', TODAY_STR)],
    })
    render(<YearView />)

    expect(line(/active day/)).toHaveTextContent(/^1 active day$/)
    expect(line(/this year/)).toHaveTextContent(/^1 completion this year$/)
    expect(line(/tracked/)).toHaveTextContent(/^1 activity tracked$/)
  })

  it('speaks of two of each', () => {
    useCalendarStore.setState({
      activities: [activity('a1', 'Read'), activity('a2', 'Walk')],
      logs: [done('a1', '2026-11-12'), done('a2', TODAY_STR)],
    })
    render(<YearView />)

    expect(line(/active day/)).toHaveTextContent(/^2 active days$/)
    expect(line(/this year/)).toHaveTextContent(/^2 completions this year$/)
    expect(line(/tracked/)).toHaveTextContent(/^2 activities tracked$/)
  })
})

describe('the All row, one activity at a time', () => {
  const paint = (activeDays: number) =>
    render(
      <YearByActivity
        year={2026}
        activities={[activity('a1', 'Read')]}
        logs={[done('a1', TODAY_STR)]}
        dayData={new Map<string, { completedCount: number; level: HeatmapLevel }>()}
        activeDays={activeDays}
        selectedDate={null}
        onSelectDate={vi.fn()}
      />
    )

  it('says one active day', () => {
    paint(1)
    expect(screen.getByText(/active day/)).toHaveTextContent(/^1 active day$/)
  })

  it('says two active days', () => {
    paint(2)
    expect(screen.getByText(/active day/)).toHaveTextContent(/^2 active days$/)
  })
})
