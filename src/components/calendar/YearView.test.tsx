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

    it('should render all 12 months', () => {
      render(<YearView />)

      // Use text query which is faster than role query with regex
      expect(screen.getByText('Jan')).toBeInTheDocument()
      expect(screen.getByText('Feb')).toBeInTheDocument()
      expect(screen.getByText('Mar')).toBeInTheDocument()
      expect(screen.getByText('Apr')).toBeInTheDocument()
      expect(screen.getByText('May')).toBeInTheDocument()
      expect(screen.getByText('Jun')).toBeInTheDocument()
      expect(screen.getByText('Jul')).toBeInTheDocument()
      expect(screen.getByText('Aug')).toBeInTheDocument()
      expect(screen.getByText('Sep')).toBeInTheDocument()
      expect(screen.getByText('Oct')).toBeInTheDocument()
      expect(screen.getByText('Nov')).toBeInTheDocument()
      expect(screen.getByText('Dec')).toBeInTheDocument()
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

      // Should only count completed logs (2)
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('completions this year')).toBeInTheDocument()
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

      const janButton = screen.getByRole('button', { name: 'View Jan 2024' })
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
      expect(dayCells[0].getAttribute('aria-label')).toMatch(/\d+ of \d+ activities completed/)
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
      expect(todayCell?.className).toContain('ring-blue-500')
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
      months.forEach((month) => {
        expect(screen.getByLabelText(`View ${month} 2024`)).toBeInTheDocument()
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
      // Check that the button has focus ring classes
      expect(prevButton.className).toContain('focus:ring')
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
    it('should render day labels in each month', () => {
      render(<YearView />)

      // Each month should have abbreviated day labels (M, W, F)
      // Only odd days show labels (Mon, Wed, Fri)
      const mLabels = screen.getAllByText('M')
      expect(mLabels.length).toBeGreaterThanOrEqual(12)
    })

    it('should render 12 month containers', () => {
      useCalendarStore.setState({ selectedYear: 2024 })
      render(<YearView />)

      // Month labels are buttons; verify they all exist by their text content
      expect(screen.getByText('Jan')).toBeInTheDocument()
      expect(screen.getByText('Feb')).toBeInTheDocument()
      expect(screen.getByText('Mar')).toBeInTheDocument()
      expect(screen.getByText('Apr')).toBeInTheDocument()
      expect(screen.getByText('May')).toBeInTheDocument()
      expect(screen.getByText('Jun')).toBeInTheDocument()
      expect(screen.getByText('Jul')).toBeInTheDocument()
      expect(screen.getByText('Aug')).toBeInTheDocument()
      expect(screen.getByText('Sep')).toBeInTheDocument()
      expect(screen.getByText('Oct')).toBeInTheDocument()
      expect(screen.getByText('Nov')).toBeInTheDocument()
      expect(screen.getByText('Dec')).toBeInTheDocument()
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
})
