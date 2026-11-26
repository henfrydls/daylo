import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { YearView } from './YearView'
import { useCalendarStore } from '../../store'
import { TravelContext } from '../../lib/travel'
import type { Activity, ActivityLog } from '../../types'

// Get initial state for reset
const initialStoreState = useCalendarStore.getState()

// Mock the current date
const MOCK_DATE = new Date(2024, 5, 15) // June 15, 2024

// Year's Today button waits for the first activity (see 'the first day'), so the tests of
// that button start with one.
const AN_ACTIVITY: Activity = {
  id: 'a1',
  name: 'Exercise',
  color: '#10B981',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

describe('YearView', () => {
  beforeEach(() => {
    // Reset store to initial state and clear mocks
    useCalendarStore.setState({
      ...initialStoreState,
      selectedYear: 2024,
      activities: [],
      logs: [],
    })
    vi.clearAllMocks()

    // Mock Date using Vitest's fake timers
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_DATE)

    // Mock matchMedia to simulate desktop viewport (>= 640px) so existing tests see the desktop layout
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, // >= 640px → desktop
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Rendering', () => {
    it('should render the selected year in the header', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2024')
    })

    it('should name all 12 months under the calendar', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const row = screen.getByTestId('month-completion')
      expect(within(row).getAllByRole('button')).toHaveLength(12)
      expect(within(row).getByText('Jan')).toBeInTheDocument()
      expect(within(row).getByText('Dec')).toBeInTheDocument()
    })

    it('should display Activity Calendar label', () => {
      render(<YearView />)

      expect(screen.getByText('Activity Calendar')).toBeInTheDocument()
    })

    it('should show activities tracked count', () => {
      const activities: Activity[] = [
        {
          id: '1',
          name: 'Exercise',
          color: '#22c55e',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: '2',
          name: 'Reading',
          color: '#3b82f6',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      useCalendarStore.setState({ activities })
      render(<YearView />)

      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('activities tracked')).toBeInTheDocument()
    })

    it('should show completions count this year', () => {
      const logs: ActivityLog[] = [
        { id: '1', activityId: '1', date: '2024-01-01', completed: true, createdAt: '2024-01-01' },
        { id: '2', activityId: '1', date: '2024-01-02', completed: true, createdAt: '2024-01-02' },
        { id: '3', activityId: '1', date: '2024-01-03', completed: false, createdAt: '2024-01-03' },
      ]
      useCalendarStore.setState({ logs })
      render(<YearView />)

      // Only completed logs count, and the figure is read next to its own words: the
      // month completion row is full of numbers that are not this one.
      const summary = screen.getByText('completions this year')
      expect(summary.parentElement).toHaveTextContent('2 completions this year')
    })
  })

  describe('the first day', () => {
    const phone = () =>
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

    // The same door as Month: somebody who opened Year first is on their first day too.
    it.each([
      ['desktop', () => {}],
      ['phone', phone],
    ])('shows the door and the backup with no activities, on %s', (_, size) => {
      size()
      render(<YearView onImport={vi.fn()} />)

      expect(screen.getByTestId('first-day-door')).toHaveTextContent('Add your first activity')
      expect(screen.getByTestId('month-empty-import').textContent).toBe(
        'Used Daylo before? Import your backup'
      )
    })

    // The door says Today and goes to today, so the row's Today would be the same thing a
    // second time. It waits for the first activity, and comes with it.
    it.each([
      ['desktop', () => {}],
      ['phone', phone],
    ])('hides Today with no activities, on %s, and the rest of the row stays', (_, size) => {
      size()
      render(<YearView onImport={vi.fn()} />)

      expect(screen.queryByRole('button', { name: 'Go to today' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Previous year')).toBeVisible()
      expect(screen.getByLabelText('Next year')).toBeVisible()
    })

    // The door is in every year, but only this one holds today: from another year the
    // row's Today is the way back to it without opening the sheet.
    it.each([
      ['desktop', () => {}],
      ['phone', phone],
    ])('keeps Today with no activities in another year, on %s', (_, size) => {
      size()
      useCalendarStore.setState({ selectedYear: 2023, currentView: 'year' })
      render(<YearView onImport={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Go to today' }))

      const state = useCalendarStore.getState()
      expect(state.selectedYear).toBe(2024)
      expect(state.selectedMonth).toBe(5)
      expect(state.selectedDate).toBeNull()
    })

    it.each([
      ['desktop', () => {}],
      ['phone', phone],
    ])('shows Today once there is an activity, on %s', (_, size) => {
      size()
      useCalendarStore.setState({ activities: [AN_ACTIVITY] })
      render(<YearView onImport={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Go to today' })).toBeVisible()
    })

    it('takes the door to today, in Month, and opens it', () => {
      useCalendarStore.setState({ selectedYear: 2023, currentView: 'year' })
      render(<YearView onImport={vi.fn()} />)

      fireEvent.click(screen.getByTestId('first-day-door'))

      const state = useCalendarStore.getState()
      expect(state.selectedDate).toBe('2024-06-15')
      expect(state.currentView).toBe('month')
      expect(state.selectedYear).toBe(2024)
      expect(state.selectedMonth).toBe(5)
    })

    // On the phone the door walks the rail to Month, and the sheet opening in the same tick
    // came up over a rail still sliding. It waits for Month to arrive.
    it('on the phone, opens today only once the journey to Month has arrived', () => {
      const toMonth = vi.fn()
      useCalendarStore.setState({ currentView: 'year', selectedDate: null })
      render(
        <TravelContext.Provider value={{ toYear: vi.fn(), toMonth }}>
          <YearView onImport={vi.fn()} />
        </TravelContext.Provider>
      )

      fireEvent.click(screen.getByTestId('first-day-door'))

      expect(toMonth).toHaveBeenCalledWith({ year: 2024, month: 5 })
      expect(useCalendarStore.getState().selectedDate).toBeNull()

      act(() => useCalendarStore.setState({ currentView: 'month' }))
      expect(useCalendarStore.getState().selectedDate).toBe('2024-06-15')

      // Once: coming back to Month later does not open it again.
      act(() => useCalendarStore.setState({ selectedDate: null, currentView: 'year' }))
      act(() => useCalendarStore.setState({ currentView: 'month' }))
      expect(useCalendarStore.getState().selectedDate).toBeNull()
    })

    // A journey that does not change the view in time (a resize, a frame that never came
    // in the background, a rail that was not there) must not leave a door that did
    // nothing: once the wait is over, today opens anyway.
    it('on the phone, opens today anyway when the journey does not arrive in time', () => {
      useCalendarStore.setState({ currentView: 'year', selectedDate: null })
      render(
        <TravelContext.Provider value={{ toYear: vi.fn(), toMonth: vi.fn() }}>
          <YearView onImport={vi.fn()} />
        </TravelContext.Provider>
      )

      fireEvent.click(screen.getByTestId('first-day-door'))
      act(() => {
        vi.advanceTimersByTime(1499)
      })
      expect(useCalendarStore.getState().selectedDate).toBeNull()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(useCalendarStore.getState().selectedDate).toBe('2024-06-15')

      // And nothing is left waiting for a later visit to Month.
      act(() => useCalendarStore.setState({ selectedDate: null }))
      act(() => useCalendarStore.setState({ currentView: 'month' }))
      expect(useCalendarStore.getState().selectedDate).toBeNull()
    })

    // Two taps while the rail is moving are one journey and one sheet. A second wait would
    // be left behind to open the sheet on a later visit to Month.
    it('on the phone, takes a second tap during the journey as the same one', () => {
      const toMonth = vi.fn()
      useCalendarStore.setState({ currentView: 'year', selectedDate: null })
      render(
        <TravelContext.Provider value={{ toYear: vi.fn(), toMonth }}>
          <YearView onImport={vi.fn()} />
        </TravelContext.Provider>
      )
      const opened: Array<string | null> = []
      const unsubscribe = useCalendarStore.subscribe((state, before) => {
        if (state.selectedDate !== before.selectedDate) opened.push(state.selectedDate)
      })

      fireEvent.click(screen.getByTestId('first-day-door'))
      fireEvent.click(screen.getByTestId('first-day-door'))
      expect(toMonth).toHaveBeenCalledTimes(1)

      act(() => useCalendarStore.setState({ currentView: 'month' }))
      act(() => useCalendarStore.setState({ selectedDate: null, currentView: 'year' }))
      act(() => useCalendarStore.setState({ currentView: 'month' }))
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      unsubscribe()

      expect(opened).toEqual(['2024-06-15', null])
    })

    it('on the phone, opens nothing once the door has left the page mid-journey', () => {
      useCalendarStore.setState({ currentView: 'year', selectedDate: null })
      const { unmount } = render(
        <TravelContext.Provider value={{ toYear: vi.fn(), toMonth: vi.fn() }}>
          <YearView onImport={vi.fn()} />
        </TravelContext.Provider>
      )

      fireEvent.click(screen.getByTestId('first-day-door'))
      unmount()
      act(() => useCalendarStore.setState({ currentView: 'month' }))
      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(useCalendarStore.getState().selectedDate).toBeNull()
    })

    // On the phone Year stays mounted beside Month, so the wait cannot count on leaving the
    // page to be called off. An import during the journey takes the door away: neither the
    // arrival nor the deadline may then open a sheet the door no longer promises.
    it.each([
      ['the deadline', () => vi.advanceTimersByTime(2000)],
      ['the arrival', () => useCalendarStore.setState({ currentView: 'month' })],
    ])('on the phone, opens nothing at %s once activities arrived mid-journey', (_, then) => {
      useCalendarStore.setState({ currentView: 'year', selectedDate: null })
      render(
        <TravelContext.Provider value={{ toYear: vi.fn(), toMonth: vi.fn() }}>
          <YearView onImport={vi.fn()} />
        </TravelContext.Provider>
      )

      fireEvent.click(screen.getByTestId('first-day-door'))
      act(() =>
        useCalendarStore.setState({
          activities: [
            {
              id: 'b1',
              name: 'Swim',
              color: '#3B82F6',
              createdAt: '2024-06-01T00:00:00.000Z',
              updatedAt: '2024-06-01T00:00:00.000Z',
            },
          ],
        })
      )
      act(() => {
        then()
      })

      expect(useCalendarStore.getState().selectedDate).toBeNull()
    })

    it('opens Import from the line', () => {
      const onImport = vi.fn()
      render(<YearView onImport={onImport} />)

      fireEvent.click(screen.getByRole('button', { name: 'Import your backup' }))
      expect(onImport).toHaveBeenCalledTimes(1)
    })

    it('has no door once there is an activity', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: '1',
            name: 'Exercise',
            color: '#22c55e',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      })
      render(<YearView onImport={vi.fn()} />)

      expect(screen.queryByTestId('first-day-door')).not.toBeInTheDocument()
      expect(screen.queryByTestId('month-empty-import')).not.toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should navigate to previous year when clicking previous button', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const prevButton = screen.getByLabelText('Previous year')
      fireEvent.click(prevButton)

      expect(useCalendarStore.getState().selectedYear).toBe(2023)
    })

    it('should navigate to next year when clicking next button', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const nextButton = screen.getByLabelText('Next year')
      fireEvent.click(nextButton)

      expect(useCalendarStore.getState().selectedYear).toBe(2025)
    })

    // Today goes to today, in Month, from another year...
    it('goes to the month of today in Month view from another year', () => {
      useCalendarStore.setState({
        activities: [AN_ACTIVITY],
        selectedYear: 2020,
        selectedMonth: 0,
        currentView: 'year',
      })
      render(<YearView />)

      fireEvent.click(screen.getByRole('button', { name: 'Go to today' }))

      const state = useCalendarStore.getState()
      expect(state.currentView).toBe('month')
      expect(state.selectedYear).toBe(2024)
      expect(state.selectedMonth).toBe(5)
    })

    // ...and from this year, where it used to do nothing.
    it('goes to the month of today in Month view from this year too', () => {
      useCalendarStore.setState({
        activities: [AN_ACTIVITY],
        selectedYear: 2024,
        selectedMonth: 0,
        currentView: 'year',
      })
      render(<YearView />)

      fireEvent.click(screen.getByRole('button', { name: 'Go to today' }))

      const state = useCalendarStore.getState()
      expect(state.currentView).toBe('month')
      expect(state.selectedYear).toBe(2024)
      expect(state.selectedMonth).toBe(5)
      // The day sheet stays closed: it goes to the month, it does not log.
      expect(state.selectedDate).toBeNull()
    })

    // Never hidden, whichever year is shown, once there is an activity.
    it.each([2020, 2024])('shows Today on %i', (year) => {
      useCalendarStore.setState({ activities: [AN_ACTIVITY], selectedYear: year })
      render(<YearView />)

      expect(screen.getByRole('button', { name: 'Go to today' })).toBeVisible()
    })

    it('should navigate to month view when clicking month label', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const janButton = screen.getByRole('button', { name: /^View Jan 2024/ })
      fireEvent.click(janButton)

      const state = useCalendarStore.getState()
      expect(state.currentView).toBe('month')
      expect(state.selectedMonth).toBe(0)
      expect(state.selectedYear).toBe(2024)
    })
  })

  describe('Day selection', () => {
    it('should set selected date when clicking a day cell', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      // Find and click a day cell
      const dayCells = screen.getAllByTestId('day-cell')
      expect(dayCells.length).toBeGreaterThan(0)

      fireEvent.click(dayCells[0])

      const state = useCalendarStore.getState()
      expect(state.selectedDate).not.toBeNull()
    })

    it('should have proper aria-label on day cells', () => {
      const activities: Activity[] = [
        {
          id: '1',
          name: 'Exercise',
          color: '#22c55e',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      useCalendarStore.setState({ activities, selectedYear: 2024 })
      render(<YearView />)

      const dayCells = screen.getAllByTestId('day-cell')
      // Day cells should have aria-labels describing date and completion status
      expect(dayCells[0]).toHaveAttribute('aria-label')
      expect(dayCells[0].getAttribute('aria-label')).toMatch(/\d+ of \d+ completed/)
    })
  })

  describe('Heatmap Legend', () => {
    it('should render the heatmap legend', () => {
      render(<YearView />)

      const legend = screen.getByRole('group', { name: 'Activity level legend' })
      expect(legend).toBeInTheDocument()
    })

    it('should display Less and More labels', () => {
      render(<YearView />)

      expect(screen.getByText('Less')).toBeInTheDocument()
      expect(screen.getByText('More')).toBeInTheDocument()
    })

    it('should render all 5 legend color boxes', () => {
      render(<YearView />)

      const legend = screen.getByRole('group', { name: 'Activity level legend' })
      const legendItems = within(legend).getAllByRole('listitem')

      expect(legendItems).toHaveLength(5)
    })

    it('should have proper aria-labels on legend items', () => {
      render(<YearView />)

      expect(screen.getByRole('listitem', { name: 'No activity: 0%' })).toBeInTheDocument()
      expect(screen.getByRole('listitem', { name: 'Low activity: 1-25%' })).toBeInTheDocument()
      expect(screen.getByRole('listitem', { name: 'Medium activity: 26-50%' })).toBeInTheDocument()
      expect(screen.getByRole('listitem', { name: 'High activity: 51-75%' })).toBeInTheDocument()
      expect(
        screen.getByRole('listitem', { name: 'Very high activity: 76-100%' })
      ).toBeInTheDocument()
    })
  })

  describe('Current day styling', () => {
    it('should highlight the current day', () => {
      // System time is set to June 15, 2024
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      // Find day cells for day 15 (current day)
      const dayCells = screen.getAllByTestId('day-cell')
      const todayCell = dayCells.find((cell) => {
        const ariaLabel = cell.getAttribute('aria-label') || ''
        return ariaLabel.includes('Jun 15, 2024')
      })

      expect(todayCell).toBeDefined()
      // Today's cell should have special ring styling (blue ring)
      expect(todayCell?.className).toContain('blue-500')
    })
  })

  describe('Accessibility', () => {
    // The heading takes the focus by script (after an import from the first day's door).
    // From the keyboard it has to show where the focus went, like Month's title does.
    it('shows the focus ring on the year heading, like the month title', () => {
      render(<YearView />)

      const title = screen.getByTestId('year-title')
      for (const name of [
        'focus:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-emerald-500',
        'focus-visible:ring-offset-1',
        'rounded-lg',
      ]) {
        expect(title).toHaveClass(name)
      }
    })

    it('should have accessible navigation buttons', () => {
      useCalendarStore.setState({ activities: [AN_ACTIVITY] })
      render(<YearView />)

      expect(screen.getByLabelText('Previous year')).toBeInTheDocument()
      expect(screen.getByLabelText('Next year')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument()
    })

    it('should have accessible month buttons', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ]
      // The label says what the button does and where it stands: "View Jun 2024, 41%
      // complete", or "not started yet" for a month still ahead.
      //
      // Scoped to the row on purpose. An unscoped getByRole computes the accessible name
      // of every button on the page, and the page now holds a button per day of the year:
      // twelve of those queries took seven seconds and timed the test out.
      const row = within(screen.getByTestId('month-completion'))
      months.forEach((month) => {
        expect(
          row.getByRole('button', { name: new RegExp(`^View ${month} 2024, `) })
        ).toBeInTheDocument()
      })
    })

    it('should have focusable navigation elements', () => {
      useCalendarStore.setState({ activities: [AN_ACTIVITY] })
      render(<YearView />)

      const prevButton = screen.getByLabelText('Previous year')
      const nextButton = screen.getByLabelText('Next year')
      const todayButton = screen.getByRole('button', { name: 'Go to today' })

      // Navigation buttons should be focusable
      expect(prevButton).not.toHaveAttribute('tabindex', '-1')
      expect(nextButton).not.toHaveAttribute('tabindex', '-1')
      expect(todayButton).not.toHaveAttribute('tabindex', '-1')
    })

    it('should have proper focus styles on buttons', () => {
      render(<YearView />)

      const prevButton = screen.getByLabelText('Previous year')
      // focus-visible, not focus: a ring that a tap leaves behind sticks on a phone, and
      // the toggle ended up showing one on the button for the view you had just left.
      expect(prevButton.className).toContain('focus-visible:ring')
      expect(prevButton.className).not.toContain(' focus:ring')
    })

    it('should have SVG icons hidden from screen readers', () => {
      render(<YearView />)

      const prevButton = screen.getByLabelText('Previous year')
      const svg = prevButton.querySelector('svg')

      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('With activities and logs', () => {
    it('should display heatmap colors based on activity completion', () => {
      const activities: Activity[] = [
        {
          id: '1',
          name: 'Exercise',
          color: '#22c55e',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: '2',
          name: 'Reading',
          color: '#3b82f6',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      const logs: ActivityLog[] = [
        { id: '1', activityId: '1', date: '2024-01-01', completed: true, createdAt: '2024-01-01' },
        { id: '2', activityId: '2', date: '2024-01-01', completed: true, createdAt: '2024-01-01' },
      ]
      useCalendarStore.setState({ activities, logs, selectedYear: 2024 })
      render(<YearView />)

      const dayCells = screen.getAllByTestId('day-cell')
      // The first day with 2/2 completions should have emerald color
      const jan1Cell = dayCells.find((cell) => {
        const ariaLabel = cell.getAttribute('aria-label') || ''
        return ariaLabel.includes('Jan 1, 2024') && ariaLabel.includes('2 of 2')
      })

      expect(jan1Cell).toBeDefined()
      expect(jan1Cell?.className).toContain('bg-emerald')
    })

    it('should show gray color for days with no activity', () => {
      const activities: Activity[] = [
        {
          id: '1',
          name: 'Exercise',
          color: '#22c55e',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      useCalendarStore.setState({ activities, logs: [], selectedYear: 2024 })
      render(<YearView />)

      const dayCells = screen.getAllByTestId('day-cell')
      // Days without completion should have gray background
      const noneCompletedCell = dayCells.find((cell) => {
        const ariaLabel = cell.getAttribute('aria-label') || ''
        return ariaLabel.includes('0 of 1')
      })

      expect(noneCompletedCell).toBeDefined()
      expect(noneCompletedCell?.className).toContain('bg-gray')
    })
  })

  describe('Year change', () => {
    it('should re-render calendar when year changes', () => {
      const { rerender } = render(<YearView />)

      // Initial year
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2024')

      // Change year wrapped in act to avoid warning
      act(() => {
        useCalendarStore.setState({ selectedYear: 2025 })
      })
      rerender(<YearView />)

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2025')
    })

    it('should handle leap years correctly', () => {
      useCalendarStore.setState({ selectedYear: 2024 }) // Leap year
      render(<YearView />)

      // February 29 should exist in 2024
      const dayCells = screen.getAllByTestId('day-cell')
      const feb29Cell = dayCells.find((cell) => {
        const ariaLabel = cell.getAttribute('aria-label') || ''
        return ariaLabel.includes('Feb 29, 2024')
      })

      expect(feb29Cell).toBeDefined()
    })

    it('should handle non-leap years correctly', () => {
      useCalendarStore.setState({ selectedYear: 2023 }) // Non-leap year
      render(<YearView />)

      // February 29 should NOT exist in 2023
      const dayCells = screen.getAllByTestId('day-cell')
      const feb29Cell = dayCells.find((cell) => {
        const ariaLabel = cell.getAttribute('aria-label') || ''
        return ariaLabel.includes('Feb 29, 2023')
      })

      expect(feb29Cell).toBeUndefined()
    })
  })

  describe('Month grid structure', () => {
    it('labels the weekdays once for the whole year', () => {
      render(<YearView />)

      // One continuous grid means one column of weekday letters, where the old layout
      // repeated them twelve times over.
      expect(screen.getAllByText('M')).toHaveLength(1)
      expect(screen.getAllByText('W')).toHaveLength(1)
      expect(screen.getAllByText('F')).toHaveLength(1)
    })

    it('gives every month of the year a completion figure', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const row = screen.getByTestId('month-completion')
      for (const month of ['Jan', 'Jun', 'Dec']) {
        expect(within(row).getByText(month)).toBeInTheDocument()
      }
    })
  })

  describe('Keyboard navigation', () => {
    it('should allow keyboard interaction with navigation buttons', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const prevButton = screen.getByLabelText('Previous year')
      prevButton.focus()

      // Buttons respond to click, which can be triggered by Enter key
      fireEvent.click(prevButton)

      expect(useCalendarStore.getState().selectedYear).toBe(2023)
    })

    it('should allow keyboard interaction with day cells', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const dayCells = screen.getAllByTestId('day-cell')
      const firstCell = dayCells[0]

      act(() => {
        firstCell.focus()
        fireEvent.click(firstCell)
      })

      expect(useCalendarStore.getState().selectedDate).not.toBeNull()
    })
  })

  describe('Mobile layout', () => {
    beforeEach(() => {
      // Override matchMedia to simulate mobile viewport (< 640px)
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false, // < 640px → mobile
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })
    })

    it('should render 12 MonthCards on mobile', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const monthCards = screen.getAllByTestId('month-card')
      expect(monthCards).toHaveLength(12)
    })

    it('should render the month cards grid', () => {
      render(<YearView />)

      expect(screen.getByTestId('month-cards-grid')).toBeInTheDocument()
    })

    // The heading takes the focus by script (after an import from the first day's door).
    // From the keyboard it has to show where the focus went, like Month's title does.
    it('shows the focus ring on the year heading on the phone too', () => {
      render(<YearView />)

      const title = screen.getByTestId('year-title')
      for (const name of [
        'focus:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-emerald-500',
        'focus-visible:ring-offset-1',
        'rounded-lg',
      ]) {
        expect(title).toHaveClass(name)
      }
    })

    it('should render YearProgressBar when activities exist', () => {
      const activities: Activity[] = [
        {
          id: '1',
          name: 'Exercise',
          color: '#22c55e',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      useCalendarStore.setState({ activities, selectedYear: 2024 })
      render(<YearView />)

      expect(screen.getByTestId('year-progress-bar')).toBeInTheDocument()
    })

    // The run that is still going is said in the header, on every screen. Under the year,
    // on a phone, it was the same number a second time, worked out apart from the first.
    it('leaves the run to the header', () => {
      const activities: Activity[] = [
        {
          id: '1',
          name: 'Exercise',
          color: '#22c55e',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]
      // Three days ending today, 15 June 2024: a run that is alive.
      const logs: ActivityLog[] = ['2024-06-13', '2024-06-14', '2024-06-15'].map((date) => ({
        id: date,
        activityId: '1',
        date,
        completed: true,
        createdAt: date,
      }))
      useCalendarStore.setState({ activities, logs, selectedYear: 2024 })
      render(<YearView />)

      const bar = screen.getByTestId('year-progress-bar')
      expect(bar).toHaveTextContent('3 of 167 days so far')
      expect(bar).not.toHaveTextContent(/streak/i)
    })

    it('should render HeatmapLegend on mobile', () => {
      render(<YearView />)

      expect(screen.getByRole('group', { name: 'Activity level legend' })).toBeInTheDocument()
    })

    it('should navigate to MonthView when tapping a MonthCard', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      const monthCards = screen.getAllByTestId('month-card')
      fireEvent.click(monthCards[2]) // March

      const state = useCalendarStore.getState()
      expect(state.currentView).toBe('month')
      expect(state.selectedMonth).toBe(2)
    })

    it('should show year navigation on mobile', () => {
      useCalendarStore.setState({ activities: [AN_ACTIVITY] })
      render(<YearView />)

      expect(screen.getByLabelText('Previous year')).toBeInTheDocument()
      expect(screen.getByLabelText('Next year')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument()
    })

    it('offers the same two ways of reading the year', () => {
      render(<YearView />)

      const toggle = within(screen.getByRole('group', { name: /how to show the year/i }))
      expect(toggle.getByRole('button', { name: 'All activities' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      expect(screen.getByTestId('month-cards-grid')).toBeInTheDocument()
    })

    // A phone cannot show 365 squares and mean anything by them, so By activity is a
    // block per week rather than the desktop's row per day.
    it('swaps the month cards for a strip per activity', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: 'a1',
            name: 'Hiking',
            color: '#8B5CF6',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
        selectedYear: 2024,
      })
      render(<YearView />)

      fireEvent.click(screen.getByRole('button', { name: 'By activity' }))

      expect(screen.getByTestId('strip-Hiking')).toBeInTheDocument()
      expect(screen.getAllByTestId('week-block')).toHaveLength(26)
      expect(screen.queryByTestId('month-cards-grid')).not.toBeInTheDocument()
    })

    // "The last 26 weeks" of a year already over means the ones it ended with. Anchoring
    // every strip on today would show 2023 the weeks before this morning, which are not
    // in 2023 at all.
    it('ends the strips on the year being looked at, not on today', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: 'a1',
            name: 'Hiking',
            color: '#8B5CF6',
            createdAt: '2023-01-01',
            updatedAt: '2023-01-01',
          },
        ],
        logs: [
          {
            id: 'l1',
            activityId: 'a1',
            date: '2023-12-27',
            completed: true,
            createdAt: '2023-12-27',
          },
        ],
        selectedYear: 2023,
      })
      render(<YearView />)

      fireEvent.click(screen.getByRole('button', { name: 'By activity' }))

      const strip = screen.getByTestId('strip-Hiking')
      const weeks = within(strip).getAllByTestId('week-block')
      // 31 December 2023 was itself a Sunday, so the year ends on a week of its own and
      // the log four days earlier belongs to the one before it.
      expect(weeks[25]).toHaveAttribute('aria-label', 'Week of Dec 31: 0 of 7 days')
      expect(weeks[24]).toHaveAttribute('aria-label', 'Week of Dec 24: 1 of 7 days')
    })

    // The desktop grid is 365 buttons. Rendering it behind a phone layout would cost that
    // for nothing, and it is not what this view shows.
    it('never draws the desktop grid, in either mode', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: 'a1',
            name: 'Hiking',
            color: '#8B5CF6',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      })
      render(<YearView />)

      fireEvent.click(screen.getByRole('button', { name: 'By activity' }))

      expect(screen.queryAllByTestId('day-cell')).toHaveLength(0)
    })

    it('should not render desktop day cells on mobile', () => {
      render(<YearView />)

      const dayCells = screen.queryAllByTestId('day-cell')
      expect(dayCells).toHaveLength(0)
    })
  })

  describe('the All activities / By activity toggle', () => {
    // Both halves are asserted. With only the pressed one checked, a control that
    // reported every option as pressed would pass, and a screen reader would be told the
    // year is shown two ways at once.
    it('says which of the two is showing, and moves it', () => {
      render(<YearView />)
      const toggle = within(screen.getByRole('group', { name: /how to show the year/i }))
      const all = () => toggle.getByRole('button', { name: 'All activities' })
      const byActivity = () => toggle.getByRole('button', { name: 'By activity' })

      expect(all()).toHaveAttribute('aria-pressed', 'true')
      expect(byActivity()).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(byActivity())

      expect(all()).toHaveAttribute('aria-pressed', 'false')
      expect(byActivity()).toHaveAttribute('aria-pressed', 'true')
    })

    it('switches to a row per activity', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: 'a1',
            name: 'Hiking',
            color: '#8B5CF6',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      })
      render(<YearView />)

      fireEvent.click(screen.getByRole('button', { name: 'By activity' }))

      expect(screen.getByTestId('activity-row-Hiking')).toBeInTheDocument()
      expect(useCalendarStore.getState().yearMode).toBe('byActivity')
    })

    // The legend reads the five shades of the combined heatmap. In the other view three
    // rows out of four are one colour or grey, so up in the header it would be labelling
    // something that is not on screen.
    it('moves the legend to the row it describes', () => {
      useCalendarStore.setState({
        activities: [
          {
            id: 'a1',
            name: 'Hiking',
            color: '#8B5CF6',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      })
      render(<YearView />)
      const header = screen.getByTestId('year-header')
      expect(
        within(header).getByRole('group', { name: /activity level legend/i })
      ).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'By activity' }))

      expect(
        within(screen.getByTestId('year-header')).queryByRole('group', {
          name: /activity level legend/i,
        })
      ).not.toBeInTheDocument()
      expect(
        within(screen.getByTestId('activity-row-All')).getByRole('group', {
          name: /activity level legend/i,
        })
      ).toBeInTheDocument()
    })

    // The figures under the grid describe the year as a whole, and each row carries its
    // own in the other view, so repeating them there would say the same thing twice.
    it('keeps the year figures for the combined view only', () => {
      render(<YearView />)
      expect(screen.getByTestId('month-completion')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'By activity' }))

      expect(screen.queryByTestId('month-completion')).not.toBeInTheDocument()
    })
  })

  // The month we are in is counted over its days up to today, the same rule as "This
  // Month" in the statistics (lib/monthCompletion). Four days marked by 20 November used
  // to read 13% here, four of thirty, and 20% there, four of twenty.
  describe('the month completion figure', () => {
    const ACTIVITY: Activity = {
      id: '1',
      name: 'Exercise',
      color: '#22c55e',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const marked = (...dates: string[]): ActivityLog[] =>
      dates.map((date) => ({ id: date, activityId: '1', date, completed: true, createdAt: date }))

    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 10, 20, 12))
      useCalendarStore.setState({
        activities: [ACTIVITY],
        logs: marked(
          '2026-10-01',
          '2026-10-31',
          '2026-11-02',
          '2026-11-05',
          '2026-11-11',
          '2026-11-20'
        ),
        selectedYear: 2026,
      })
    })

    it('counts the current month over its days so far, and a past one over all of them', () => {
      render(<YearView />)

      const row = within(screen.getByTestId('month-completion'))
      expect(row.getByRole('button', { name: 'View Nov 2026, 20% complete' })).toBeInTheDocument()
      expect(row.getByRole('button', { name: 'View Oct 2026, 6% complete' })).toBeInTheDocument()
      expect(
        row.getByRole('button', { name: 'View Dec 2026, not started yet' })
      ).toBeInTheDocument()
    })

    it('gives the phone the same figure on the month card', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false, // < 640px → mobile
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })
      render(<YearView />)

      const cards = screen.getAllByTestId('month-card')
      expect(cards[10]).toHaveAccessibleName(
        'November 2026: 4 of 20 days active, 20%. Tap to view month.'
      )
      expect(within(cards[10]).getByTestId('month-card-stats')).toHaveTextContent('4/20 · 20%')
      expect(cards[9]).toHaveAccessibleName(
        'October 2026: 2 of 31 days active, 6%. Tap to view month.'
      )
      // A month that has not begun says so, as the row does, and not "0 of 31".
      expect(cards[11]).toHaveAccessibleName('December 2026: not started yet. Tap to view month.')
      expect(within(cards[11]).getByTestId('month-card-stats')).toHaveTextContent(/^–$/)
    })

    // The month a person started in counts from their first day, as "This Month" does
    // (lib/monthCompletion). Somebody who began on 19 November with six of seven days done
    // read 6 of 25, 24%, on 25 November. The month before keeps its 31 days: only the
    // month of the first day changes.
    describe('in the month the person started', () => {
      beforeEach(() => {
        vi.setSystemTime(new Date(2026, 10, 25, 12))
        useCalendarStore.setState({
          firstOpenedAt: '2026-11-19',
          logs: marked(
            '2026-11-19',
            '2026-11-20',
            '2026-11-21',
            '2026-11-23',
            '2026-11-24',
            '2026-11-25'
          ),
        })
      })
      afterEach(() => {
        // In act: this runs before the shared cleanup, with the component still on screen.
        act(() => useCalendarStore.setState({ firstOpenedAt: null }))
      })

      it('counts it from the first day in the row of months', () => {
        render(<YearView />)

        const row = within(screen.getByTestId('month-completion'))
        expect(row.getByRole('button', { name: 'View Nov 2026, 86% complete' })).toBeInTheDocument()
        expect(row.getByRole('button', { name: 'View Oct 2026, 0% complete' })).toBeInTheDocument()
      })

      it('counts it from the first day on the phone month card', () => {
        window.matchMedia = ((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })) as unknown as typeof window.matchMedia
        render(<YearView />)

        const cards = screen.getAllByTestId('month-card')
        expect(cards[10]).toHaveAccessibleName(
          'November 2026: 6 of 7 days active, 86%. Tap to view month.'
        )
        expect(within(cards[10]).getByTestId('month-card-stats')).toHaveTextContent('6/7 · 86%')
      })
    })
  })
})
