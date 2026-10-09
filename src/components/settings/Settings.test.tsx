import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Settings } from './Settings'
import { useCalendarStore } from '../../store'
import type { UpdateStatus } from '../../hooks/useUpdates'

vi.mock('../../lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/checkin')>()),
  turnOnCheckin: vi.fn().mockResolvedValue(undefined),
  turnOffCheckin: vi.fn().mockResolvedValue('sent'),
}))

const enableReminder = vi.hoisted(() => vi.fn())
const disableReminder = vi.hoisted(() => vi.fn())

vi.mock('../../lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reminders')>()),
  enableReminder,
  disableReminder,
}))

const check = vi.fn()
const install = vi.fn()

function show({
  status = { kind: 'idle' } as UpdateStatus,
  waiting = null as string | null,
  supported = true,
  hasReminders = false,
  canCheckIn = true,
} = {}) {
  return render(
    <Settings
      isOpen
      onClose={vi.fn()}
      onExport={vi.fn()}
      onImport={vi.fn()}
      onFeedback={vi.fn()}
      hasReminders={hasReminders}
      canCheckIn={canCheckIn}
      version="1.4.2"
      updates={{ supported, status, waiting, check, install }}
    />
  )
}

beforeEach(() => {
  check.mockReset()
  install.mockReset()
  enableReminder.mockReset().mockResolvedValue({ outcome: 'on' })
  disableReminder.mockReset().mockResolvedValue(undefined)
  useCalendarStore.setState({
    activities: [],
    logs: [],
    checkinEnabled: false,
    updatesEnabled: true,
    reminderEnabled: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the version row', () => {
  /**
   * A row is wide, it sits in a list somebody scrolls with a thumb, and installing closes
   * Daylo and opens it again. Whichever of the two happens is decided by the control that
   * was pressed, never by what has already been found, because what has been found is
   * exactly what the person pressing cannot see.
   */
  it('asks, and does not install, even when there is one waiting', async () => {
    const user = userEvent.setup()
    show({ waiting: '1.5.0', status: { kind: 'available', version: '1.5.0', canInstall: true } })

    await user.click(screen.getByTestId('settings-check'))

    expect(check).toHaveBeenCalledOnce()
    expect(install).not.toHaveBeenCalled()
  })

  it('installs from the word beside the number, and nowhere else', async () => {
    const user = userEvent.setup()
    show({ waiting: '1.5.0', status: { kind: 'available', version: '1.5.0', canInstall: true } })

    await user.click(screen.getByTestId('settings-update'))

    expect(install).toHaveBeenCalledOnce()
    expect(check).not.toHaveBeenCalled()
  })

  it('offers nothing to press when there is nothing waiting', () => {
    show({ waiting: null })

    expect(screen.queryByTestId('settings-update')).not.toBeInTheDocument()
  })

  // Where there is no updater the number is a fact and not a button: pressing it would ask
  // a question this copy has no way of answering.
  it('cannot be asked where there is no updater', () => {
    show({ supported: false })

    expect(screen.queryByTestId('settings-check')).not.toBeInTheDocument()
    expect(screen.queryByTestId('updates-switch')).not.toBeInTheDocument()
    expect(screen.getByText('1.4.2')).toBeInTheDocument()
  })
})

describe('what each platform is shown', () => {
  it('leaves out reminders where a notification cannot arrive', () => {
    show({ hasReminders: false })

    expect(screen.queryByText('Reminders')).not.toBeInTheDocument()
  })

  it('shows them where it can', () => {
    show({ hasReminders: true })

    expect(screen.getByText('Reminders')).toBeInTheDocument()
    expect(screen.getByTestId('reminder-switch')).toBeInTheDocument()
  })

  it('leaves out the check-in where nothing can be sent', () => {
    show({ canCheckIn: false })

    expect(screen.queryByTestId('checkin-switch')).not.toBeInTheDocument()
    // The heading stays: the sentence about feedback under it is still true, and it is the
    // only place that says what a browser does and does not send.
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByText(/only when you press Send/)).toBeInTheDocument()
  })
})

describe('what it says about the data', () => {
  it('counts what is held, in words that match the number', () => {
    useCalendarStore.setState({
      activities: [
        {
          id: 'a',
          name: 'Read',
          color: '#10B981',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      logs: [
        { id: 'l', activityId: 'a', date: '2026-01-01', completed: true, createdAt: '2026-01-01' },
      ],
    })

    show()

    expect(screen.getByText('1 activity, 1 entry')).toBeInTheDocument()
  })

  it('says none of them in the plural', () => {
    show()

    expect(screen.getByText('0 activities, 0 entries')).toBeInTheDocument()
  })
})

describe('arriving', () => {
  // The panel is put into the page off to the right and travels in. Without a frame at the
  // starting value there is nothing for the transition to travel from, and it is simply
  // there: the same fault the day sheet had, in a different surface.
  it('starts off to the side and then comes in', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      show()

      expect(screen.getByTestId('settings-surface').className).toContain('translate-x-6')

      act(() => {
        vi.advanceTimersByTime(50)
      })

      expect(screen.getByTestId('settings-surface').className).toContain('translate-x-0')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the switches', () => {
  it('turns the check-in on and off from the surface', async () => {
    const user = userEvent.setup()
    const { turnOnCheckin, turnOffCheckin } = await import('../../lib/checkin')
    show()

    await user.click(screen.getByTestId('checkin-switch'))
    expect(turnOnCheckin).toHaveBeenCalledOnce()

    useCalendarStore.setState({ checkinEnabled: true })
    await user.click(screen.getByTestId('checkin-switch'))
    expect(turnOffCheckin).toHaveBeenCalledOnce()
  })

  it('stops and starts the automatic check for versions', async () => {
    const user = userEvent.setup()
    show()

    await user.click(screen.getByTestId('updates-switch'))

    expect(useCalendarStore.getState().updatesEnabled).toBe(false)
  })

  // Each switch says what it turns on and what that costs, in the row itself, because a
  // switch whose meaning is a paragraph away is a switch pressed without reading it.
  it('say what they are for where they are', () => {
    show()

    expect(screen.getByText(/Nothing about what you track/)).toBeInTheDocument()
    expect(screen.getByText('Asks GitHub. Nothing about you.')).toBeInTheDocument()
  })
})

describe('what it says about a new version', () => {
  const cases: [UpdateStatus, string][] = [
    [{ kind: 'checking' }, 'Checking…'],
    [{ kind: 'up-to-date' }, 'Daylo is up to date.'],
    [{ kind: 'available', version: '1.5.0', canInstall: true }, 'Daylo 1.5.0 is out.'],
    [{ kind: 'working' }, 'Daylo is updating itself.'],
    [{ kind: 'restart' }, 'Done. Restart Daylo to finish.'],
    [{ kind: 'failed' }, 'Could not check just now.'],
  ]

  for (const [status, words] of cases) {
    it(`says "${words}" for ${status.kind}`, () => {
      show({ status })

      expect(screen.getByTestId('settings-update-status')).toHaveTextContent(words)
    })
  }

  // Nothing at all before anybody has asked: a screen that opens knowing nothing should
  // claim nothing, and "up to date" before a check is a claim.
  it('says nothing at all when nothing is known', () => {
    show({ status: { kind: 'idle' } })

    expect(screen.getByTestId('settings-update-status')).toHaveTextContent('')
  })
})

describe('the reminder row', () => {
  it('says the time it is set for', () => {
    useCalendarStore.setState({ reminderEnabled: true, reminderHour: 20, reminderMinute: 0 })

    show({ hasReminders: true })

    expect(screen.getByText('At 8:00 PM')).toBeInTheDocument()
  })

  it('says it is off when it is', () => {
    useCalendarStore.setState({ reminderEnabled: false })

    show({ hasReminders: true })

    expect(screen.getByText('Off')).toBeInTheDocument()
  })
})

describe('the reminder time, and the switch beside it', () => {
  it('shows the stored time and asks for a new one when it is changed', async () => {
    useCalendarStore.setState({ reminderEnabled: false, reminderHour: 21, reminderMinute: 0 })
    show({ hasReminders: true })
    const field = screen.getByTestId('reminder-time') as HTMLInputElement
    expect(field.value).toBe('21:00')

    fireEvent.change(field, { target: { value: '07:15' } })

    // Off, so there is nothing to reschedule and the time is only remembered.
    expect(useCalendarStore.getState().reminderHour).toBe(7)
    expect(useCalendarStore.getState().reminderMinute).toBe(15)
  })

  it('turns it on at the time that is showing', async () => {
    const user = userEvent.setup()
    useCalendarStore.setState({ reminderEnabled: false, reminderHour: 21, reminderMinute: 0 })
    show({ hasReminders: true })

    await user.click(screen.getByTestId('reminder-switch'))

    await waitFor(() => expect(enableReminder).toHaveBeenCalledWith(21, 0))
  })

  // What the phone said, where the switch is, rather than a toast that has gone by the time
  // somebody looks for a reason.
  it('quotes the phone where it refused', async () => {
    const user = userEvent.setup()
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'exact alarms are off' })
    show({ hasReminders: true })

    await user.click(screen.getByTestId('reminder-switch'))

    expect(await screen.findByText(/exact alarms are off/)).toBeInTheDocument()
  })
})

/**
 * What each switch costs, said where the switch is.
 *
 * The sheets this screen replaced warned before turning the check-in off, because turning
 * it off deletes the number and a thing that deletes something should say so before it is
 * pressed and not after. The new design had no room for the warning it used to show, so
 * the warning is a line under the switch instead of being quietly dropped.
 */
describe('what the switches cost', () => {
  it('says the number goes when the check-in is turned off', () => {
    show()

    expect(screen.getByText('Turning it off deletes the random number.')).toBeInTheDocument()
  })

  it('says the reminder may arrive late, because Android decides when', () => {
    show({ hasReminders: true })

    expect(screen.getByText('Android may deliver it a few minutes late.')).toBeInTheDocument()
  })

  // Both lines are named by the switch, so somebody listening rather than looking is told
  // the cost at the same moment as the choice.
  it('reads them out with the switch they belong to', () => {
    show({ hasReminders: true })

    const described = screen
      .getByRole('switch', { name: 'Anonymous check-in' })
      .getAttribute('aria-describedby')
    const said = (described ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')

    expect(said).toContain('Nothing about what you track')
    expect(said).toContain('deletes the random number')
  })
})

describe('the section about what leaves', () => {
  // Called Privacy, because that is the word somebody looking for this uses. The old
  // heading described the mechanism and you had to already know what you were after.
  it('is called Privacy', () => {
    show()

    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.queryByText('What leaves your device')).not.toBeInTheDocument()
  })

  // At the end of the short version rather than among the links at the foot, where
  // somebody reading this section to decide something would not have looked.
  it('ends with the policy, pointing at the real one', () => {
    show()

    const row = screen.getByTestId('settings-privacy')
    expect(row).toHaveAttribute('href', 'https://daylo.henfrydls.com/privacy/')
    expect(row).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })
})

/**
 * The reminder's second half, which only exists once there is a reminder.
 *
 * A row asking when to send something that is not being sent is a question about nothing,
 * and the line about Android's timing is advice nobody needs yet.
 */
describe('the reminder, folded away while it is off', () => {
  const details = () => screen.getByTestId('reminder-details')

  it('keeps the time and the warning out of reach while it is off', () => {
    useCalendarStore.setState({ reminderEnabled: false })

    show({ hasReminders: true })

    expect(details().className).toContain('grid-rows-[0fr]')
    // Out of reach and not merely out of sight: a field folded away must not be something
    // Tab finds, and the line must not be read out as if it applied.
    const inner = details().firstElementChild
    expect(inner).toHaveAttribute('inert')
    expect(inner).toHaveAttribute('aria-hidden', 'true')
  })

  it('opens them out once there is a reminder', () => {
    useCalendarStore.setState({ reminderEnabled: true, reminderHour: 20, reminderMinute: 0 })

    show({ hasReminders: true })

    expect(details().className).toContain('grid-rows-[1fr]')
    const inner = details().firstElementChild
    expect(inner).not.toHaveAttribute('inert')
    expect(screen.getByText('Android may deliver it a few minutes late.')).toBeInTheDocument()
  })

  // The switch itself never folds: turning it back on has to be possible from where
  // turning it off left you.
  it('leaves the switch where it was', () => {
    useCalendarStore.setState({ reminderEnabled: false })

    show({ hasReminders: true })

    expect(screen.getByTestId('reminder-switch')).toBeInTheDocument()
    expect(screen.getByText('Off')).toBeInTheDocument()
  })
})
