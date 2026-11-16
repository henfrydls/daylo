import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyReminder } from './DailyReminder'
import { useCalendarStore } from '../../store'
import { useOpenDialogs } from '../../hooks'
import { Modal } from '../ui'
import type { Activity, ActivityLog } from '../../types'
import { formatDate } from '../../lib/dates'

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
 * The moment the offer is for: the Android app, a habit, and in this session something was
 * just ticked and nothing else is open.
 */
function tickedOnAndroid() {
  firstHabitOnAndroid()
  useCalendarStore.setState({
    logs: [aLog('a', '2026-10-09')],
    reminderLastTickDay: '2026-10-09',
    reminderOfferDismissals: 0,
    reminderOfferDismissedOn: null,
    _tickedThisSession: true,
    _reminderOfferClosed: false,
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
    reminderLastTickDay: null,
    reminderOfferDismissals: 0,
    reminderOfferDismissedOn: null,
    _tickedThisSession: false,
    _reminderOfferClosed: false,
    _offerThisSession: null,
    selectedDate: null,
  })
  useOpenDialogs.setState({ open: 0 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the one-time offer', () => {
  it('is not made where reminders do not exist', async () => {
    tickedOnAndroid()
    remindersAvailable.mockResolvedValue(false)

    render(<DailyReminder canAsk />)

    await settle()
    noOffer()
  })

  // Asking before there is a habit to be reminded about is asking about nothing.
  it('is not made before the first habit exists', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ activities: [] })

    render(<DailyReminder canAsk />)

    await settle()
    noOffer()
  })

  // As in 1.5.5: the first habit is enough, ticked on the day it is made, once the day
  // sheet it was made in has closed (canAsk). Nothing waits for another day. Done through
  // the store's own actions, the way the first day's sheet does it, so that no count the
  // test seeds can stand in for the gesture.
  it('is made on the first day, once the first habit is ticked and nothing is open', async () => {
    remindersAvailable.mockResolvedValue(true)
    const { rerender } = render(<DailyReminder canAsk={false} />)
    await settle()

    act(() => {
      useCalendarStore.getState().addActivity('Read')
      const [first] = useCalendarStore.getState().activities
      useCalendarStore.getState().toggleLog(first.id, formatDate(new Date()))
    })
    await settle()
    noOffer()

    rerender(<DailyReminder canAsk />)

    expect(await theOffer()).toBeInTheDocument()
  })

  it('is made once something was ticked in this session and nothing is open', async () => {
    tickedOnAndroid()

    render(<DailyReminder canAsk />)

    expect(await theOffer()).toBeInTheDocument()
  })

  // Not on opening the app: it comes after somebody has ticked in this session, which is
  // the moment the question is about.
  it('is not made in a session where nothing was ticked yet', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ _tickedThisSession: false })

    render(<DailyReminder canAsk />)

    await settle()
    noOffer()
  })

  // The gesture, end to end: a tick in the session is what lets it open.
  it('opens after a tick in this session', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ _tickedThisSession: false })
    render(<DailyReminder canAsk />)
    await settle()
    noOffer()

    act(() => useCalendarStore.getState().toggleLog('a', '2026-10-10'))

    expect(await theOffer()).toBeInTheDocument()
  })

  // Unticking is not logging: it does not open the offer.
  it('does not open after an untick', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ _tickedThisSession: false })
    render(<DailyReminder canAsk />)
    await settle()

    act(() => useCalendarStore.getState().toggleLog('a', '2026-10-09'))

    await settle()
    expect(
      useCalendarStore.getState().logs.some((l) => l.date === '2026-10-09' && l.completed)
    ).toBe(false)
    noOffer()
  })

  // Not on top of anything: the day sheet, Settings, the activities sheet, Export, Import.
  // App says which with canAsk; it waits for all of them to close.
  it('waits while something else is open', async () => {
    tickedOnAndroid()
    const { rerender } = render(<DailyReminder canAsk={false} />)
    await settle()
    noOffer()

    rerender(<DailyReminder canAsk />)

    expect(await theOffer()).toBeInTheDocument()
  })

  // Any other dialog, wherever it lives: the activity form or a delete confirmation in
  // the sidebar's ActivityList are not in App's canAsk. Counted by the dialogs themselves.
  it('waits while another dialog is open anywhere', async () => {
    tickedOnAndroid()
    const { rerender } = render(
      <>
        <Modal isOpen onClose={() => {}} title="New activity">
          form
        </Modal>
        <DailyReminder canAsk />
      </>
    )
    await settle()
    noOffer()

    rerender(
      <>
        <Modal isOpen={false} onClose={() => {}} title="New activity">
          form
        </Modal>
        <DailyReminder canAsk />
      </>
    )

    expect(await theOffer()).toBeInTheDocument()
  })

  // Once open it stays until answered or closed: canAsk turning false under it does not
  // take it away, which would also bring it back later in the same session.
  it('stays open when canAsk changes under it', async () => {
    tickedOnAndroid()
    const { rerender } = render(<DailyReminder canAsk />)
    await theOffer()

    rerender(<DailyReminder canAsk={false} />)
    await settle()

    expect(screen.getByText('Remind me each evening?')).toBeInTheDocument()
    expect(useCalendarStore.getState().reminderOfferDismissals).toBe(0)
  })

  // Nine in the evening, whatever time it is asked at.
  it('offers nine in the evening', async () => {
    tickedOnAndroid()
    vi.setSystemTime(new Date(2026, 9, 9, 14, 37))

    render(<DailyReminder canAsk />)

    expect(await theOffer()).toBeInTheDocument()
    expect(screen.getByText(/9:00 PM/)).toBeInTheDocument()
  })

  // Somebody who went into Settings and picked a time before this was ever put has
  // answered the question already, and must not be offered ours over their choice.
  it('offers the time the person picked, when they picked one', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ reminderHour: 7, reminderMinute: 0, reminderTimeChosen: true })

    render(<DailyReminder canAsk />)

    expect(await theOffer()).toBeInTheDocument()
    expect(screen.getByText(/7:00 AM/)).toBeInTheDocument()
  })

  it('is not made twice', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ reminderOffered: true })

    render(<DailyReminder canAsk />)

    await settle()
    noOffer()
  })
})

