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
const theSwitch = () => screen.getByTestId('reminder-toggle')
const theTime = () => screen.getByTestId('reminder-time')

beforeEach(() => {
  enableReminder.mockReset().mockResolvedValue('on')
  disableReminder.mockReset().mockResolvedValue(undefined)
  showToast.mockReset()
  onClose.mockReset()
  useCalendarStore.setState({
    reminderEnabled: false,
    reminderHour: 21,
    reminderMinute: 0,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the switch', () => {
  it('schedules at the stored time when turned on', async () => {
    open()

    await userEvent.click(theSwitch())

    expect(enableReminder).toHaveBeenCalledWith(21, 0)
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
  })

  it('cancels when turned off', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    await userEvent.click(theSwitch())

    expect(disableReminder).toHaveBeenCalled()
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(false))
  })

  // The store is written only once the platform has agreed. A switch left showing "on"
  // with nothing scheduled is worse than one that refuses to move.
  it('stays off when the permission is refused', async () => {
    enableReminder.mockResolvedValue('permission-denied')
    open()

    await userEvent.click(theSwitch())

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    expect(theSwitch()).not.toBeChecked()
  })
})

// The switch is only ever on over something the phone agreed to schedule. Before, a
// refusal from the phone was invisible and the switch stayed on with nothing behind it.
it('goes back off, and says so, when the phone refuses the schedule', async () => {
  enableReminder.mockResolvedValue('failed')
  open()

  await userEvent.click(theSwitch())

  await waitFor(() => expect(showToast).toHaveBeenCalled())
  expect(showToast.mock.calls[0][0]).toMatch(/could not set the reminder/i)
  expect(useCalendarStore.getState().reminderEnabled).toBe(false)
  expect(theSwitch()).not.toBeChecked()
})

describe('the time', () => {
  it('shows the stored one', () => {
    useCalendarStore.setState({ reminderHour: 7, reminderMinute: 5 })
    open()

    expect(theTime()).toHaveValue('07:05')
    expect(screen.getByText(/7:05/)).toBeInTheDocument()
  })

  // Nothing is scheduled while the switch is off, so the note cannot speak as though
  // something were coming.
  it('does not describe a reminder that is not coming', () => {
    open()

    expect(screen.getByTestId('reminder-time-note')).toHaveTextContent(
      /turn it on and it will arrive/i
    )
  })

  it('describes the one that is', () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    expect(screen.getByTestId('reminder-time-note')).toHaveTextContent(
      /^Around 9:00 PM\. Android may shift it a few minutes\.$/
    )
  })

  // Moving the time has to re-schedule, not just store a number: the alarm already on the
  // phone is at the old hour and nothing else will move it.
  it('re-schedules an enabled reminder when it changes', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    open()

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    await waitFor(() => expect(enableReminder).toHaveBeenCalledWith(7, 30))
    expect(useCalendarStore.getState().reminderHour).toBe(7)
    expect(useCalendarStore.getState().reminderMinute).toBe(30)
  })

  // Nothing is scheduled while the reminder is off, so there is nothing to re-schedule.
  it('is remembered without scheduling anything while the reminder is off', async () => {
    open()

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    await waitFor(() => expect(useCalendarStore.getState().reminderHour).toBe(7))
    expect(enableReminder).not.toHaveBeenCalled()
  })
})

it('closes on Done', async () => {
  open()

  await userEvent.click(screen.getByText('Done'))

  expect(onClose).toHaveBeenCalled()
})

// Below the scrolling body, where every other modal in the app puts its actions.
it('keeps Done out of the scrolling body', () => {
  open()

  expect(screen.getByTestId('modal-footer')).toContainElement(screen.getByText('Done'))
})
