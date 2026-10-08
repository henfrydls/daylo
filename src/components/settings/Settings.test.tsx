import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Settings } from './Settings'
import { useCalendarStore } from '../../store'
import type { UpdateStatus } from '../../hooks/useUpdates'

vi.mock('../../lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/checkin')>()),
  turnOnCheckin: vi.fn().mockResolvedValue(undefined),
  turnOffCheckin: vi.fn().mockResolvedValue('sent'),
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
    expect(screen.getByText('What leaves your device')).toBeInTheDocument()
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