describe('answering the offer', () => {
  // Yes means yes to the time on the dialog.
  it('turns the reminder on at nine in the evening', async () => {
    tickedOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'on' })
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    expect(enableReminder).toHaveBeenCalledWith(21, 0)
    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(true))
    expect(useCalendarStore.getState().reminderHour).toBe(21)
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
  })

  it('turns it on at the time the person picked, when they picked one', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({ reminderHour: 7, reminderMinute: 0, reminderTimeChosen: true })
    enableReminder.mockResolvedValue({ outcome: 'on' })
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    expect(enableReminder).toHaveBeenCalledWith(7, 0)
  })

  // "Not now" is an answer, not a postponement: it is recorded so the question does not
  // come back.
  it('records a no without scheduling anything', async () => {
    tickedOnAndroid()
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Not now'))

    expect(enableReminder).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
  })

  // Tapping outside, or Escape (the phone's back), is not an answer. It puts the question
  // off to a later day with a tick, never the same day, and the third time counts as no.
  it('is not spent by tapping outside, and waits for a tick on a later day', async () => {
    tickedOnAndroid()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 9, 20, 0))
    const { unmount } = render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'))

    await waitFor(noOffer)
    const state = useCalendarStore.getState()
    expect(state.reminderOffered).toBe(false)
    expect(state.reminderOfferDismissals).toBe(1)
    expect(state.reminderOfferDismissedOn).toBe('2026-10-09')
    expect(enableReminder).not.toHaveBeenCalled()

    // The same day, in a new session with a new tick: still not.
    unmount()
    useCalendarStore.setState({ _offerThisSession: null, _reminderOfferClosed: false })
    const second = render(<DailyReminder canAsk />)
    act(() => useCalendarStore.getState().toggleLog('a', '2026-10-07'))
    await settle()
    noOffer()

    // The next day, a tick: it comes back.
    second.unmount()
    vi.setSystemTime(new Date(2026, 9, 10, 20, 0))
    useCalendarStore.setState({ _offerThisSession: null, _tickedThisSession: false })
    render(<DailyReminder canAsk />)
    await settle()
    noOffer()
    act(() => useCalendarStore.getState().toggleLog('a', '2026-10-10'))
    expect(await theOffer()).toBeInTheDocument()
  })

  it('is not spent by Escape either', async () => {
    tickedOnAndroid()
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.keyboard('{Escape}')

    await waitFor(noOffer)
    expect(useCalendarStore.getState().reminderOffered).toBe(false)
    expect(useCalendarStore.getState().reminderOfferDismissals).toBe(1)
  })

  // Three closes without an answer is an answer.
  it('counts the third close without an answer as no', async () => {
    tickedOnAndroid()
    useCalendarStore.setState({
      reminderOfferDismissals: 2,
      reminderOfferDismissedOn: '2026-10-08',
    })
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.keyboard('{Escape}')

    await waitFor(noOffer)
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
  })

  // An answer is not a close without one: "Not now" does not count towards the three.
  it('does not count an answer as a dismissal', async () => {
    tickedOnAndroid()
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Not now'))

    await waitFor(noOffer)
    expect(useCalendarStore.getState().reminderOfferDismissals).toBe(0)
  })

  it('leaves the reminder off when the permission is refused, and counts that as answered', async () => {
    tickedOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'permission-denied' })
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
  })

  // A call that threw is not an answer from the phone: say it did not work, and keep the
  // offer owed for another time.
  it('keeps the offer owed when turning it on throws, and says so', async () => {
    tickedOnAndroid()
    enableReminder.mockRejectedValue(new Error('bridge gone'))
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0]).toMatch(/could not set the reminder/i)
    expect(useCalendarStore.getState().reminderOffered).toBe(false)
    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    // An attempted answer is not a dismissal either.
    expect(useCalendarStore.getState().reminderOfferDismissals).toBe(0)
  })

  // The dialog stays in the page while it leaves, and its backdrop still takes taps.
  it('counts a double tap beside it as one close', async () => {
    tickedOnAndroid()
    render(<DailyReminder canAsk />)
    await theOffer()

    const backdrop = screen.getByTestId('confirm-dialog-backdrop')
    await userEvent.dblClick(backdrop)

    expect(useCalendarStore.getState().reminderOfferDismissals).toBe(1)
  })

  it('does not count a tap beside it after "Not now" as a close', async () => {
    tickedOnAndroid()
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Not now'))
    await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'))

    expect(useCalendarStore.getState().reminderOfferDismissals).toBe(0)
  })

  // On Android the process lives for days: closed today, it is asked again after a tick
  // on a later day without the app being restarted.
  it('comes back on a later day in the same session', async () => {
    tickedOnAndroid()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 9, 20, 0))
    render(<DailyReminder canAsk />)
    await theOffer()
    await userEvent.click(screen.getByTestId('confirm-dialog-backdrop'))
    await waitFor(noOffer)

    vi.setSystemTime(new Date(2026, 9, 10, 9, 0))
    act(() => useCalendarStore.getState().startNewDay('2026-10-10'))
    act(() => useCalendarStore.getState().toggleLog('a', '2026-10-10'))

    expect(await theOffer()).toBeInTheDocument()
  })

  it('says so, and keeps it owed, when the phone says reminders are not there', async () => {
    tickedOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'unavailable' })
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(showToast.mock.calls[0][0]).toMatch(/could not set the reminder/i)
    expect(useCalendarStore.getState().reminderOffered).toBe(false)
  })

  it('counts a refused schedule as answered', async () => {
    tickedOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'no' })
    render(<DailyReminder canAsk />)
    await theOffer()

    await userEvent.click(screen.getByText('Turn on'))

    await waitFor(() => expect(showToast).toHaveBeenCalled())
    expect(useCalendarStore.getState().reminderOffered).toBe(true)
  })
})

