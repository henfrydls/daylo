import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyReminder } from './DailyReminder'
import { useCalendarStore } from '../../store'
import type { Activity } from '../../types'

const enableReminder = vi.hoisted(() => vi.fn())
const refreshReminder = vi.hoisted(() => vi.fn())
const reconcileReminder = vi.hoisted(() => vi.fn())
const remindersAvailable = vi.hoisted(() => vi.fn())

vi.mock('../../lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reminders')>()),
  enableReminder,
  refreshReminder,
  reconcileReminder,
  remindersAvailable,
}))

const showToast = vi.fn()
vi.mock('../ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ui')>()),
  useToast: () => ({ showToast }),
}))

const anActivity = (id: string): Activity => ({
  id,
  name: `Activity ${id}`,
  color: '#3B82F6',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

/** The state of somebody who has just created their first habit on the Android app. */
function firstHabitOnAndroid() {
  remindersAvailable.mockResolvedValue(true)
  useCalendarStore.setState({
    activities: [anActivity('a')],
    reminderEnabled: false,
    reminderHour: 21,
    reminderMinute: 0,
    reminderOffered: false,
    // Nobody has asked anything yet this session, which is the state a first habit is
    // usually made in. A test that wants the other case says so.
    _offerThisSession: null,
  })
}

const theOffer = () => screen.findByText('Remind me each evening?')
const noOffer = () => expect(screen.queryByText('Remind me each evening?')).not.toBeInTheDocument()

/**
 * Let the availability answer arrive before asserting that nothing appeared.
 *
 * Without this the negative tests pass for the wrong reason: the offer is absent on the
 * first render everywhere, so checking too early says nothing about whether it stays
 * away. Waiting on remindersAvailable having been called is not enough either, since it
 * is called before it answers.
 */
async function settle() {
  await act(async () => {})
}

beforeEach(() => {
  enableReminder.mockReset()
  refreshReminder.mockReset().mockResolvedValue(true)
  reconcileReminder.mockReset().mockResolvedValue(undefined)
  remindersAvailable.mockReset().mockResolvedValue(false)
  showToast.mockReset()
  useCalendarStore.setState({
    activities: [],
    logs: [],
    reminderEnabled: false,
    reminderHour: 21,
    reminderMinute: 0,
    reminderOffered: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the one-time offer', () => {
  it('is not made where reminders do not exist', async () => {
    useCalendarStore.setState({ activities: [anActivity('a')] })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // Asking before there is a habit to be reminded about is asking about nothing.
  it('is not made before the first habit exists', async () => {
    remindersAvailable.mockResolvedValue(true)

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  it('is made once the first habit exists', async () => {
    firstHabitOnAndroid()

    render(<DailyReminder />)

    expect(await theOffer()).toBeInTheDocument()
    // The hour comes from the stored setting rather than the copy, so somebody who moved
    // the time before the offer is not promised nine o'clock.
    expect(screen.getByText(/9:00/)).toBeInTheDocument()
  })

  it('is not made twice', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderOffered: true })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // Somebody who makes their first habit after the check-in has already asked something
  // meets both questions in one sitting otherwise. The session belongs to whoever asked
  // first, and this one waits for the next.
  it('stands down in a session the check-in already took', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ _offerThisSession: 'checkin' })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })
})

describe('answering the offer', () => {
  it('turns the reminder on at the stored time', async () => {
    firstHabitOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'on' })
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    expect(enableReminder).toHaveBeenCalledWith(21, 0)
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
  })

  // "Not now" is an answer, not a postponement: it is recorded so the question does not
  // come back on the second habit, or the third.
  it('records a no without scheduling anything', async () => {
    firstHabitOnAndroid()
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Not now'))

    expect(enableReminder).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
  })

  it('leaves the reminder off when the permission is refused', async () => {
    firstHabitOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'permission-denied' })
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
  })
})

describe('when the activities go', () => {
  it('takes the reminder down with the last one', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderOffered: true, reminderEnabled: true })
    render(<DailyReminder />)
    await settle()

    act(() => useCalendarStore.setState({ activities: [] }))

    await waitFor(() => expect(reconcileReminder).toHaveBeenCalledWith(0))
  })
})

describe('opening the app', () => {
  it('arms an enabled reminder again', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })

    render(<DailyReminder />)

    await waitFor(() => expect(refreshReminder).toHaveBeenCalledWith(21, 0))
  })

  it('arms nothing while the reminder is off', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderOffered: true })

    render(<DailyReminder />)

    await settle()
    expect(refreshReminder).not.toHaveBeenCalled()
  })

  // The switch is a wish, not a schedule. Somebody who deletes every habit has not
  // changed their mind about evenings, so the switch stays where they left it and only
  // the alarm goes. Arming one anyway would put a notification on a phone with nothing
  // to be reminded about.
  it('arms nothing while there is nothing to be reminded about', async () => {
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({ activities: [], reminderEnabled: true, reminderOffered: true })

    render(<DailyReminder />)

    await settle()
    expect(refreshReminder).not.toHaveBeenCalled()
    expect(reconcileReminder).toHaveBeenCalledWith(0)
  })

  it('arms again when a habit comes back', async () => {
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({ activities: [], reminderEnabled: true, reminderOffered: true })
    render(<DailyReminder />)
    await settle()

    act(() => useCalendarStore.setState({ activities: [anActivity('a')] }))

    await waitFor(() => expect(refreshReminder).toHaveBeenCalledWith(21, 0))
  })

  // Accepting the offer and getting nothing is worse than never being offered: the switch
  // would sit there claiming a reminder the phone never took.
  it('says so when the phone refuses the schedule', async () => {
    firstHabitOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'the phone said no' })
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0]).toMatch(/could not set the reminder/i)
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
  })

  // The permission can be taken away in the phone's own settings, and nothing tells the
  // app. A switch that says "on" over an alarm that no longer exists is a lie.
  it('turns the switch off when the permission has gone', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })
    refreshReminder.mockResolvedValue(false)

    render(<DailyReminder />)

    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(false))
  })
})
