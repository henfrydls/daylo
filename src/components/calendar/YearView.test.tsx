import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { YearView } from './YearView'
import { useCalendarStore } from '../../store'
import type { Activity, ActivityLog } from '../../types'

// Get initial state for reset
const initialStoreState = useCalendarStore.getState()

// Mock the current date
const MOCK_DATE = new Date(2024, 5, 15) // June 15, 2024

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

    it('should navigate to current year when clicking Today button', () => {
      useCalendarStore.setState({ selectedYear: 2020 })
      render(<YearView />)

      const todayButton = screen.getByRole('button', { name: 'Go to current year' })
      fireEvent.click(todayButton)

      expect(useCalendarStore.getState().selectedYear).toBe(2024)
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
    it('should have accessible navigation buttons', () => {
      render(<YearView />)

      expect(screen.getByLabelText('Previous year')).toBeInTheDocument()
      expect(screen.getByLabelText('Next year')).toBeInTheDocument()
      expect(screen.getByLabelText('Go to current year')).toBeInTheDocument()
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
      render(<YearView />)

      const prevButton = screen.getByLabelText('Previous year')
      const nextButton = screen.getByLabelText('Next year')
      const todayButton = screen.getByRole('button', { name: 'Go to current year' })

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
      render(<YearView />)

      expect(screen.getByLabelText('Previous year')).toBeInTheDocument()
      expect(screen.getByLabelText('Next year')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to current year' })).toBeInTheDocument()
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
})