describe('when the activities go', () => {
  it('takes the reminder down with the last one', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderOffered: true, reminderEnabled: true })
    render(<DailyReminder canAsk />)
    await settle()

    act(() => useCalendarStore.setState({ activities: [] }))

    await waitFor(() => expect(reconcileReminder).toHaveBeenCalledWith(0))
  })
})

describe('opening the app', () => {
  it('arms an enabled reminder again', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })

    render(<DailyReminder canAsk />)

    await waitFor(() => expect(refreshReminder).toHaveBeenCalledWith(21, 0))
  })

  it('arms nothing while the reminder is off', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderOffered: true })

    render(<DailyReminder canAsk />)

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

    render(<DailyReminder canAsk />)

    await settle()
    expect(refreshReminder).not.toHaveBeenCalled()
    expect(reconcileReminder).toHaveBeenCalledWith(0)
  })

  it('arms again when a habit comes back', async () => {
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({ activities: [], reminderEnabled: true, reminderOffered: true })
    render(<DailyReminder canAsk />)
    await settle()

    act(() => useCalendarStore.setState({ activities: [anActivity('a')] }))

    await waitFor(() => expect(refreshReminder).toHaveBeenCalledWith(21, 0))
  })

  // Accepting the offer and getting nothing is worse than never being offered: the switch
  // would sit there claiming a reminder the phone never took.
  it('says so when the phone refuses the schedule', async () => {
    tickedOnAndroid()
    enableReminder.mockResolvedValue({ outcome: 'failed', reason: 'the phone said no' })
    render(<DailyReminder canAsk />)
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

    render(<DailyReminder canAsk />)

    await waitFor(() => expect(useCalendarStore.getState().reminderEnabled).toBe(false))
  })

  // And the alarm goes with the switch. Left on the queue it would survive a restart, since
  // the plugin now restores it, and the day the permission came back a reminder would arrive
  // under a switch that says off.
  it('takes the alarm down when the permission has gone', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })
    refreshReminder.mockResolvedValue(false)

    render(<DailyReminder canAsk />)

    await waitFor(() => expect(disableReminder).toHaveBeenCalled())
  })

  // Null is a re-arm that something newer overtook on its way: the switch turned on, or
  // the last habit gone. That call has decided, and acting on the late answer would cancel
  // a reminder somebody had just turned on.
  it('leaves the switch and the alarm alone when the re-arm was overtaken', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })
    refreshReminder.mockResolvedValue(null)

    render(<DailyReminder canAsk />)

    await waitFor(() => expect(refreshReminder).toHaveBeenCalled())
    await settle()
    expect(disableReminder).not.toHaveBeenCalled()
    expect(useCalendarStore.getState().reminderEnabled).toBe(true)
  })

  it('leaves the alarm alone while the permission is still there', async () => {
    firstHabitOnAndroid()
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })

    render(<DailyReminder canAsk />)

    await waitFor(() => expect(refreshReminder).toHaveBeenCalled())
    await settle()
    expect(disableReminder).not.toHaveBeenCalled()
  })
})

