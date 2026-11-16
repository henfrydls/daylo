import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QuickLog } from './QuickLog'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'

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

    // The bounce used to be on the row, so ticking one activity made its name, its colour
    // dot and its tick jump 20% along with it. It belongs to the control that was
    // clicked, and the row must not move.
    it('bounces the checkbox and not the row it sits in', async () => {
      setupStoreWithActivities()
      render(<QuickLog />)

      const checkbox = screen.getAllByTestId('quicklog-activity-checkbox')[0]
      await userEvent.click(checkbox)

      await waitFor(() => expect(checkbox.className).toContain('checkbox-bounce'))
      expect(checkbox.closest('label')?.className).not.toContain('checkbox-bounce')
      expect(checkbox.closest('label')?.getAttribute('style')).toBeNull()
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

    // Done closes a sheet whose work is done, and there is no work here: nothing can be
    // ticked yet. Two buttons where one of them does nothing make somebody read both to
    // find out which, and the cross already closes it.
    it('does not offer Done when there is nothing to be done', () => {
      act(() => {
        useCalendarStore.setState({
          activities: [],
          logs: [],
          selectedDate: '2024-01-15',
        })
      })
      render(<QuickLog />)

      expect(screen.queryByTestId('quicklog-done-button')).not.toBeInTheDocument()
      // The cross is still there, so there is still a way out.
      expect(screen.getByLabelText('Close quick log')).toBeInTheDocument()
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

  describe('the first day', () => {
    const todayStr = () => formatDate(new Date())
    const otherDay = () => {
      const day = new Date()
      day.setDate(day.getDate() - 5)
      return formatDate(day)
    }
    const LINE = 'Today is in. Log it again tomorrow.'
    const open = (date: string) => act(() => useCalendarStore.setState({ selectedDate: date }))
    const close = () => {
      act(() => useCalendarStore.setState({ selectedDate: null }))
      act(() => {
        vi.advanceTimersByTime(400)
      })
    }
    const habit = {
      id: 'activity-1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }
    const completedOn = (date: string) =>
      useCalendarStore
        .getState()
        .logs.filter((l) => l.date === date && l.completed)
        .map((l) => l.activityId)

    // The door opens today's sheet, and with nothing to log the only thing to do there is
    // to name the first activity: so the sheet opens on the form, with the cursor in it.
    it("opens today's sheet on the form, with the focus in the name", () => {
      render(<QuickLog />)
      open(todayStr())

      const input = screen.getByTestId('quicklog-new-activity-input')
      expect(input).toHaveFocus()
      expect(screen.queryByTestId('quicklog-create-first-activity')).not.toBeInTheDocument()
    })

    it('keeps the focus in the name once the sheet has settled', () => {
      render(<QuickLog />)
      open(todayStr())
      act(() => {
        vi.advanceTimersByTime(400)
      })

      expect(screen.getByTestId('quicklog-new-activity-input')).toHaveFocus()
    })

    // A sheet still on its way out when today opens is opened again rather than put
    // there, and the focus trap then sends the focus to the first thing it finds, the
    // cross, a moment later. The name has to win.
    it('keeps the focus in the name when the sheet opens again before it has left', () => {
      render(<QuickLog />)
      open(otherDay())
      act(() => {
        vi.advanceTimersByTime(400)
      })
      act(() => useCalendarStore.setState({ selectedDate: null }))
      act(() => {
        vi.advanceTimersByTime(50)
      })
      open(todayStr())
      act(() => {
        vi.advanceTimersByTime(400)
      })

      expect(screen.getByTestId('quicklog-new-activity-input')).toHaveFocus()
    })

    it('says it is today in the title', () => {
      render(<QuickLog />)
      open(todayStr())

      const now = new Date()
      const month = now.toLocaleString('en-US', { month: 'short' })
      expect(document.getElementById('quicklog-title')).toHaveTextContent(
        `Today · ${month} ${now.getDate()}`
      )
    })

    it('opens any other day on the empty state, as before', () => {
      render(<QuickLog />)
      open(otherDay())

      expect(screen.getByTestId('quicklog-create-first-activity')).toBeInTheDocument()
      expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()
      expect(document.getElementById('quicklog-title')).not.toHaveTextContent('Today')
    })

    it('opens today on the list once there is an activity', () => {
      act(() => useCalendarStore.setState({ activities: [habit] }))
      render(<QuickLog />)
      open(todayStr())

      expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()
      expect(screen.getByTestId('quicklog-activity-checkbox')).toBeInTheDocument()
    })

    // Cancel goes back to the empty state and stays there: it does not bounce back.
    it('lets Cancel go back to the empty state', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<QuickLog />)
      open(todayStr())

      await user.click(screen.getByTestId('quicklog-cancel-create'))

      expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()
      expect(screen.getByTestId('quicklog-create-first-activity')).toBeInTheDocument()
    })

    it('uses examples for the placeholder, in a grey that can be read', () => {
      render(<QuickLog />)
      open(todayStr())

      const input = screen.getByTestId('quicklog-new-activity-input')
      expect(input).toHaveAttribute('placeholder', 'e.g., Exercise, Read, Meditate')
      // The browser's own placeholder grey was 3.41:1 here; gray-500 is 4.83:1.
      expect(input.className).toContain('placeholder:text-gray-500')
    })

    it('marks today when the first activity is added there, and says so once', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<QuickLog />)
      open(todayStr())

      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Read')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      const [created] = useCalendarStore.getState().activities
      expect(completedOn(todayStr())).toEqual([created.id])
      expect(screen.getByTestId('quicklog-activity-checkbox')).toBeChecked()
      expect(screen.getByTestId('first-day-line')).toHaveTextContent(new RegExp(`^${LINE}$`))
      expect(screen.getAllByText(LINE)).toHaveLength(1)

      // Closing takes it away for good: the next opening of the same day says nothing.
      close()
      open(todayStr())
      expect(screen.queryByTestId('first-day-line')).not.toBeInTheDocument()
    })

    it('hides the line while another activity is being named, and has it after', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<QuickLog />)
      open(todayStr())

      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Read')
      await user.click(screen.getByTestId('quicklog-add-activity'))
      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.queryByTestId('first-day-line')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('quicklog-cancel-create'))
      expect(screen.getByTestId('first-day-line')).toBeInTheDocument()
    })

    // Decided: the first activity made from another day's sheet marks that day, as it
    // always has. "Today is in" would be untrue there, so the sheet says nothing.
    it("marks the sheet's own day when the first activity is added on another day, and says nothing", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<QuickLog />)
      open(otherDay())

      await user.click(screen.getByTestId('quicklog-create-first-activity'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Read')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      const [created] = useCalendarStore.getState().activities
      expect(completedOn(otherDay())).toEqual([created.id])
      expect(completedOn(todayStr())).toEqual([])
      expect(screen.queryByTestId('first-day-line')).not.toBeInTheDocument()
      expect(screen.queryByText(LINE)).not.toBeInTheDocument()
    })

    it('says nothing when the activity added today is not the first', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      act(() => useCalendarStore.setState({ activities: [habit] }))
      render(<QuickLog />)
      open(todayStr())

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Read')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      expect(completedOn(todayStr())).toHaveLength(1)
      expect(screen.queryByTestId('first-day-line')).not.toBeInTheDocument()
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

    // Activities made without touching the picker all came out the same green, and their
    // dots in the month could not be told apart.
    it('starts a new activity on the first color nobody wears yet', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      act(() => {
        useCalendarStore.setState({
          activities: useCalendarStore.getState().activities.filter((a) => a.color === '#10B981'),
        })
      })
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.getByTestId('quicklog-color-blue')).toHaveAttribute('aria-checked', 'true')

      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Second')
      await user.click(screen.getByTestId('quicklog-add-activity'))

      const second = useCalendarStore.getState().activities.find((a) => a.name === 'Second')
      expect(second?.color).toBe('#3B82F6')
    })

    // Closing the sheet with the form open used to leave the form open, holding the color
    // it was opened with. Another day, after an activity made some other way, opened
    // straight onto the form and onto a color that could be taken by then.
    it('forgets a half-made activity when the sheet closes, and offers the color free now', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.getByTestId('quicklog-color-pink')).toHaveAttribute('aria-checked', 'true')

      // Through setState rather than the action: tests above replace the action and do
      // not put it back.
      act(() => useCalendarStore.setState({ selectedDate: null }))
      act(() => {
        vi.advanceTimersByTime(400)
      })
      act(() => useCalendarStore.getState().addActivity('Elsewhere', '#EC4899'))
      act(() => useCalendarStore.setState({ selectedDate: '2024-01-16' }))
      act(() => {
        vi.advanceTimersByTime(400)
      })

      expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.getByTestId('quicklog-color-orange')).toHaveAttribute('aria-checked', 'true')
    })

    // The sheet takes a quarter of a second to leave. Clearing the half-made activity only
    // once it had gone let a quick close and reopen bring back the form, the name and the
    // color, on another day.
    it('forgets a half-made activity even when another day opens before the sheet has left', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Gym')
      await user.click(screen.getByTestId('quicklog-color-red'))

      act(() => useCalendarStore.setState({ selectedDate: null }))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      // Still leaving, and still as it was: the form does not fold up on the way down.
      expect(screen.getByTestId('quicklog-new-activity-input')).toHaveValue('Gym')

      act(() => useCalendarStore.setState({ selectedDate: '2024-01-16' }))

      expect(screen.queryByTestId('quicklog-new-activity-input')).not.toBeInTheDocument()

      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      expect(screen.getByTestId('quicklog-new-activity-input')).toHaveValue('')
      expect(screen.getByTestId('quicklog-color-pink')).toHaveAttribute('aria-checked', 'true')
    })

    it('moves on to the next free color for the activity after that', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      setupStoreWithActivities()
      render(<QuickLog />)

      // Green, blue and purple are taken; making one more must not leave the next form
      // on the color just used.
      await user.click(screen.getByTestId('quicklog-new-activity-button'))
      await user.type(screen.getByTestId('quicklog-new-activity-input'), 'Fourth')
      await user.click(screen.getByTestId('quicklog-add-activity'))
      await user.click(screen.getByTestId('quicklog-new-activity-button'))

      expect(screen.getByTestId('quicklog-color-orange')).toHaveAttribute('aria-checked', 'true')
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

    // The row used to carry a separate tick at its right edge, on top of the green
    // background, the green text and the checkbox's own tick. The checkbox is the app's
    // own drawing now and says "checked" clearly by itself, so the extra one went.
    //
    // Removing it does not leave colour as the only signal, which is what WCAG 1.4.1
    // forbids: the tick inside the control is not a colour, and the state reaches
    // assistive technology through the input itself.
    it('says a completed activity is completed through its checkbox, not a second tick', () => {
      setupStoreWithLogs()
      render(<QuickLog />)

      const exerciseLabel = screen.getByText('Exercise').closest('label')
      const checkbox = exerciseLabel?.querySelector('input[type="checkbox"]')

      expect(checkbox).toBeChecked()
      expect(exerciseLabel?.querySelector('svg')).toBeNull()
    })
  })
})

