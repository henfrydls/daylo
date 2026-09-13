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
const done = () => screen.queryByTestId('reminder-done')
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
describe('the controls it has', () => {
  it('has no checkbox anywhere', () => {
    open()

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  // The Done that was removed was a close button in a costume, offered whether or not
  // anything had happened. The one that came back is only ever offered over something
  // that did.
  it('offers no Done while nothing has happened', () => {
    open()
    expect(done()).not.toBeInTheDocument()

    useCalendarStore.setState({ reminderEnabled: true })
    open()

    expect(done()).not.toBeInTheDocument()
  })

  // Somebody opened this with the reminder already on and did not realise it was on. The
  // line says what is happening rather than naming a setting, and it carries the time, so
  // the most read line in the sheet answers both of the questions he had.
  it('says what is happening, with the time in it', () => {
    open()
    expect(status()).toHaveTextContent('Reminder is off')

    useCalendarStore.setState({ reminderEnabled: true })
    open()

    expect(screen.getAllByTestId('reminder-status')[1]).toHaveTextContent(
      'Reminding you daily at 9:00 PM'
    )
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
      /^Android picks the exact moment: usually close, later if the phone has been asleep\.$/
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

// "no había como un aceptar, qué sé yo." Somebody opened this with the reminder on, moved
// the time, and found nothing underneath but the button that stops it. The finish he was
// looking for now appears, and only where there is something finished.
describe('the finish, and when it exists', () => {
  const openOn = () => {
    useCalendarStore.setState({ reminderEnabled: true })
    return open()
  }

  it('appears once the time has been moved', async () => {
    openOn()
    expect(done()).not.toBeInTheDocument()

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    expect(await screen.findByTestId('reminder-done')).toHaveTextContent('Done')
  })

  // Turning the reminder on is not moving its time. The green button already said the
  // hour, pressing it is the confirm, and a Done underneath the result would be a second
  // one for the same act.
  it('does not appear just because the reminder was switched on', async () => {
    open()

    await userEvent.click(start())

    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
    expect(done()).not.toBeInTheDocument()
  })

  // It only closes. The reschedule it concludes happened at the picker's own OK, so there
  // is nothing here that a person could lose by closing some other way.
  it('only closes, and schedules nothing of its own', async () => {
    openOn()
    fireEvent.change(theTime(), { target: { value: '07:30' } })
    await screen.findByTestId('reminder-done')
    enableReminder.mockClear()

    await userEvent.click(done()!)

    expect(onClose).toHaveBeenCalled()
    expect(enableReminder).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderEnabled).toBe(true)
    expect(useCalendarStore.getState().reminderHour).toBe(7)
  })

  // Asked out loud: "it should also work if I changed it and tapped outside, because I
  // didn't press Done." It does, and this is what says so. The time was scheduled at the
  // picker's own OK, long before the button existed, so every way of closing leaves it
  // where it is — which is the whole reason the button cannot be called Save.
  it('keeps the new time when the sheet is closed without pressing it', async () => {
    openOn()
    fireEvent.change(theTime(), { target: { value: '07:30' } })
    await screen.findByTestId('reminder-done')
    expect(enableReminder).toHaveBeenCalledWith(7, 30)

    await userEvent.click(screen.getByLabelText('Close modal'))

    expect(onClose).toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderEnabled).toBe(true)
    expect(useCalendarStore.getState().reminderHour).toBe(7)
    expect(useCalendarStore.getState().reminderMinute).toBe(30)
  })

  // And it is still there the next time the sheet is opened, which is where a person
  // would go looking to check.
  it('still reads the new time when the sheet is opened again', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const { rerender } = render(<ReminderSettings isOpen onClose={onClose} />)
    fireEvent.change(theTime(), { target: { value: '07:30' } })
    await screen.findByTestId('reminder-done')

    rerender(<ReminderSettings isOpen={false} onClose={onClose} />)
    rerender(<ReminderSettings isOpen onClose={onClose} />)

    expect(theTime()).toHaveValue('07:30')
    expect(status()).toHaveTextContent('Reminding you daily at 7:30 AM')
  })

  // Nothing was scheduled, so nothing was finished: the green button already names the new
  // time, and that is the confirm.
  it('stays away when the time moves while the reminder is off', async () => {
    open()

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    await waitFor(() => expect(start()).toHaveTextContent('Remind me at 7:30 AM'))
    expect(done()).not.toBeInTheDocument()
  })

  // A finish offered over a reminder that is not running would be a lie.
  it('stays away when the phone refuses the new time', async () => {
    openOn()
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'the phone said no' })

    fireEvent.change(theTime(), { target: { value: '07:30' } })

    await screen.findByTestId('reminder-failure')
    expect(done()).not.toBeInTheDocument()
  })

  it('is gone again the next time the sheet is opened', async () => {
    useCalendarStore.setState({ reminderEnabled: true })
    const { rerender } = render(<ReminderSettings isOpen onClose={onClose} />)
    fireEvent.change(theTime(), { target: { value: '07:30' } })
    await screen.findByTestId('reminder-done')

    rerender(<ReminderSettings isOpen={false} onClose={onClose} />)
    rerender(<ReminderSettings isOpen onClose={onClose} />)

    expect(done()).not.toBeInTheDocument()
  })

  // Two buttons, and the one that stops the reminder steps back to let the other lead:
  // somebody who has just moved the time is not looking for the way to stop. Done sits at
  // the right edge, where a thumb aiming at where Stop used to be lands on the button that
  // only closes.
  it('leads, with the stop button behind it and to its left', async () => {
    openOn()
    expect(stop().className).toContain('bg-gray-100')

    fireEvent.change(theTime(), { target: { value: '07:30' } })
    await screen.findByTestId('reminder-done')

    expect(stop().className).toContain('bg-transparent')
    expect(done()!.className).toContain('bg-emerald-500')
    expect(stop().compareDocumentPosition(done()!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
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
