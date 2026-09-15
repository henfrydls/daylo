import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useCalendarStore } from './store'

const remindersAvailable = vi.hoisted(() => vi.fn())
const openMailto = vi.hoisted(() => vi.fn())
const checkinFields = vi.hoisted(() => vi.fn())
const sendCheckinIfDue = vi.hoisted(() => vi.fn())

vi.mock('./lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/checkin')>()),
  checkinFields,
  sendCheckinIfDue,
}))

vi.mock('./lib/feedbackInvite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/feedbackInvite')>()),
  openMailto,
}))

// The platform side of reminders is stubbed: this is about what the menu offers, not
// about what Android does with it.
vi.mock('./lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/reminders')>()),
  remindersAvailable,
  enableReminder: vi.fn().mockResolvedValue('on'),
  disableReminder: vi.fn().mockResolvedValue(undefined),
  reconcileReminder: vi.fn().mockResolvedValue(undefined),
}))

async function openTheMenu() {
  // Both triggers are in the DOM at once, one for phones and one for wider screens; jsdom
  // applies no media queries, so either will do.
  await userEvent.click(screen.getAllByLabelText('More options')[0])
}

beforeEach(() => {
  remindersAvailable.mockReset().mockResolvedValue(false)
  checkinFields.mockReset().mockResolvedValue(null)
  sendCheckinIfDue.mockReset().mockResolvedValue(undefined)
  useCalendarStore.setState({
    activities: [],
    logs: [],
    _hasHydrated: true,
    reminderEnabled: false,
    reminderOffered: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the daily reminder in the menu', () => {
  it('is absent where a notification cannot arrive', async () => {
    render(<App />)
    await act(async () => {})

    await openTheMenu()

    expect(screen.queryByText('Daily reminder')).not.toBeInTheDocument()
  })

  it('is there on Android, and opens the setting', async () => {
    remindersAvailable.mockResolvedValue(true)
    render(<App />)
    await act(async () => {})

    await openTheMenu()
    await userEvent.click(screen.getByText('Daily reminder'))

    expect(await screen.findByTestId('reminder-settings')).toBeInTheDocument()
  })
})

// The invitation asks once, on day fourteen. This is for the rest of the time: somebody
// with something to say on day three should not have to wait to be asked.
describe('writing without being asked', () => {
  beforeEach(() => {
    openMailto.mockReset().mockResolvedValue('opened')
    useCalendarStore.setState({ feedbackInviteSeen: false })
  })

  it('is in the menu, on every platform', async () => {
    render(<App />)
    await act(async () => {})

    await openTheMenu()

    expect(screen.getByText('Send feedback')).toBeInTheDocument()
  })

  // It opens the letter and marks nothing. Pressing this out of curiosity and backing out
  // of the chooser would otherwise take the invitation away for good, and take it away
  // silently: the person would never learn there had been one. The cost the other way is
  // that somebody who did write may still be invited on day fourteen, and that one they
  // can see and close.
  it('opens the letter without spending the invitation', async () => {
    render(<App />)
    await act(async () => {})
    await openTheMenu()

    await userEvent.click(screen.getByText('Send feedback'))

    await act(async () => {})
    expect(openMailto).toHaveBeenCalledTimes(1)
    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(false)
  })

  // A toast rather than a line, because there is no band on screen to write into, and the
  // address has to reach the person somehow.
  it('gives the address when no email app answers', async () => {
    openMailto.mockResolvedValue('failed')
    render(<App />)
    await act(async () => {})
    await openTheMenu()

    await userEvent.click(screen.getByText('Send feedback'))

    expect(await screen.findByText(/Could not open an email app/)).toBeInTheDocument()
    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(false)
  })
})

// The check-in has no place outside the native app: the web build and the Docker image
// have no command to call and a CSP that forbids the call anyway.
describe('the check-in in the menu', () => {
  it('is absent where nothing can be sent', async () => {
    render(<App />)
    await act(async () => {})

    await openTheMenu()

    expect(screen.queryByText('Anonymous check-in')).not.toBeInTheDocument()
  })

  it('is there in the app, and opens the sheet', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android' })
    render(<App />)
    await act(async () => {})

    await openTheMenu()
    await userEvent.click(screen.getByText('Anonymous check-in'))

    expect(await screen.findByTestId('checkin-settings')).toBeInTheDocument()
  })
})

// Two moments, because two kinds of device. A phone is closed and opened; a desktop is
// left running for days and only the window coming back says a new day has started.
describe('when the daily check-in is attempted', () => {
  it('asks once the store is there and the app can send', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux' })
    render(<App />)
    await act(async () => {})

    expect(sendCheckinIfDue).toHaveBeenCalled()
  })

  it('does not ask where nothing can be sent', async () => {
    render(<App />)
    await act(async () => {})

    expect(sendCheckinIfDue).not.toHaveBeenCalled()
  })

  it('asks again when the window comes back', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux' })
    render(<App />)
    await act(async () => {})
    sendCheckinIfDue.mockClear()

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(sendCheckinIfDue).toHaveBeenCalled()
  })
})
