import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyReminder } from './DailyReminder'
import { useCalendarStore } from '../../store'
import type { Activity, ActivityLog } from '../../types'

const enableReminder = vi.hoisted(() => vi.fn())
const refreshReminder = vi.hoisted(() => vi.fn())
const reconcileReminder = vi.hoisted(() => vi.fn())
const remindersAvailable = vi.hoisted(() => vi.fn())
const disableReminder = vi.hoisted(() => vi.fn())

vi.mock('../../lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/reminders')>()),
  enableReminder,
  refreshReminder,
  reconcileReminder,
  remindersAvailable,
  disableReminder,
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
    // Nobody has picked a time either: the suggested one is what a first habit meets.
    reminderTimeChosen: false,
    // Nobody has asked anything yet this session, which is the state a first habit is
    // usually made in. A test that wants the other case says so.
    _offerThisSession: null,
  })
}

const aLog = (activityId: string, date: string): ActivityLog => ({
  id: `${activityId}-${date}`,
  activityId,
  date,
  completed: true,
  createdAt: `${date}T12:00:00.000Z`,
})

/**
 * The moment the offer is for: the Android app, a habit, a second day with a log, and in
 * this session something was just logged and the day sheet is closed again.
 */
function secondDayOnAndroid() {
  firstHabitOnAndroid()
  useCalendarStore.setState({
    logs: [aLog('a', '2026-10-08'), aLog('a', '2026-10-09')],
    _loggedThisSession: true,
    selectedDate: null,
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
  disableReminder.mockReset().mockResolvedValue(undefined)
  showToast.mockReset()
  useCalendarStore.setState({
    activities: [],
    logs: [],
    reminderEnabled: false,
    reminderHour: 21,
    reminderMinute: 0,
    reminderOffered: false,
    _loggedThisSession: false,
    _offerThisSession: null,
    selectedDate: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the one-time offer', () => {
  it('is not made where reminders do not exist', async () => {
    secondDayOnAndroid()
    remindersAvailable.mockResolvedValue(false)

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // Asking before there is a habit to be reminded about is asking about nothing.
  it('is not made before the first habit exists', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ activities: [] })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // The first day is for the habit, not for a question about it. Somebody who comes back
  // and logs a second day is somebody a reminder is for.
  it('is not made on the first day with a log', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ logs: [aLog('a', '2026-10-09')] })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  it('is made on the second day with a log, once something was logged and the sheet is closed', async () => {
    secondDayOnAndroid()

    render(<DailyReminder />)

    expect(await theOffer()).toBeInTheDocument()
  })

  // A day only counts when something on it is ticked. A day that was ticked and then
  // unticked keeps a record with completed: false, and that is not a day with a log.
  it('does not count a day whose only record was unticked', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({
      logs: [aLog('a', '2026-10-08'), { ...aLog('a', '2026-10-09'), completed: false }],
    })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // Not on opening the app: it comes after somebody has logged in this session, which is
  // the moment the question is about.
  it('is not made in a session where nothing was logged yet', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ _loggedThisSession: false })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // Not on top of the day sheet, where the tick happens: it waits for the sheet to close.
  it('waits for the day sheet to close', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ selectedDate: '2026-10-09' })
    render(<DailyReminder />)
    await settle()
    noOffer()

    act(() => useCalendarStore.setState({ selectedDate: null }))

    expect(await theOffer()).toBeInTheDocument()
  })

  // Nine in the evening, whatever time it is asked at.
  it('offers nine in the evening', async () => {
    secondDayOnAndroid()
    vi.setSystemTime(new Date(2026, 9, 9, 14, 37))

    render(<DailyReminder />)

    expect(await theOffer()).toBeInTheDocument()
    expect(screen.getByText(/9:00 PM/)).toBeInTheDocument()
  })

  // Somebody who went into Settings and picked a time before this was ever put has
  // answered the question already, and must not be offered ours over their choice.
  it('offers the time the person picked, when they picked one', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ reminderHour: 7, reminderMinute: 0, reminderTimeChosen: true })

    render(<DailyReminder />)

    expect(await theOffer()).toBeInTheDocument()
    expect(screen.getByText(/7:00 AM/)).toBeInTheDocument()
  })

  it('is not made twice', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ reminderOffered: true })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })

  // The session belongs to whoever asked first, and this one waits for the next.
  it('stands down in a session the check-in already took', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ _offerThisSession: 'checkin' })

    render(<DailyReminder />)

    await settle()
    noOffer()
  })
})

