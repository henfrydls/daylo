import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReminderSettings } from './ReminderSettings'
import { useCalendarStore } from '../../store'

const enableReminder = vi.hoisted(() => vi.fn())
const disableReminder = vi.hoisted(() => vi.fn())

vi.mock('../../lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reminders')>()),
  enableReminder,
  disableReminder,
}))

const showToast = vi.fn()
vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  useToast: () => ({ showToast }),
}))

const onClose = vi.fn()
const open = () => render(<ReminderSettings isOpen onClose={onClose} />)

const start = () => screen.getByTestId('reminder-start')
const stop = () => screen.getByTestId('reminder-stop')
const theTime = () => screen.getByTestId('reminder-time')
const status = () => screen.getByTestId('reminder-status')

beforeEach(() => {
  enableReminder.mockReset().mockResolvedValue({ outcome: 'on' })
  disableReminder.mockReset().mockResolvedValue(undefined)
  showToast.mockReset()
  onClose.mockReset()
  useCalendarStore.setState({ reminderEnabled: false, reminderHour: 21, reminderMinute: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// The sheet used to hold three controls for one decision: a checkbox, a time, and a Done
// that only closed. Somebody set the time, pressed Done, and only then noticed the box.
describe('the two controls it has', () => {
  it('has no checkbox and no Done', () => {
    open()

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })

  it('says whether it is on, in words', () => {
    open()
    expect(status()).toHaveTextContent('Reminder is off')

    useCalendarStore.setState({ reminderEnabled: true })
    open()

    expect(screen.getAllByTestId('reminder-status')[1]).toHaveTextContent('Reminder is on')
  })

  // The button answers both halves of what somebody had to guess: this is the time, and
  // this is what turns it on.
  it('names the time in the button that turns it on', () => {
    open()

    expect(start()).toHaveTextContent('Remind me at 9:00 PM')
  })

  it('offers stopping, and not restarting, once it is on', () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    expect(stop()).toHaveTextContent('Stop reminders')
    expect(screen.queryByTestId('reminder-start')).not.toBeInTheDocument()
  })
})

describe('turning it on', () => {
  it('schedules at the time on the button', async () => {
    open()

    await userEvent.click(start())

    expect(enableReminder).toHaveBeenCalledWith(21, 0)
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
  })

  it('says how late Android may be, once it is on', () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    expect(screen.getByTestId('reminder-time-note')).toHaveTextContent(
      /^Around 9:00 PM\. Android picks the exact moment: usually close, later if the phone has been asleep\.$/
    )
  })

  // Nothing is scheduled while it is off, so there is nothing to describe.
  it('promises nothing while it is off', () => {
    open()

    expect(screen.queryByTestId('reminder-time-note')).not.toBeInTheDocument()
  })
})

describe('turning it off', () => {
  it('cancels and goes back to off', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    await userEvent.click(stop())

    expect(disableReminder).toHaveBeenCalled()
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(false))
  })
})

describe('the time', () => {
  it('shows the stored one on the row and in the button', () => {
    useCalendarStore.setState({ reminderHour: 7, reminderMinute: 5 })
    open()

    expect(theTime()).toHaveValue('07:05')
    expect(start()).toHaveTextContent('Remind me at 7:05 AM')
  })

  // Moving the time has to reschedule, not just store a number: the alarm already on the
  // phone is at the old hour and nothing else will move it.
  it('reschedules at once while the reminder is on', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    await waitFor(() => expect(enableReminder).toHaveBeenCalledWith(7, 30))
  })

  // Nothing is scheduled while it is off, so there is nothing to reschedule: the time is
  // only remembered, and the button follows it.
  it('is only remembered while the reminder is off', async () => {
    open()

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    await waitFor(() => expect(useCalendarStore.getState().reminderHour).toBe(7))
    expect(enableReminder).not.toHaveBeenCalled()
    expect(start()).toHaveTextContent('Remind me at 7:30 AM')
  })
})

describe('when the phone says no', () => {
  it('stays off when the permission is refused', async () => {
    enableReminder.mockResolvedValue({ outcome: 'permission-denied' })
    open()

    await userEvent.click(start())

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    expect(status()).toHaveTextContent('Reminder is off')
  })

  it('stays off, and quotes the phone, when the schedule is refused', async () => {
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'the phone said no' })
    open()

    await userEvent.click(start())

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0]).toMatch(/could not set the reminder/i)
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    // A release build writes nothing to any log that leaves the device, so if the reason
    // is not here it is nowhere.
    expect(screen.getByTestId('reminder-failure')).toHaveTextContent(
      'Could not set the reminder: the phone said no'
    )
  })

  it('stops showing an old reason once the reminder is set', async () => {
    enableReminder.mockResolvedValueOnce({ outcome: 'failed', reason: 'the phone said no' })
    open()
    await userEvent.click(start())
    await screen.findByTestId('reminder-failure')

    enableReminder.mockResolvedValue({ outcome: 'on' })
    await userEvent.click(start())

    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
    expect(screen.queryByTestId('reminder-failure')).not.toBeInTheDocument()
  })
})
