import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CheckinOffer } from './CheckinOffer'
import { useCalendarStore } from '../../store'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke,
  isTauri: () => true,
}))

const checkinFields = vi.hoisted(() => vi.fn())
vi.mock('../../lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/checkin')>()),
  checkinFields,
}))

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

const habit = {
  id: 'a1',
  name: 'Read',
  color: '#10B981',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

/** Everything the dialog asks for, so each test can say what it is about by changing one. */
const ready = () =>
  useCalendarStore.setState({
    activities: [habit],
    checkinOffered: false,
    checkinEnabled: false,
    checkinId: null,
    checkinLastAttempt: null,
    firstOpenedAt: yesterday,
    _loggedThisSession: true,
    _offerThisSession: null,
    selectedDate: '2026-09-14',
  })

/** What the app does when the day sheet closes, which is the moment this watches for. */
const closeTheDaySheet = () => useCalendarStore.setState({ selectedDate: null })

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined)
  checkinFields.mockReset().mockResolvedValue({ version: '1.3.0', os: 'android' })
  localStorage.clear()
  ready()
})

const asked = () => screen.queryByText('Send an anonymous check-in?')

describe('when it asks', () => {
  it('asks when the day sheet closes on a later day', async () => {
    render(<CheckinOffer />)
    expect(asked()).not.toBeInTheDocument()

    closeTheDaySheet()

    await waitFor(() => expect(asked()).toBeInTheDocument())
    expect(useCalendarStore.getState()._offerThisSession).toBe('checkin')
  })

  // Not on the first day: that day somebody is setting the app up, and a question about
  // sending anything anywhere in the middle of that is a question asked badly.
  it('does not ask on the first day', async () => {
    useCalendarStore.setState({ firstOpenedAt: today })
    render(<CheckinOffer />)

    closeTheDaySheet()

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })

  it('does not ask while the day sheet is still open', async () => {
    render(<CheckinOffer />)

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })

  // The session was already spent on the reminder. Two one-time questions in one sitting
  // is the app talking to somebody who came to tick a box.
  it('does not ask when another offer took this session', async () => {
    useCalendarStore.setState({ _offerThisSession: 'reminder' })
    render(<CheckinOffer />)

    closeTheDaySheet()

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })

  it('does not ask in a session where nothing was written down', async () => {
    useCalendarStore.setState({ _loggedThisSession: false })
    render(<CheckinOffer />)

    closeTheDaySheet()

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })

  it('does not ask twice, whatever the answer was', async () => {
    useCalendarStore.setState({ checkinOffered: true })
    render(<CheckinOffer />)

    closeTheDaySheet()

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })

  // No Tauri, no check-in: the web build and the Docker image have no path that could
  // send anything, so the question would be about nothing.
  it('does not ask where there is nothing to send with', async () => {
    checkinFields.mockResolvedValue(null)
    render(<CheckinOffer />)

    closeTheDaySheet()

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })

  it('does not ask an app with no habits in it', async () => {
    useCalendarStore.setState({ activities: [] })
    render(<CheckinOffer />)

    closeTheDaySheet()

    await waitFor(() => expect(checkinFields).toHaveBeenCalled())
    expect(asked()).not.toBeInTheDocument()
  })
})

describe('what it says', () => {
  const ask = async () => {
    render(<CheckinOffer />)
    closeTheDaySheet()
    await waitFor(() => expect(asked()).toBeInTheDocument())
  }

  it('says what is sent, and that nothing is sent today', async () => {
    await ask()

    expect(
      screen.getByText(/Daylo does not send anything anywhere\./, { exact: false })
    ).toBeInTheDocument()
    expect(screen.getByText(/Nothing else\./, { exact: false })).toBeInTheDocument()
    expect(
      screen.getByText(/Daylo sends one last note saying so, and then nothing at all/, {
        exact: false,
      })
    ).toBeInTheDocument()
  })

  // Neither answer is the recommended one, so neither button is the green one. The app
  // allows one green thing at a time and this is not the place to spend it.
  it('offers two answers and prefers neither', async () => {
    await ask()

    const leaveOff = screen.getByTestId('checkin-leave-off')
    const turnOn = screen.getByTestId('checkin-turn-on')
    expect(leaveOff.className).toBe(turnOn.className)
    expect(screen.getByTestId('checkin-offer').innerHTML).not.toContain('bg-emerald')
  })

  it('shows what would be sent, with an example number and the real version', async () => {
    await ask()

    const disclosure = screen.getByTestId('checkin-what-gets-sent')
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(disclosure)

    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e')).toBeInTheDocument()
    expect(screen.getByText('1.3.0')).toBeInTheDocument()
    expect(screen.getByText('android')).toBeInTheDocument()
    expect(screen.getByText(today)).toBeInTheDocument()
    expect(
      screen.getByText(/the random number is not made until you turn this on/, { exact: false })
    ).toBeInTheDocument()
  })
})

describe('what each answer does', () => {
  const ask = async () => {
    render(<CheckinOffer />)
    closeTheDaySheet()
    await waitFor(() => expect(asked()).toBeInTheDocument())
  }

  // The answer that changes nothing must leave nothing behind: no number on disk, and
  // nothing sent to say the question was asked.
  it('leaves nothing behind when the answer is no', async () => {
    await ask()

    await userEvent.click(screen.getByTestId('checkin-leave-off'))

    const state = useCalendarStore.getState()
    expect(state.checkinOffered).toBe(true)
    expect(state.checkinEnabled).toBe(false)
    expect(state.checkinId).toBeNull()
    expect(invoke).not.toHaveBeenCalledWith('send_checkin', expect.anything())
    await waitFor(() => expect(asked()).not.toBeInTheDocument())
  })

  it('treats Escape as the same no', async () => {
    await ask()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(useCalendarStore.getState().checkinOffered).toBe(true))
    expect(useCalendarStore.getState().checkinEnabled).toBe(false)
    expect(useCalendarStore.getState().checkinId).toBeNull()
    expect(invoke).not.toHaveBeenCalledWith('send_checkin', expect.anything())
  })

  it('makes a number and sends today when the answer is yes', async () => {
    await ask()

    await userEvent.click(screen.getByTestId('checkin-turn-on'))

    await waitFor(() => expect(useCalendarStore.getState().checkinEnabled).toBe(true))
    const state = useCalendarStore.getState()
    expect(state.checkinOffered).toBe(true)
    expect(state.checkinId).toMatch(/^[0-9a-f]{32}$/)
    expect(invoke).toHaveBeenCalledWith('send_checkin', {
      id: state.checkinId,
      date: today,
      last: false,
    })
  })

  // Nothing is said about whether it arrived. The consent is what was asked for, and the
  // sheet in the menu is where the state of the sending lives.
  it('says nothing about a send that failed', async () => {
    invoke.mockRejectedValue(new Error('offline'))
    await ask()

    await userEvent.click(screen.getByTestId('checkin-turn-on'))

    await waitFor(() => expect(useCalendarStore.getState().checkinLastAttempt?.ok).toBe(false))
    expect(useCalendarStore.getState().checkinEnabled).toBe(true)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