describe('answering the offer', () => {
  // Yes means yes to the time on the dialog.
  it('turns the reminder on at nine in the evening', async () => {
    secondDayOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'on' })
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    expect(enableReminder).toHaveBeenCalledWith(21, 0)
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
    expect(useCalendarStore.getState().reminderHour).toBe(21)
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
  })

  it('turns it on at the time the person picked, when they picked one', async () => {
    secondDayOnAndroid()
    useCalendarStore.setState({ reminderHour: 7, reminderMinute: 0, reminderTimeChosen: true })
    enableReminder.mockResolvedValue({ outcome: 'on' })
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    expect(enableReminder).toHaveBeenCalledWith(7, 0)
  })

  // "Not now" is an answer, not a postponement: it is recorded so the question does not
  // come back.
  it('records a no without scheduling anything', async () => {
    secondDayOnAndroid()
    render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByText('Not now'))

    expect(enableReminder).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
  })

  // Tapping outside, or Escape (the phone's back), is not an answer. It closes the
  // question for this session and leaves it to be asked again in another one. It used to
  // spend it for good: closing and declining were the same door.
  it('is not spent by tapping outside, and comes back in another session', async () => {
    secondDayOnAndroid()
    const { unmount } = render(<DailyReminder />)
    await theOffer()

    await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'))

    await waitFor(noOffer)
    expect(useCalendarStore.getState().reminderOffered).toBe(false)
    expect(enableReminder).not.toHaveBeenCalled()

    // Still closed for the rest of this session, however the store moves.
    act(() => useCalendarStore.setState({ selectedDate: '2026-10-09' }))
    act(() => useCalendarStore.setState({ selectedDate: null }))
    await settle()
    noOffer()

    // A new session: the app opened again, a day logged again.
    unmount()
    useCalendarStore.setState({ _offerThisSession: null, _loggedThisSession: true })
    render(<DailyReminder />)
    expect(await theOffer()).toBeInTheDocument()
  })

  it('is not spent by Escape either', async () => {
    secondDayOnAndroid()
    render(<DailyReminder />)
    await theOffer()

    await userEvent.keyboard('{Escape}')

    await waitFor(noOffer)
    expect(useCalendarStore.getState().reminderOffered).toBe(false)
  })

  it('leaves the reminder off when the permission is refused, and counts that as answered', async () => {
    secondDayOnAndroid()
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
    secondDayOnAndroid()
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

  // And the alarm goes with the switch. Left on the queue it would survive a restart, since
  // the plugin now restores it, and the day the permission came back a reminder would arrive
  // under a switch that says off.
  it('takes the alarm down when the permission has gone', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })
    refreshReminder.mockResolvedValue(false)

    render(<DailyReminder />)

    await waitFor(() => expect(disableReminder).toHaveBeenCalled())
  })

  // Null is a re-arm that something newer overtook on its way: the switch turned on, or
  // the last habit gone. That call has decided, and acting on the late answer would cancel
  // a reminder somebody had just turned on.
  it('leaves the switch and the alarm alone when the re-arm was overtaken', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })
    refreshReminder.mockResolvedValue(null)

    render(<DailyReminder />)

    await waitFor(() => expect(refreshReminder).toHaveBeenCalled())
    await settle()
    expect(disableReminder).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderEnabled).toBe(true)
  })

  it('leaves the alarm alone while the permission is still there', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })

    render(<DailyReminder />)

    await waitFor(() => expect(refreshReminder).toHaveBeenCalled())
    await settle()
    expect(disableReminder).not.toHaveBeenCalled()
  })
})
