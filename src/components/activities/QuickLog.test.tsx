import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickLog } from './QuickLog'
import { useCalendarStore } from '../../store'

// Helper to reset store state before each test
const resetStore = () => {
  act(() => {
    useCalendarStore.setState({
      activities: [],
      logs: [],
      selectedYear: 2024,
      selectedDate: null,
      currentView: 'year',
      selectedMonth: 0,
    })
  })
}

// Helper to set up store with activities
const setupStoreWithActivities = () => {
  act(() => {
    useCalendarStore.setState({
      activities: [
        {
          id: 'activity-1',
          name: 'Exercise',
          color: '#10B981',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'activity-2',
          name: 'Reading',
          color: '#3B82F6',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'activity-3',
          name: 'Meditation',
          color: '#8B5CF6',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      logs: [],
      selectedYear: 2024,
      selectedDate: '2024-01-15',
      currentView: 'year',
      selectedMonth: 0,
    })
  })
}

// Helper to set up store with activities and logs
const setupStoreWithLogs = () => {
  act(() => {
    useCalendarStore.setState({
      activities: [
        {
          id: 'activity-1',
          name: 'Exercise',
          color: '#10B981',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'activity-2',
          name: 'Reading',
          color: '#3B82F6',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      logs: [
        {
          id: 'log-1',
          activityId: 'activity-1',
          date: '2024-01-15',
          completed: true,
          createdAt: '2024-01-15',
        },
      ],
      selectedYear: 2024,
      selectedDate: '2024-01-15',
      currentView: 'year',
      selectedMonth: 0,
    })
  })
}

describe('QuickLog', () => {
  beforeEach(() => {
    resetStore()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Rendering', () => {
    it('should not render when selectedDate is null', () => {
      resetStore()
      render(<QuickLog />)
      expect(screen.queryByTestId('quicklog-modal')).not.toBeInTheDocument()
    })

    it('should render when selectedDate is set', () => {
      setupStoreWithActivities()
      render(<QuickLog />)
      expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()
    })

    it('should display the formatted date in the header', () => {
      setupStoreWithActivities()
      render(<QuickLog />)
      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument()
    })

    it('should render the Done button', () => {
      setupStoreWithActivities()
      render(<QuickLog />)
      expect(screen.getByTestId('quicklog-done-button')).toBeInTheDocument()
    })
  })

  describe('Activity List', () => {
    it('should display list of activities when activities exist', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      expect(screen.getByText('Exercise')).toBeInTheDocument()
      expect(screen.getByText('Reading')).toBeInTheDocument()
      expect(screen.getByText('Meditation')).toBeInTheDocument()
    })

    it('should show checkboxes for each activity', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      const checkboxes = screen.getAllByTestId('quicklog-activity-checkbox')
      expect(checkboxes).toHaveLength(3)
    })

    it('should show completed activity as checked', () => {
      setupStoreWithLogs()
      render(<QuickLog />)

      const checkboxes = screen.getAllByTestId('quicklog-activity-checkbox')
      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).not.toBeChecked()
    })

    it('should display New activity button', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      expect(screen.getByTestId('quicklog-new-activity-button')).toBeInTheDocument()
      expect(screen.getByText('New activity')).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('should display empty state when no activities exist', () => {
      act(() => {
        useCalendarStore.setState({
          activities: [],
          logs: [],
          selectedDate: '2024-01-15',
        })
      })
      render(<QuickLog />)

      expect(screen.getByText('No activities to log yet.')).toBeInTheDocument()
      expect(screen.getByTestId('quicklog-create-first-activity')).toBeInTheDocument()
    })

    it('should show create form when clicking "Create your first activity" in empty state', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      act(() => {
        useCalendarStore.setState({
          activities: [],
          logs: [],
          selectedDate: '2024-01-15',
        })
      })
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-create-first-activity'))

      expect(screen.getByTestId('quicklog-new-activity-input')).toBeInTheDocument()
    })
  })

  describe('Toggle Activity', () => {
    it('should toggle activity completion when checkbox is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      const checkboxes = screen.getAllByTestId('quicklog-activity-checkbox')
      expect(checkboxes[0]).not.toBeChecked()

      await user.click(checkboxes[0])

      expect(checkboxes[0]).toBeChecked()
    })

    it('should toggle off a completed activity', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithLogs()
      render(<QuickLog />)

      const checkboxes = screen.getAllByTestId('quicklog-activity-checkbox')
      expect(checkboxes[0]).toBeChecked()

      await user.click(checkboxes[0])

      expect(checkboxes[0]).not.toBeChecked()
    })

    it('should update store when toggling activity', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      const checkboxes = screen.getAllByTestId('quicklog-activity-checkbox')
      await user.click(checkboxes[0])

      const state = useCalendarStore.getState()
      const log = state.logs.find((l) => l.activityId === 'activity-1' && l.date === '2024-01-15')
      expect(log).toBeDefined()
      expect(log?.completed).toBe(true)
    })
  })

  describe('Create New Activity', () => {
    it('should show create form when clicking New activity button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))

      expect(screen.getByTestId('quicklog-new-activity-input')).toBeInTheDocument()
      expect(screen.getByTestId('quicklog-cancel-create')).toBeInTheDocument()
      expect(screen.getByTestId('quicklog-add-activity')).toBeInTheDocument()
    })

    it('should have Add button disabled when name is empty', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))

      expect(screen.getByTestId('quicklog-add-activity')).toBeDisabled()
    })

    it('should enable Add button when name is entered', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'New Activity')

      expect(screen.getByTestId('quicklog-add-activity')).not.toBeDisabled()
    })

    it('should create activity and mark as complete when Add is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'New Activity')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      const state = useCalendarStore.getState()
      const newActivity = state.activities.find((a) => a.name === 'New Activity')
      expect(newActivity).toBeDefined()

      // Should also be logged as complete for the selected date
      const log = state.logs.find(
        (l) => l.activityId === newActivity?.id && l.date === '2024-01-15'
      )
      expect(log).toBeDefined()
      expect(log?.completed).toBe(true)
    })

    it('should create activity when pressing Enter', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Enter Activity')
      await user.keyboard('{Enter}')

      const state = useCalendarStore.getState()
      const newActivity = state.activities.find((a) => a.name === 'Enter Activity')
      expect(newActivity).toBeDefined()
    })

    it('should cancel creating when Cancel button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.getByTestId('quicklog-new-activity-input')).toBeInTheDocument()

      await user.click(screen.getByTestId('quicklog-cancel-create'))

      expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()
      expect(screen.getByTestId('quicklog-new-activity-button')).toBeInTheDocument()
    })

    it('should cancel creating when Escape is pressed in input', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      // Use a spy to prevent the modal from closing due to useFocusTrap's onEscape
      const setSelectedDateSpy = vi.fn()
      setupStoreWithActivities()

      // Override setSelectedDate to prevent modal close but still track calls
      useCalendarStore.setState({
        setSelectedDate: (date: string | null) => {
          setSelectedDateSpy(date)
          // Don't call original to prevent state change that causes hooks error
        },
      })

      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.getByTestId('quicklog-new-activity-input')).toBeInTheDocument()

      const input = screen.getByTestId('quicklog-new-activity-input')
      await user.type(input, 'Test')

      // Fire the escape key directly on the input to trigger the internal handleKeyDown
      fireEvent.keyDown(input, { key: 'Escape' })

      // The input form should be hidden (cancel creating)
      await waitFor(() => {
        expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()
      })
      // The new activity button should be visible again
      expect(screen.getByTestId('quicklog-new-activity-button')).toBeInTheDocument()
    })

    it('should not create activity with whitespace-only name', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      const initialCount = useCalendarStore.getState().activities.length
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), '   ')

      expect(screen.getByTestId('quicklog-add-activity')).toBeDisabled()

      const finalCount = useCalendarStore.getState().activities.length
      expect(finalCount).toBe(initialCount)
    })

    it('should trim whitespace from activity name', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), '  Trimmed Activity  ')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      const state = useCalendarStore.getState()
      const newActivity = state.activities.find((a) => a.name === 'Trimmed Activity')
      expect(newActivity).toBeDefined()
    })
  })

  describe('Close Modal', () => {
    it('should call setSelectedDate(null) when clicking the X button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const setSelectedDateSpy = vi.fn()
      setupStoreWithActivities()

      // Spy on the setSelectedDate function
      const originalSetSelectedDate = useCalendarStore.getState().setSelectedDate
      useCalendarStore.setState({
        setSelectedDate: (date: string | null) => {
          setSelectedDateSpy(date)
          originalSetSelectedDate(date)
        },
      })

      render(<QuickLog />)

      expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()

      await user.click(screen.getByLabelText('Close quick log'))

      expect(setSelectedDateSpy).toHaveBeenCalledWith(null)
    })

    it('should call setSelectedDate(null) when clicking the backdrop', async () => {
      const setSelectedDateSpy = vi.fn()
      setupStoreWithActivities()

      // Spy on the setSelectedDate function
      const originalSetSelectedDate = useCalendarStore.getState().setSelectedDate
      useCalendarStore.setState({
        setSelectedDate: (date: string | null) => {
          setSelectedDateSpy(date)
          originalSetSelectedDate(date)
        },
      })

      render(<QuickLog />)

      expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()

      const backdrop = document.querySelector('[aria-hidden="true"]')
      fireEvent.click(backdrop!)

      expect(setSelectedDateSpy).toHaveBeenCalledWith(null)
    })

    it('should call setSelectedDate(null) when pressing Escape key', async () => {
      const setSelectedDateSpy = vi.fn()
      setupStoreWithActivities()

      // Spy on the setSelectedDate function
      const originalSetSelectedDate = useCalendarStore.getState().setSelectedDate
      useCalendarStore.setState({
        setSelectedDate: (date: string | null) => {
          setSelectedDateSpy(date)
          originalSetSelectedDate(date)
        },
      })

      render(<QuickLog />)

      expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(setSelectedDateSpy).toHaveBeenCalledWith(null)
    })

    it('should call setSelectedDate(null) when clicking Done button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const setSelectedDateSpy = vi.fn()
      setupStoreWithActivities()

      // Spy on the setSelectedDate function
      const originalSetSelectedDate = useCalendarStore.getState().setSelectedDate
      useCalendarStore.setState({
        setSelectedDate: (date: string | null) => {
          setSelectedDateSpy(date)
          originalSetSelectedDate(date)
        },
      })

      render(<QuickLog />)

      expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()

      await user.click(screen.getByTestId('quicklog-done-button'))

      expect(setSelectedDateSpy).toHaveBeenCalledWith(null)
    })
  })

  describe('Accessibility', () => {
    it('should have role="dialog" on the modal container', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have aria-modal="true"', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('should have aria-labelledby pointing to the title', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-labelledby', 'quicklog-title')

      const title = document.getElementById('quicklog-title')
      expect(title).toBeInTheDocument()
      expect(title?.textContent).toBe('Jan 15, 2024')
    })

    it('should have aria-label on close button', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      expect(screen.getByLabelText('Close quick log')).toBeInTheDocument()
    })

    it('should have aria-label on activity checkboxes', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      expect(screen.getByLabelText('Mark Exercise as complete')).toBeInTheDocument()
      expect(screen.getByLabelText('Mark Reading as complete')).toBeInTheDocument()
    })

    it('should have aria-label on completed activity checkbox indicating toggle to incomplete', () => {
      setupStoreWithLogs()
      render(<QuickLog />)

      expect(screen.getByLabelText('Mark Exercise as incomplete')).toBeInTheDocument()
    })

    it('should have aria-hidden on backdrop', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      const backdrop = document.querySelector('[aria-hidden="true"]')
      expect(backdrop).toBeInTheDocument()
    })

    it('should have aria-hidden on activity color indicator', () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      const colorIndicators = document.querySelectorAll('[aria-hidden="true"]')
      // One backdrop + one color per activity
      expect(colorIndicators.length).toBeGreaterThanOrEqual(4)
    })

    it('should have accessible label on new activity input', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))

      expect(screen.getByLabelText('New activity name')).toBeInTheDocument()
    })
  })

  describe('Color Picker', () => {
    it('should display color picker when creating new activity', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))

      // ColorPicker should be present with color options (testIdPrefix is 'quicklog-color' + color name lowercase)
      expect(screen.getByTestId('quicklog-color-green')).toBeInTheDocument()
      expect(screen.getByTestId('quicklog-color-blue')).toBeInTheDocument()
    })

    it('should allow selecting a different color', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))

      // Click on blue color (ColorPicker uses testIdPrefix-colorName format)
      const blueColor = screen.getByTestId('quicklog-color-blue')
      await user.click(blueColor)

      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Blue Activity')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      const state = useCalendarStore.getState()
      const newActivity = state.activities.find((a) => a.name === 'Blue Activity')
      expect(newActivity?.color).toBe('#3B82F6')
    })
  })

  describe('Visual States', () => {
    it('should apply completed styling to completed activity', () => {
      setupStoreWithLogs()
      render(<QuickLog />)

      // Exercise is completed
      const exerciseLabel = screen.getByText('Exercise').closest('label')
      expect(exerciseLabel).toHaveClass('bg-emerald-50')
    })

    it('should show check icon for completed activity', () => {
      setupStoreWithLogs()
      render(<QuickLog />)

      // The completed activity should have a check icon
      // Exercise is completed, so it should have the CheckIcon
      const exerciseLabel = screen.getByText('Exercise').closest('label')
      const checkIcon = exerciseLabel?.querySelector('svg')
      expect(checkIcon).toBeInTheDocument()
    })
  })
})
