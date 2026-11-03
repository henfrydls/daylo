import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthView } from './MonthView'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'

// Helper to create mock matchMedia
function createMockMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('MonthView', () => {
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()

  beforeEach(() => {
    // Reset store state
    useCalendarStore.setState({
      activities: [],
      logs: [],
      selectedYear: currentYear,
      selectedMonth: currentMonth,
      selectedDate: null,
      currentView: 'month',
      _hasHydrated: true,
    })

    // Default to desktop
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: createMockMatchMedia(true), // matches = true → desktop (min-width: 640px matches)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Header drill-up navigation', () => {
    it('should render month title as a button', () => {
      render(<MonthView />)

      const titleButton = screen.getByTestId('month-title-button')
      expect(titleButton).toBeInTheDocument()
      expect(titleButton.tagName).toBe('BUTTON')
    })

    it('should switch to year view when title is clicked', () => {
      render(<MonthView />)

      const titleButton = screen.getByTestId('month-title-button')
      fireEvent.click(titleButton)

      expect(useCalendarStore.getState().currentView).toBe('year')
    })

    it('should have accessible label for year view switch', () => {
      render(<MonthView />)

      const titleButton = screen.getByTestId('month-title-button')
      expect(titleButton).toHaveAttribute('aria-label', `Switch to year view for ${currentYear}`)
    })
  })

  describe('Empty state', () => {
    it('should show empty state when no activities exist', () => {
      useCalendarStore.setState({ activities: [] })

      render(<MonthView />)

      const emptyState = screen.getByTestId('month-empty-state')
      expect(emptyState).toBeInTheDocument()
      expect(emptyState).toHaveTextContent(
        'No activities yet. Tap any day to create your first activity and start tracking.'
      )
    })

    it('should not show empty state when activities exist', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: '1',
            name: 'Exercise',
            color: '#10B981',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      })

      render(<MonthView />)

      expect(screen.queryByTestId('month-empty-state')).not.toBeInTheDocument()
    })
  })

  describe('Log Today bar', () => {
    const activity = {
      id: '1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }

    it('should render Log Today bar on mobile when viewing current month', () => {
      // Set mobile viewport
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false), // matches = false → mobile
      })

      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    })

    it('should not render Log Today bar on desktop', () => {
      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
    })

    it('should not render Log Today bar when not viewing current month', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      // Set to a different month
      const differentMonth = currentMonth === 0 ? 1 : currentMonth - 1
      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: differentMonth,
      })

      render(<MonthView />)

      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
    })

    it('should not render Log Today bar when no activities exist', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      useCalendarStore.setState({
        activities: [],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      expect(screen.queryByTestId('log-today-bar')).not.toBeInTheDocument()
    })

    it('should open QuickLog (set selectedDate to today) when Log Today bar is clicked', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      useCalendarStore.setState({
        activities: [activity],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
        selectedDate: null,
      })

      render(<MonthView />)

      const logTodayBar = screen.getByTestId('log-today-bar')
      fireEvent.click(logTodayBar)

      // selectedDate should be set to today's date string
      const state = useCalendarStore.getState()
      expect(state.selectedDate).not.toBeNull()
      // Verify it's today's date (YYYY-MM-DD format)
      const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      expect(state.selectedDate).toBe(todayStr)
    })

    it('should show correct completed count', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: createMockMatchMedia(false),
      })

      const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      useCalendarStore.setState({
        activities: [
          activity,
          {
            id: '2',
            name: 'Reading',
            color: '#3B82F6',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
        logs: [
          {
            id: 'log-1',
            activityId: '1',
            date: todayStr,
            completed: true,
            createdAt: '2024-01-01',
          },
        ],
        selectedYear: currentYear,
        selectedMonth: currentMonth,
      })

      render(<MonthView />)

      const logTodayBar = screen.getByTestId('log-today-bar')
      expect(logTodayBar).toHaveTextContent('1/2 activities')
    })
  })

  describe('the week before the first', () => {
    const cells = () => screen.getAllByLabelText(/^\d{4}-\d{2}-\d{2},/)

    // A month whose 1st falls on a Sunday showed no day of the month before it at all:
    // `getDay()` is 0 for a Sunday, so the loop that prepends them never ran once. That is 13
    // months in every 96, one in seven, and it is the worst case rather than a corner: on the
    // 2nd of such a month the whole of somebody's run is in the month before, and the arrival
    // screen is an empty grid with a single dot in the corner.
    it('shows the last week of the month before when the 1st is a Sunday', () => {
      // 1 November 2026 is a Sunday.
      useCalendarStore.setState({ selectedYear: 2026, selectedMonth: 10 })
      render(<MonthView />)

      expect(screen.getByLabelText(/^2026-10-25,/)).toBeInTheDocument()
      expect(screen.getByLabelText(/^2026-10-31,/)).toBeInTheDocument()
      expect(cells()[0]).toHaveAccessibleName(/^2026-10-25,/)
    })

    // Six rows of seven, whatever the month does. A month that grew a seventh row would push
    // the grid past the bottom of a phone, which is the thing this is supposed to stop.
    it('still draws 42 cells on a month that starts on a Sunday', () => {
      useCalendarStore.setState({ selectedYear: 2026, selectedMonth: 10 })
      render(<MonthView />)

      expect(cells()).toHaveLength(42)
      expect(cells()[41]).toHaveAccessibleName(/^2026-12-05,/)
    })

    // The other six days of the week are untouched: 1 December 2026 is a Tuesday, so the grid
    // begins where it always began, on the 29th of November.
    it('leaves a month that starts on any other day alone', () => {
      useCalendarStore.setState({ selectedYear: 2026, selectedMonth: 11 })
      render(<MonthView />)

      expect(cells()).toHaveLength(42)
      expect(cells()[0]).toHaveAccessibleName(/^2026-11-29,/)
    })
  })

  describe('the ring on a day that has not happened yet', () => {
    const daysBack = (back: number): string => {
      const day = new Date()
      day.setDate(day.getDate() - back)
      return formatDate(day)
    }
    const oneHabit = [
      {
        id: 'a1',
        name: 'Exercise',
        color: '#10B981',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ]
    const loggedOn = (backs: number[]) =>
      backs.map((back) => ({
        id: `l${back}`,
        activityId: 'a1',
        date: daysBack(back),
        completed: true,
        createdAt: daysBack(back),
      }))

    const cellFor = (dateStr: string) =>
      screen.getByLabelText(new RegExp(`^${dateStr},`)).querySelector('span') as HTMLElement

    // The green circle on today was there whether or not anything had been done, so the one
    // strong green on the screen said something that was not true. Dashed is the day that
    // exists and has not happened yet; filled is the day that has.
    it('is dashed on today while today is empty', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: [] })
      render(<MonthView />)

      expect(cellFor(daysBack(0)).className).toContain('border-dashed')
    })

    it('is filled once anything at all is logged today', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([0]) })
      render(<MonthView />)

      const today = cellFor(daysBack(0))
      expect(today.className).not.toContain('border-dashed')
      expect(today.className).toContain('bg-emerald-700')
    })

    // White on emerald-500 is 2.47:1 and the floor is 4.5. It was published that way, and the
    // fix is not a shade: it is that a day with nothing in it is not filled at all.
    it('never puts white on the green that does not carry it', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([0]) })
      render(<MonthView />)

      expect(cellFor(daysBack(0)).className).not.toContain('bg-emerald-500')
    })

    // Yesterday, and the trap that would have made this invisible. Asked the ordinary way the
    // streak is 0 here, because yesterday is empty, so a guard reading it would never fire.
    // The run this speaks of is the one that ended the day before yesterday.
    it('is dashed on an empty yesterday when a run was going', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([2, 3, 4, 5]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).toContain('border-dashed')
    })

    it('leaves an empty yesterday alone when there was no run behind it', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([2]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).not.toContain('border-dashed')
    })

    // A two day hole is not a yesterday worth rescuing: logging it would join nothing to
    // anything. currentStreak has a day of grace, so asking about the day before yesterday
    // without checking that it exists walks one further back and answers about a run that
    // ended three days ago.
    it('leaves yesterday alone when the day before it is empty too', () => {
      useCalendarStore.setState({ activities: oneHabit, logs: loggedOn([3, 4, 5, 6]) })
      render(<MonthView />)

      expect(cellFor(daysBack(1)).className).not.toContain('border-dashed')
    })
  })
})