/**
 * Logging today moves the reminder to tomorrow, and taking the last tick off brings it back
 * to today (#192). The component only says when; what the next ring is, is decided where
 * the reminder is armed (reminderStartsAfter in lib/reminders.ts), from the logs as they are.
 */
describe('logging today', () => {
  const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  async function onWithAHabit(enabled = true) {
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({
      activities: [anActivity('a'), anActivity('b')],
      reminderEnabled: enabled,
      reminderHour: 21,
      reminderMinute: 30,
      reminderOffered: true,
    })
    render(<DailyReminder canAsk={false} />)
    await settle()
  }

  const tick = async (activityId: string, date: string) => {
    act(() => useCalendarStore.getState().toggleLog(activityId, date))
    await settle()
  }

  it('arms the reminder again when today gets its first tick', async () => {
    await onWithAHabit()
    expect(refreshReminder).toHaveBeenCalledTimes(1)

    await tick('a', today())

    expect(refreshReminder).toHaveBeenCalledTimes(2)
    expect(refreshReminder).toHaveBeenLastCalledWith(21, 30)
  })

  it('arms it again when the last tick of today is taken off', async () => {
    await onWithAHabit()
    await tick('a', today())
    await tick('a', today())

    expect(refreshReminder).toHaveBeenCalledTimes(3)
  })

  // The day was already logged, and still is: the reminder is already on tomorrow.
  it('leaves it alone for a second tick today, and for taking one of two off', async () => {
    await onWithAHabit()
    await tick('a', today())
    await tick('b', today())
    await tick('b', today())

    expect(refreshReminder).toHaveBeenCalledTimes(2)
  })

  it('leaves it alone for a tick on another day', async () => {
    await onWithAHabit()
    await tick('a', '2026-01-05')

    expect(refreshReminder).toHaveBeenCalledTimes(1)
  })

  it('does nothing while the reminder is off', async () => {
    await onWithAHabit(false)
    await tick('a', today())

    expect(refreshReminder).not.toHaveBeenCalled()
  })

  // The same rule as at launch: a re-arm that finds the permission gone turns the switch off
  // and takes down what is left on the phone.
  it('turns the switch off when the re-arm finds it can no longer be armed', async () => {
    await onWithAHabit()
    refreshReminder.mockResolvedValue(false)

    await tick('a', today())

    expect(useCalendarStore.getState().reminderEnabled).toBe(false)
    expect(disableReminder).toHaveBeenCalled()
  })
})
