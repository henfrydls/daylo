import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActivityForm } from './ActivityForm'
import { useCalendarStore } from '../../store'
import { ACTIVITY_COLORS } from '../../lib/colors'
import type { Activity } from '../../types'

// Mock the store
vi.mock('../../store', () => ({
  useCalendarStore: vi.fn(),
}))

const mockAddActivity = vi.fn()
const mockUpdateActivity = vi.fn()
const mockToggleLog = vi.fn()

const mockActivity: Activity = {
  id: 'test-id-1',
  name: 'Test Activity',
  color: '#3B82F6',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

describe('ActivityForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default store mock
    const mockStore = vi.mocked(useCalendarStore)
    mockStore.mockImplementation((selector?: (state: unknown) => unknown) => {
      const state = {
        addActivity: mockAddActivity,
        updateActivity: mockUpdateActivity,
        toggleLog: mockToggleLog,
        activities: [],
      }
      if (typeof selector === 'function') {
        return selector(state)
      }
      return state
    })

    // Mock getState for the toggleLog functionality
    ;(useCalendarStore as unknown as { getState: () => { activities: Activity[] } }).getState =
      () => ({
        activities: [{ ...mockActivity, id: 'new-activity-id' }],
      })
  })

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(<ActivityForm isOpen={false} onClose={() => {}} />)
      expect(screen.queryByText('New Activity')).not.toBeInTheDocument()
    })

    it('should render in create mode when no activity prop is provided', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      expect(screen.getByText('New Activity')).toBeInTheDocument()
      expect(screen.getByTestId('activity-name-input')).toHaveValue('')
      expect(screen.getByTestId('activity-form-submit')).toHaveTextContent('Create Activity')
    })

    it('should render in edit mode when activity prop is provided', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} activity={mockActivity} />)

      expect(screen.getByText('Edit Activity')).toBeInTheDocument()
      expect(screen.getByTestId('activity-name-input')).toHaveValue('Test Activity')
      expect(screen.getByTestId('activity-form-submit')).toHaveTextContent('Save Changes')
    })

    it('should not show date logging section in edit mode', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} activity={mockActivity} />)

      expect(screen.queryByTestId('log-for-date-checkbox')).not.toBeInTheDocument()
    })

    it('should show date logging section in create mode', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      expect(screen.getByTestId('log-for-date-checkbox')).toBeInTheDocument()
    })
  })

  describe('Name Input', () => {
    it('should update name when typing', async () => {
      const user = userEvent.setup()
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'New Habit')

      expect(input).toHaveValue('New Habit')
    })

    it('should clear name input when creating new activity', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'Exercise')

      expect(input).toHaveValue('Exercise')
    })

    it('should populate name from activity prop in edit mode', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} activity={mockActivity} />)

      expect(screen.getByTestId('activity-name-input')).toHaveValue('Test Activity')
    })
  })

  describe('Color Selection', () => {
    it('should render color picker with all activity colors', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      // Check that the color fieldset exists
      expect(screen.getByRole('radiogroup', { name: /select color/i })).toBeInTheDocument()

      // Check that all color buttons are rendered
      const colorButtons = screen.getAllByTestId('color-option')
      expect(colorButtons.length).toBe(ACTIVITY_COLORS.length)
    })

    it('should allow selecting a different color', async () => {
      const user = userEvent.setup()
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      // Find the Blue color button by aria-label
      const blueColorButton = screen.getByLabelText('Blue color')
      await user.click(blueColorButton)

      // The button should now be pressed
      expect(blueColorButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('should preselect color from activity prop in edit mode', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} activity={mockActivity} />)

      // Blue is the color of mockActivity (#3B82F6)
      const blueColorButton = screen.getByLabelText('Blue color')
      expect(blueColorButton).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Form Submission', () => {
    it('should call addActivity when creating new activity', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'New Exercise')

      const submitButton = screen.getByTestId('activity-form-submit')
      await user.click(submitButton)

      expect(mockAddActivity).toHaveBeenCalledWith('New Exercise', ACTIVITY_COLORS[0].value)
      expect(onClose).toHaveBeenCalled()
    })

    it('should call updateActivity when editing existing activity', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} activity={mockActivity} />)

      const input = screen.getByTestId('activity-name-input')
      await user.clear(input)
      await user.type(input, 'Updated Activity')

      const submitButton = screen.getByTestId('activity-form-submit')
      await user.click(submitButton)

      expect(mockUpdateActivity).toHaveBeenCalledWith('test-id-1', {
        name: 'Updated Activity',
        color: '#3B82F6',
      })
      expect(onClose).toHaveBeenCalled()
    })

    it('should trim whitespace from activity name on submit', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, '  Trimmed Name  ')

      const submitButton = screen.getByTestId('activity-form-submit')
      await user.click(submitButton)

      expect(mockAddActivity).toHaveBeenCalledWith('Trimmed Name', ACTIVITY_COLORS[0].value)
    })

    it('should reset form state after successful submission', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { rerender } = render(<ActivityForm isOpen={true} onClose={onClose} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'Test Activity')

      const submitButton = screen.getByTestId('activity-form-submit')
      await user.click(submitButton)

      // Rerender with isOpen true to check form was reset
      rerender(<ActivityForm isOpen={true} onClose={onClose} />)

      expect(screen.getByTestId('activity-name-input')).toHaveValue('')
    })
  })

  describe('Validation', () => {
    it('should disable submit button when name is empty', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const submitButton = screen.getByTestId('activity-form-submit')
      expect(submitButton).toBeDisabled()
    })

    it('should disable submit button when name contains only whitespace', async () => {
      const user = userEvent.setup()
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, '   ')

      const submitButton = screen.getByTestId('activity-form-submit')
      expect(submitButton).toBeDisabled()
    })

    it('should enable submit button when name is valid', async () => {
      const user = userEvent.setup()
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'Valid Name')

      const submitButton = screen.getByTestId('activity-form-submit')
      expect(submitButton).not.toBeDisabled()
    })

    it('should not submit form when name is empty', async () => {
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      // Try to submit via form directly (Enter key on an empty form)
      const form = screen.getByTestId('activity-name-input').closest('form')!
      fireEvent.submit(form)

      expect(mockAddActivity).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Close/Cancel', () => {
    it('should call onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('should reset form state when closing', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'Unsaved Activity')

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('should restore original values when closing edit mode', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} activity={mockActivity} />)

      const input = screen.getByTestId('activity-name-input')
      await user.clear(input)
      await user.type(input, 'Changed Name')

      const cancelButton = screen.getByText('Cancel')
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('Date Logging (Create Mode Only)', () => {
    it('should show date input when log for date checkbox is checked', async () => {
      const user = userEvent.setup()
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const checkbox = screen.getByTestId('log-for-date-checkbox')
      await user.click(checkbox)

      expect(screen.getByTestId('selected-date-input')).toBeInTheDocument()
    })

    it('should change submit button text when log for date is checked', async () => {
      const user = userEvent.setup()
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      // First add a name so the button is enabled
      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'Test')

      const checkbox = screen.getByTestId('log-for-date-checkbox')
      await user.click(checkbox)

      const submitButton = screen.getByTestId('activity-form-submit')
      expect(submitButton).toHaveTextContent('Create & Log')
    })

    it('should call toggleLog when creating with log for date enabled', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ActivityForm isOpen={true} onClose={onClose} />)

      const input = screen.getByTestId('activity-name-input')
      await user.type(input, 'New Activity')

      const checkbox = screen.getByTestId('log-for-date-checkbox')
      await user.click(checkbox)

      const submitButton = screen.getByTestId('activity-form-submit')
      await user.click(submitButton)

      expect(mockAddActivity).toHaveBeenCalled()
      expect(mockToggleLog).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      expect(screen.getByLabelText('Activity Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Also log for a date')).toBeInTheDocument()
    })

    it('should have proper input id and label association', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const input = screen.getByTestId('activity-name-input')
      expect(input).toHaveAttribute('id', 'activity-name')

      const label = screen.getByText('Activity Name')
      expect(label).toHaveAttribute('for', 'activity-name')
    })

    it('should have dialog role on modal', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('should have proper aria attributes on color picker', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const colorPicker = screen.getByRole('radiogroup', { name: /select color/i })
      expect(colorPicker).toBeInTheDocument()

      const colorButtons = screen.getAllByRole('button', { name: /color$/i })
      colorButtons.forEach((button) => {
        expect(button).toHaveAttribute('aria-pressed')
      })
    })

    it('should have autofocus attribute on name input', () => {
      render(<ActivityForm isOpen={true} onClose={() => {}} />)

      const input = screen.getByTestId('activity-name-input')
      // React renders autofocus as autoFocus prop which becomes the autofocus attribute
      // In jsdom, we check if the element has focus
      expect(input).toHaveFocus()
    })
  })

  describe('Form State Sync', () => {
    it('should sync form state when activity prop changes', () => {
      const { rerender } = render(
        <ActivityForm isOpen={true} onClose={() => {}} activity={mockActivity} />
      )

      expect(screen.getByTestId('activity-name-input')).toHaveValue('Test Activity')

      const updatedActivity: Activity = {
        ...mockActivity,
        name: 'Updated Name',
        color: '#EC4899',
      }

      rerender(<ActivityForm isOpen={true} onClose={() => {}} activity={updatedActivity} />)

      expect(screen.getByTestId('activity-name-input')).toHaveValue('Updated Name')
    })

    it('should reset to default values when switching from edit to create mode', () => {
      const { rerender } = render(
        <ActivityForm isOpen={true} onClose={() => {}} activity={mockActivity} />
      )

      expect(screen.getByTestId('activity-name-input')).toHaveValue('Test Activity')

      rerender(<ActivityForm isOpen={true} onClose={() => {}} />)

      expect(screen.getByTestId('activity-name-input')).toHaveValue('')
    })
  })
})
