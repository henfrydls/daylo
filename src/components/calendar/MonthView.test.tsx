import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthView } from './MonthView'
import { useCalendarStore } from '../../store'

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
})