/**
 * Coming and going.
 *
 * Henfry, with 1.4.1 on his phone: the day sheet appears and disappears at once, with no
 * slide either way. Two separate reasons, and fixing one alone changes nothing.
 *
 * The tests above all render this with a date already chosen, which is not how the
 * application uses it any more and is exactly the sequence that hides the fault: a sheet
 * that is already open has no first frame to be off the screen in. These mount it closed,
 * the way the application does, and then open it.
 */
describe('arriving and leaving', () => {
  beforeEach(() => {
    resetStore()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const openOn = (date: string) =>
    act(() => {
      useCalendarStore.setState({ selectedDate: date })
    })
  const close = () =>
    act(() => {
      useCalendarStore.setState({ selectedDate: null })
    })
  const frames = () =>
    act(() => {
      vi.advanceTimersByTime(50)
    })
  const sheet = () => screen.getByTestId('quicklog-modal')

  it('starts off the screen and then comes up', () => {
    resetStore()
    render(<QuickLog />)
    expect(screen.queryByTestId('quicklog-modal')).not.toBeInTheDocument()

    openOn('2024-01-15')

    // The frame nobody could see before: on the page, under the bottom edge. Without one,
    // there is no old value for the transition to run from and it is simply there.
    expect(sheet().className).toContain('translate-y-full')

    frames()

    expect(sheet().className).toContain('translate-y-0')
  })

  // The other half, and the one that needed two changes: the component was unmounted by
  // its parent the moment the date went, and it also returned null by itself.
  it('stays on the page while it leaves, with the day still written on it', () => {
    resetStore()
    render(<QuickLog />)
    openOn('2024-01-15')
    frames()

    close()

    expect(sheet()).toBeInTheDocument()
    expect(sheet().className).toContain('translate-y-full')
    // Still says which day it was. The date is held for as long as the sheet is on screen,
    // because a sheet that empties itself on the way out is worse than one that jumps.
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument()
  })

  it('is gone once it has left', () => {
    resetStore()
    render(<QuickLog />)
    openOn('2024-01-15')
    frames()
    close()

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(screen.queryByTestId('quicklog-modal')).not.toBeInTheDocument()
  })

  // Opened and shut faster than the two frames it waits for. The frames belong to the
  // opening that scheduled them, and if they are allowed to land late they mark the sheet
  // as arrived while it is shut, so the next opening has nowhere to come up from.
  it('is not fooled by a sheet shut before it had arrived', () => {
    resetStore()
    render(<QuickLog />)
    openOn('2024-01-15')
    close()
    act(() => {
      vi.advanceTimersByTime(300)
    })

    openOn('2024-02-20')

    expect(sheet().className).toContain('translate-y-full')
  })

  it('comes back from off the screen the second time too', () => {
    resetStore()
    render(<QuickLog />)
    openOn('2024-01-15')
    frames()
    close()
    act(() => {
      vi.advanceTimersByTime(300)
    })

    openOn('2024-02-20')

    expect(sheet().className).toContain('translate-y-full')
    frames()
    expect(sheet().className).toContain('translate-y-0')
    expect(screen.getByText('Feb 20, 2024')).toBeInTheDocument()
  })
})

/**
 * R-09. Yesterday's sheet, on a morning when yesterday is still open, says so under the
 * date, and once something is ticked the same line says the run it made. Friday 13
 * November 2026, with the 9th, 10th and 11th logged and the 12th empty.
 */
describe("yesterday's sheet, while yesterday is still open", () => {
  const habits = [
    {
      id: 'a1',
      name: 'Exercise',
      color: '#10B981',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'a2',
      name: 'Reading',
      color: '#3B82F6',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ]
  const loggedOn = (...dates: string[]) =>
    dates.map((date) => ({
      id: `l-${date}`,
      activityId: 'a1',
      date,
      completed: true,
      createdAt: date,
    }))
  const rescue = loggedOn('2026-11-09', '2026-11-10', '2026-11-11')
  const line = () => screen.queryByTestId('yesterday-line')
  const offer = 'Yesterday is still open. Log any activity to make 4 days in a row.'

  const openOn = (date: string, logs = rescue) => {
    act(() => {
      useCalendarStore.setState({ activities: habits, logs, selectedDate: date })
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0))
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says yesterday is still open, and the run logging it will make', () => {
    render(<QuickLog />)
    openOn('2026-11-12')

    expect(line()).toHaveTextContent(offer)
  })

  it('promises one more when today is already logged', () => {
    render(<QuickLog />)
    openOn('2026-11-12', [...rescue, ...loggedOn('2026-11-13')])

    expect(line()).toHaveTextContent('Log any activity to make 5 days in a row.')
  })

  // The instant of the rescue happens where the person is looking. The line is the same
  // element before and after, so its reserved height stays and the list does not move
  // under the finger.
  it('turns into the run it made once something is ticked, in the same place', () => {
    render(<QuickLog />)
    openOn('2026-11-12')
    const before = line()
    const firstBox = screen.getAllByTestId('quicklog-activity-checkbox')[0]

    fireEvent.click(firstBox)

    expect(line()).toBe(before)
    expect(line()).toHaveTextContent('4 days in a row')
    expect(line()).not.toHaveTextContent('still open')
    expect(line()!.className).toContain('min-h-10')
    expect(screen.getAllByTestId('quicklog-activity-checkbox')[0]).toBe(firstBox)
  })

  it('offers again if what was ticked is unticked', () => {
    render(<QuickLog />)
    openOn('2026-11-12')
    const box = screen.getAllByTestId('quicklog-activity-checkbox')[0]

    fireEvent.click(box)
    fireEvent.click(box)

    expect(line()).toHaveTextContent(offer)
  })

  it('says nothing once yesterday is logged and the sheet is opened again', () => {
    render(<QuickLog />)
    openOn('2026-11-12')
    fireEvent.click(screen.getAllByTestId('quicklog-activity-checkbox')[0])
    act(() => {
      useCalendarStore.setState({ selectedDate: null })
    })

    // Straight back, while the sheet is still on its way out and so never unmounted.
    act(() => {
      useCalendarStore.setState({ selectedDate: '2026-11-12' })
    })

    expect(line()).not.toBeInTheDocument()
  })

  it.each([
    ["today's sheet", '2026-11-13', rescue],
    ['the sheet of an older day', '2026-11-10', rescue],
    ["yesterday's sheet after a run of two", '2026-11-12', loggedOn('2026-11-10', '2026-11-11')],
    [
      "yesterday's sheet after two empty days",
      '2026-11-12',
      loggedOn('2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'),
    ],
  ])('says nothing on %s', (_, date, logs) => {
    render(<QuickLog />)
    openOn(date, logs)

    expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()
    expect(line()).not.toBeInTheDocument()
  })
})
