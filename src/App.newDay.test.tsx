import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitForElementToBeRemoved, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useCalendarStore, STORAGE_KEY } from './store'
import { formatDate } from './lib/dates'

/**
 * A new day, with the app left open.
 *
 * Somebody ticks their habit in the evening and does not close Daylo. The next morning the
 * window comes back and, before this, yesterday was still drawn as today: "Today 1/1", and
 * "Today" opening yesterday's sheet already ticked. These mount the whole app, move the
 * clock, and say the window came back, which is what happens on a desktop or a phone.
 *
 * Only Date is faked. The timers stay real, so the dialogs can come and go the way they do
 * in the app; the midnight timer itself is tested in lib/today.test.ts and in e2e.
 */

const inTheApp = vi.hoisted(() => ({ yes: false }))
const checkinFields = vi.hoisted(() => vi.fn())
const sendCheckinIfDue = vi.hoisted(() => vi.fn())
const startCheckinOnNewInstall = vi.hoisted(() => vi.fn())
const remindersAvailable = vi.hoisted(() => vi.fn())
const refreshReminder = vi.hoisted(() => vi.fn())
const reconcileReminder = vi.hoisted(() => vi.fn())
const installFormat = vi.hoisted(() => vi.fn())
const checkForUpdate = vi.hoisted(() => vi.fn())
// The one native call the check-in makes, for the tests that let the real sendCheckinIfDue
// run. Everything else is refused, the way a call outside the native app is.
const tauriInvoke = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  isTauri: () => inTheApp.yes,
  invoke: (...args: unknown[]) => tauriInvoke(...args),
}))

vi.mock('./lib/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/feedback')>()),
  sendShown: vi.fn().mockResolvedValue(true),
  sendRating: vi.fn().mockResolvedValue(true),
  sendComment: vi.fn().mockResolvedValue(true),
}))

vi.mock('./lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/checkin')>()),
  checkinFields,
  sendCheckinIfDue,
  startCheckinOnNewInstall,
}))

vi.mock('./lib/reminders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/reminders')>()),
  remindersAvailable,
  refreshReminder,
  reconcileReminder,
  enableReminder: vi.fn().mockResolvedValue({ outcome: 'on' }),
  disableReminder: vi.fn().mockResolvedValue(undefined),
  exactAlarms: vi.fn().mockResolvedValue('exact'),
}))

vi.mock('./lib/updater', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/updater')>()),
  installFormat,
  checkForUpdate,
}))

const T = '2026-11-01T00:00:00.000Z'
const READ = { id: 'a1', name: 'Read', color: '#10B981', createdAt: T, updatedAt: T }

const done = (date: string) => ({
  id: `log-${date}`,
  activityId: 'a1',
  date,
  completed: true,
  createdAt: T,
})

/** Every day of November up to the given one, ticked. */
const novemberUpTo = (day: number) =>
  Array.from({ length: day }, (_, i) => done(`2026-11-${String(i + 1).padStart(2, '0')}`))

/** The evening the app was left open on. */
function itIsTheEveningOf(year: number, month: number, day: number) {
  vi.setSystemTime(new Date(year, month, day, 21, 0))
  useCalendarStore.setState({ selectedYear: year, selectedMonth: month })
}

/**
 * The next morning, and the window coming back to say so. Focus here; the other two ways
 * back are the same call in lib/today.ts and each has its own test there.
 */
async function theNextMorningComes(year: number, month: number, day: number) {
  vi.setSystemTime(new Date(year, month, day, 8, 30))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

/** A cell of the month on screen. The one beside it, hidden from everybody, is not found. */
const cell = (date: string) => screen.getByRole('button', { name: new RegExp(`^${date},`) })

/**
 * Whether the cell carries the mark that says "this is today": filled once something is
 * logged, a dashed ring while the day is still empty (1.6, see `tone` in MonthView). The
 * ring is also what an empty yesterday wears after a run of three, which none of these
 * tests builds, so here it can only be today.
 */
const isTodayIn = (date: string) => {
  const { className } = within(cell(date)).getByText(String(Number(date.slice(8))))
  return className.includes('bg-emerald-700') || className.includes('border-dashed')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  inTheApp.yes = false
  checkinFields.mockReset().mockResolvedValue(null)
  sendCheckinIfDue.mockReset().mockResolvedValue(undefined)
  startCheckinOnNewInstall.mockReset().mockResolvedValue(undefined)
  remindersAvailable.mockReset().mockResolvedValue(false)
  refreshReminder.mockReset().mockResolvedValue(true)
  reconcileReminder.mockReset().mockResolvedValue(undefined)
  installFormat.mockReset().mockResolvedValue(null)
  checkForUpdate.mockReset().mockResolvedValue({ kind: 'none' })
  localStorage.clear()
  useCalendarStore.setState({
    _hasHydrated: true,
    activities: [READ],
    logs: [done('2026-11-13')],
    currentView: 'month',
    selectedDate: null,
    reminderEnabled: false,
    reminderOffered: true,
    firstOpenedAt: '2026-11-01',
    feedbackInviteSeen: true,
    _feedbackAsked: false,
    _loggedThisSession: false,
    _offerThisSession: null,
    checkinEnabled: false,
    checkinId: null,
    _checkinStart: 'decided',
  })
  itIsTheEveningOf(2026, 10, 13)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the morning after, with the app left open', () => {
  it('draws today on the new day, and the bar starts the day from nothing', async () => {
    render(<App />)
    await act(async () => {})
    expect(screen.getByTestId('log-today-bar')).toHaveAccessibleName(
      'Log today: 1 of 1 activity completed'
    )
    expect(isTodayIn('2026-11-13')).toBe(true)

    await theNextMorningComes(2026, 10, 14)

    expect(screen.getByTestId('log-today-bar')).toHaveAccessibleName(
      'Log today: 0 of 1 activity completed'
    )
    expect(isTodayIn('2026-11-14')).toBe(true)
    expect(isTodayIn('2026-11-13')).toBe(false)
  })

  // The run in the header lives in App, outside the key that builds the views again, so
  // nothing rebuilds it overnight: it has to be read against the day on screen. Read off
  // the clock with only the logs to watch, it went on saying "today included" the next
  // morning, about a day that had stopped being today.
  it('stops counting yesterday as today in the run in the header', async () => {
    render(<App />)
    await act(async () => {})
    for (const chip of screen.getAllByTestId('streak-chip')) {
      expect(chip).toHaveAccessibleName('1 day in a row, today included. Show your streak')
    }

    await theNextMorningComes(2026, 10, 14)

    for (const chip of screen.getAllByTestId('streak-chip')) {
      expect(chip).toHaveAccessibleName('1 day in a row, today not logged yet. Show your streak')
    }
  })

  it('closes the sheet of yesterday that was left open', async () => {
    useCalendarStore.setState({ selectedDate: '2026-11-13' })
    render(<App />)
    await act(async () => {})
    expect(screen.getByTestId('quicklog-modal')).toBeInTheDocument()

    await theNextMorningComes(2026, 10, 14)

    expect(screen.queryByTestId('quicklog-modal')).not.toBeInTheDocument()
    expect(useCalendarStore.getState().selectedDate).toBeNull()
  })

  it('goes on to the new month when the month changes overnight', async () => {
    itIsTheEveningOf(2026, 10, 30)
    render(<App />)
    await act(async () => {})
    expect(screen.getByTestId('month-title-button')).toHaveTextContent('November 2026')

    await theNextMorningComes(2026, 11, 1)

    expect(screen.getByTestId('month-title-button')).toHaveTextContent('December 2026')
    expect(isTodayIn('2026-12-01')).toBe(true)
  })

  // The reason the day is a key and not a prop. This number is worked out once in a useMemo
  // that depends on the logs and the year, not on the day: nothing about the logs changes
  // overnight, so only building the panel again can bring it up to date.
  it('works out again a number remembered for the day, with no log changed', async () => {
    useCalendarStore.setState({ logs: novemberUpTo(13) })
    render(<App />)
    await act(async () => {})
    const panel = () => screen.getAllByTestId('stats-panel')[0]
    expect(within(panel()).getByText('100%')).toBeInTheDocument()

    await theNextMorningComes(2026, 10, 14)

    // Thirteen days out of fourteen.
    expect(within(panel()).getByText('93%')).toBeInTheDocument()
  })

  it('goes back to Month, on the month of the new day, from the year view', async () => {
    useCalendarStore.setState({ currentView: 'year', selectedMonth: 3 })
    render(<App />)
    await act(async () => {})

    await theNextMorningComes(2026, 10, 14)

    expect(useCalendarStore.getState().currentView).toBe('month')
    expect(screen.getByTestId('month-title-button')).toHaveTextContent('November 2026')
    expect(isTodayIn('2026-11-14')).toBe(true)
  })

  it('does nothing when the window comes back on the same day', async () => {
    useCalendarStore.setState({ selectedDate: '2026-11-13', selectedMonth: 9 })
    render(<App />)
    await act(async () => {})

    vi.setSystemTime(new Date(2026, 10, 13, 23, 0))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(useCalendarStore.getState().selectedDate).toBe('2026-11-13')
    expect(useCalendarStore.getState().selectedMonth).toBe(9)
  })
})

/**
 * While the new day waits for somebody to finish, the whole screen goes on saying the old
 * one. The bar used to read the clock every time it was drawn, so anything that drew it
 * again after midnight put tomorrow in the bar beside a calendar still on today.
 */
describe('while the new day is waiting', () => {
  it('keeps the bar and the calendar on the same day when something is drawn again', async () => {
    useCalendarStore.setState({ selectedDate: '2026-11-13' })
    render(<App />)
    await act(async () => {})
    // Halfway through naming a new habit in the sheet of the 13th: words not yet saved.
    await userEvent.click(screen.getByTestId('quicklog-new-activity-button'))
    await userEvent.type(screen.getByTestId('quicklog-new-activity-input'), 'Walk')

    vi.setSystemTime(new Date(2026, 10, 14, 0, 0, 30))
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    // Something that draws the month again: a tick lands while the day waits.
    await act(async () => {
      useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    })

    expect(screen.getByTestId('quicklog-new-activity-input')).toHaveValue('Walk')
    expect(isTodayIn('2026-11-13')).toBe(true)
    expect(within(screen.getByTestId('log-today-bar')).getByText('13')).toBeInTheDocument()
    expect(screen.getByTestId('log-today-bar')).toHaveAccessibleName(
      'Log today: 1 of 1 activity completed'
    )
  })

  // "Edit activity" opens with the name already in it. Words that only say what the field
  // opened with are nobody's, and a form left open all night must not keep yesterday.
  it('comes in past an Edit form left open with the name untouched', async () => {
    render(<App />)
    await act(async () => {})
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit Read' })[0])
    expect(screen.getByTestId('activity-name-input')).toHaveValue('Read')

    await theNextMorningComes(2026, 10, 14)

    expect(isTodayIn('2026-11-14')).toBe(true)
  })

  // Cancelled on one activity and opened on another before the dialog had gone: the name
  // field stays the same field, and what it held the first time is not the baseline any
  // more. Run is what the form opened with, and nobody wrote it.
  it('comes in past an Edit form cancelled and opened again on another activity', async () => {
    useCalendarStore.setState({ activities: [READ, { ...READ, id: 'a2', name: 'Run' }] })
    render(<App />)
    await act(async () => {})
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit Read' })[0])
    await userEvent.click(screen.getByTestId('activity-name-input'))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit Run' })[0])
    await userEvent.click(screen.getByTestId('activity-name-input'))
    expect(screen.getByTestId('activity-name-input')).toHaveValue('Run')

    await theNextMorningComes(2026, 10, 14)

    expect(isTodayIn('2026-11-14')).toBe(true)
  })

  it('waits for an Edit form whose name was changed and not saved', async () => {
    render(<App />)
    await act(async () => {})
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit Read' })[0])
    await userEvent.clear(screen.getByTestId('activity-name-input'))
    await userEvent.type(screen.getByTestId('activity-name-input'), 'Read a chapter')

    await theNextMorningComes(2026, 10, 14)

    expect(screen.getByTestId('activity-name-input')).toHaveValue('Read a chapter')
    expect(isTodayIn('2026-11-13')).toBe(true)
  })

  // The rating question belongs to App, which the new day does not build again: what is
  // written under it stays put, so there is nothing for the day to wait for.
  it('comes in past words under the rating question, and leaves them there', async () => {
    inTheApp.yes = true
    checkinFields.mockResolvedValue({ version: '1.5.3', os: 'linux', source: 'deb' })
    useCalendarStore.setState({
      logs: ['2026-11-06', '2026-11-09', '2026-11-13'].map(done),
      firstOpenedAt: '2026-11-06',
      feedbackInviteSeen: false,
      _loggedThisSession: true,
    })
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')
    await userEvent.click(screen.getByRole('button', { name: '4 stars' }))
    await userEvent.type(screen.getByLabelText('Anything to add? Optional'), 'Love it')

    await theNextMorningComes(2026, 10, 14)

    expect(isTodayIn('2026-11-14')).toBe(true)
    expect(screen.getByLabelText('Anything to add? Optional')).toHaveValue('Love it')
  })
})

/**
 * What runs when the app opens, and what the new day must not do to it.
 *
 * App is not started again, only what draws the day, so each of these should go on as if
 * nothing happened. One test per line of the list agreed in the review.
 */
describe('what the new day leaves alone', () => {
  it("sends the new day's check-in once, and does not start the check-in again", async () => {
    inTheApp.yes = true
    checkinFields.mockResolvedValue({ version: '1.5.3', os: 'linux', source: 'deb' })
    useCalendarStore.setState({ _checkinStart: 'new' })
    const daysSent: string[] = []
    sendCheckinIfDue.mockImplementation(async () => {
      daysSent.push(formatDate(new Date()))
    })
    render(<App />)
    await act(async () => {})
    expect(startCheckinOnNewInstall).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(2026, 10, 14, 8, 30))
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {})

    expect(startCheckinOnNewInstall).toHaveBeenCalledTimes(1)
    expect(daysSent).toEqual(['2026-11-14'])
  })

  /**
   * The check-in says "Daylo was opened on this date", so it goes only when somebody has
   * Daylo in front of them: on opening, and when the window comes back or takes the focus.
   * The real sendCheckinIfDue runs here, so "once a day" is the real rule and what is
   * counted is what would leave the device.
   */
  describe('the check-in, and somebody having Daylo in front of them', () => {
    const sent = () =>
      tauriInvoke.mock.calls
        .filter(([command]) => command === 'send_checkin')
        .map(([, args]) => (args as { date: string }).date)

    const show = (state: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
      document.dispatchEvent(new Event('visibilitychange'))
    }

    beforeEach(async () => {
      const real = await vi.importActual<typeof import('./lib/checkin')>('./lib/checkin')
      inTheApp.yes = true
      checkinFields.mockResolvedValue({ version: '1.5.3', os: 'linux', source: 'deb' })
      sendCheckinIfDue.mockImplementation(real.sendCheckinIfDue)
      tauriInvoke.mockReset().mockImplementation(async (command: string) => {
        if (command !== 'send_checkin') throw new Error('not here')
      })
      useCalendarStore.setState({
        checkinEnabled: true,
        checkinId: '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e',
        checkinLastAttempt: { date: '2026-11-12', at: '2026-11-12T20:00:00.000Z', ok: true },
      })
    })

    afterEach(() => {
      show('visible')
    })

    it('goes once on opening, not twice', async () => {
      render(<App />)
      await act(async () => {})
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      await act(async () => {})

      expect(sent()).toEqual(['2026-11-13'])
    })

    it('goes when the window takes the focus on a new day', async () => {
      render(<App />)
      await act(async () => {})

      await theNextMorningComes(2026, 10, 14)
      await act(async () => {})

      expect(sent()).toEqual(['2026-11-13', '2026-11-14'])
    })

    // A desktop copy minimised all night. The day on screen changes by timer, which is
    // right, and the check-in does not, because nobody opened anything.
    it('does not go at midnight with the window hidden, only when it comes back', async () => {
      vi.useRealTimers()
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date(2026, 10, 13, 23, 50))
      // Hidden is enough, whatever the page says about the focus.
      vi.spyOn(document, 'hasFocus').mockReturnValue(true)
      render(<App />)
      await act(async () => {})
      await act(async () => {})
      await act(async () => show('hidden'))

      // Past midnight, and five readings of the clock after it.
      await act(async () => {
        vi.advanceTimersByTime(13 * 60 * 1000)
      })
      expect(isTodayIn('2026-11-14')).toBe(true)
      expect(sent()).toEqual(['2026-11-13'])

      await act(async () => show('visible'))
      await act(async () => {})
      expect(sent()).toEqual(['2026-11-13', '2026-11-14'])

      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      await act(async () => {})
      expect(sent()).toEqual(['2026-11-13', '2026-11-14'])
    })

    // Somebody at the desk through midnight, with Daylo in front and the focus in it. No
    // return comes, because nothing went away, and the new day is still a day it was
    // opened on. The window having the focus is what tells a person from a timer.
    it.each([
      [
        'goes at midnight with the window in front and in focus',
        true,
        ['2026-11-13', '2026-11-14'],
      ],
      [
        'does not go at midnight with the window in sight but without the focus',
        false,
        ['2026-11-13'],
      ],
    ])('%s', async (_, focused, days) => {
      vi.useRealTimers()
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date(2026, 10, 13, 23, 50))
      vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
      render(<App />)
      await act(async () => {})
      await act(async () => {})

      await act(async () => {
        vi.advanceTimersByTime(13 * 60 * 1000)
      })
      await act(async () => {})

      expect(isTodayIn('2026-11-14')).toBe(true)
      expect(sent()).toEqual(days)
    })

    // The day on screen can be held back by words being written. Daylo was still opened
    // on the new day, and the check-in says so with the clock's date.
    it('goes for the new day even while the screen waits on words being written', async () => {
      useCalendarStore.setState({ selectedDate: '2026-11-13' })
      render(<App />)
      await act(async () => {})
      await userEvent.click(screen.getByTestId('quicklog-new-activity-button'))
      await userEvent.type(screen.getByTestId('quicklog-new-activity-input'), 'Walk')
      await act(async () => show('hidden'))

      vi.setSystemTime(new Date(2026, 10, 14, 8, 30))
      await act(async () => show('visible'))
      await act(async () => {})

      expect(isTodayIn('2026-11-13')).toBe(true)
      expect(sent()).toEqual(['2026-11-13', '2026-11-14'])
    })

    /** The opening send held in the air until `land()` is called. */
    function holdTheOpeningSend() {
      let land = () => {}
      tauriInvoke.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            land = () => resolve()
          })
      )
      return () => land()
    }

    // Opened just before midnight on a slow network, and the window taken again just
    // after it while the first send is still in the air. That return is a new day Daylo
    // was opened on: it waits for the first send to finish, and then goes.
    it('sends the new day once the send still in the air lands', async () => {
      vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 50))
      const land = holdTheOpeningSend()
      render(<App />)
      await act(async () => {})
      expect(sent()).toEqual(['2026-11-13'])

      vi.setSystemTime(new Date(2026, 10, 14, 0, 0, 20))
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
      })
      expect(sent()).toEqual(['2026-11-13'])

      await act(async () => land())
      await act(async () => {})

      expect(sent()).toEqual(['2026-11-13', '2026-11-14'])
    })

    // The same return on the same day has nothing to add: the send in the air is that
    // day's, and once a day is the rule whatever came back.
    it('sends nothing more when the send in the air was for the same day', async () => {
      const land = holdTheOpeningSend()
      render(<App />)
      await act(async () => {})
      await act(async () => {
        window.dispatchEvent(new Event('focus'))
        show('visible')
      })

      await act(async () => land())
      await act(async () => {})

      expect(sent()).toEqual(['2026-11-13'])
    })
  })

  it('does not ask for a newer version because the day changed', async () => {
    inTheApp.yes = true
    installFormat.mockResolvedValue('appimage')
    render(<App />)
    await act(async () => {})
    await act(async () => {})
    const before = checkForUpdate.mock.calls.length
    expect(before).toBe(1)

    await theNextMorningComes(2026, 10, 14)
    await act(async () => {})

    expect(checkForUpdate).toHaveBeenCalledTimes(before)
  })

  it('does not bring back a question that was closed yesterday', async () => {
    inTheApp.yes = true
    checkinFields.mockResolvedValue({ version: '1.5.3', os: 'linux', source: 'deb' })
    // Past the gate: a week here, three days of use, and something ticked this session.
    useCalendarStore.setState({
      logs: ['2026-11-06', '2026-11-09', '2026-11-13'].map(done),
      firstOpenedAt: '2026-11-06',
      feedbackInviteSeen: false,
      _loggedThisSession: true,
    })
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')
    await userEvent.click(screen.getByLabelText('Close modal'))
    await waitForElementToBeRemoved(() => screen.queryByTestId('feedback-rating'))

    await theNextMorningComes(2026, 10, 14)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })

    expect(screen.queryByTestId('feedback-rating')).not.toBeInTheDocument()
  })

  it('neither sets the reminder again nor offers it again', async () => {
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({ reminderEnabled: true, reminderOffered: true })
    render(<App />)
    await act(async () => {})
    await act(async () => {})
    const set = refreshReminder.mock.calls.length + reconcileReminder.mock.calls.length
    expect(set).toBe(1)

    await theNextMorningComes(2026, 10, 14)
    await act(async () => {})

    expect(refreshReminder.mock.calls.length + reconcileReminder.mock.calls.length).toBe(set)
    expect(screen.queryByText('Remind me each evening?')).not.toBeInTheDocument()
  })

  it('keeps the first day the first day', async () => {
    useCalendarStore.setState({ firstOpenedAt: null })
    render(<App />)
    await act(async () => {})
    expect(useCalendarStore.getState().firstOpenedAt).toBe('2026-11-13')

    await theNextMorningComes(2026, 10, 14)

    expect(useCalendarStore.getState().firstOpenedAt).toBe('2026-11-13')
  })

  it('does not read the store from disk again, nor lose a tick still being written', async () => {
    const rehydrate = vi.spyOn(useCalendarStore.persist, 'rehydrate')
    render(<App />)
    await act(async () => {})

    // Ticked a moment before the window went away, and not yet on the disk.
    await act(async () => {
      useCalendarStore.getState().toggleLog('a1', '2026-11-12')
    })
    await theNextMorningComes(2026, 10, 14)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(rehydrate).not.toHaveBeenCalled()
    const onDisk = JSON.parse(localStorage.getItem('simple-calendar-storage') ?? '{}')
    expect(onDisk.state.logs.map((l: { date: string }) => l.date)).toContain('2026-11-12')
  })

  it('does not show the loading screen again', async () => {
    render(<App />)
    await act(async () => {})

    await theNextMorningComes(2026, 10, 14)

    expect(screen.queryByTestId('app-skeleton')).not.toBeInTheDocument()
  })

  it('keeps Settings open, which belongs to the app and not to the day', async () => {
    render(<App />)
    await act(async () => {})
    await userEvent.click(screen.getAllByTestId('settings-button')[0])
    await screen.findByTestId('settings')

    await theNextMorningComes(2026, 10, 14)

    expect(screen.getByTestId('settings')).toBeInTheDocument()
  })
})

/**
 * R-09b, and Henfry's worry about it: a row in the Today bar that moves the screen down
 * and never goes away. It goes by itself in both of the ways it can: once yesterday is
 * logged, in the same session, and once the next day comes in with the app left open. On
 * a morning with nothing to rescue it is never there.
 *
 * The run is the 9th, 10th and 11th of November; the 12th, a Thursday, is empty.
 */
describe('a yesterday that is still open', () => {
  const row = () => screen.queryByTestId('log-yesterday-row')
  const theRun = [done('2026-11-09'), done('2026-11-10'), done('2026-11-11')]
  const ringIsOn = (date: string) =>
    within(cell(date))
      .getByText(String(Number(date.slice(8))))
      .className.includes('border-gray-500')

  it('goes when yesterday is logged, through the row and its sheet, with nothing reloaded', async () => {
    const user = userEvent.setup()
    useCalendarStore.setState({ logs: theRun })
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0))
    render(<App />)
    await act(async () => {})
    expect(row()).toHaveTextContent('Log it to make 4 days in a row')
    expect(ringIsOn('2026-11-12')).toBe(true)

    await user.click(row()!)
    const sheet = screen.getByTestId('quicklog-modal')
    expect(within(sheet).getByTestId('yesterday-line')).toHaveTextContent(
      'Yesterday is still open. Log any activity to make 4 days in a row.'
    )
    await user.click(within(sheet).getByTestId('quicklog-activity-checkbox'))
    expect(within(sheet).getByTestId('yesterday-line')).toHaveTextContent('4 days in a row')
    await user.click(within(sheet).getByTestId('quicklog-done-button'))
    await waitForElementToBeRemoved(() => screen.queryByTestId('quicklog-modal'))

    expect(row()).not.toBeInTheDocument()
    expect(ringIsOn('2026-11-12')).toBe(false)
    expect(screen.queryByText(/still open/)).not.toBeInTheDocument()
    // What the row promised is what the header says.
    for (const chip of screen.getAllByTestId('streak-chip')) {
      expect(chip).toHaveAccessibleName(/^4 days in a row/)
    }
  })

  it('goes when the next day comes in with the app left open', async () => {
    useCalendarStore.setState({ logs: theRun })
    vi.setSystemTime(new Date(2026, 10, 13, 21, 0))
    render(<App />)
    await act(async () => {})
    expect(row()).toBeInTheDocument()

    await theNextMorningComes(2026, 10, 14)

    expect(isTodayIn('2026-11-14')).toBe(true)
    expect(row()).not.toBeInTheDocument()
    expect(ringIsOn('2026-11-12')).toBe(false)
    expect(screen.getByLabelText(/^2026-11-12,/)).toHaveAccessibleName(
      '2026-11-12, 0 activities completed'
    )
  })

  // The other half of the same clock: it comes in with the new day too. Thursday evening
  // yesterday was logged and there is nothing to say; Friday morning the Thursday is empty.
  it('comes when the new day leaves yesterday open', async () => {
    useCalendarStore.setState({ logs: theRun })
    vi.setSystemTime(new Date(2026, 10, 12, 21, 0))
    render(<App />)
    await act(async () => {})
    expect(row()).not.toBeInTheDocument()

    await theNextMorningComes(2026, 10, 13)

    expect(row()).toHaveTextContent('Log it to make 4 days in a row')
  })

  it.each([
    ['a run of two', [done('2026-11-10'), done('2026-11-11')]],
    ['two empty days', [done('2026-11-08'), done('2026-11-09'), done('2026-11-10')]],
  ])('is never there after %s', async (_, logs) => {
    useCalendarStore.setState({ logs })
    vi.setSystemTime(new Date(2026, 10, 13, 9, 0))
    render(<App />)
    await act(async () => {})

    expect(screen.getByTestId('log-today-bar')).toBeInTheDocument()
    expect(row()).not.toBeInTheDocument()
    expect(screen.queryByText(/still open/)).not.toBeInTheDocument()
    expect(ringIsOn('2026-11-12')).toBe(false)
  })
})

/**
 * The other way a day arrives: Daylo closed last night and opened this morning. Saved last
 * night on the year view with the sheet of last night open, it opens on today, on Month,
 * with no sheet: the same place the app goes to when the day changes with it open. The real
 * clock, because the store's first state is made from it when the module loads.
 */
describe('opening the app the morning after', () => {
  it('opens on today, on Month, with no sheet, whatever was left open last night', async () => {
    vi.useRealTimers()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const today = formatDate(new Date())
    useCalendarStore.setState(useCalendarStore.getInitialState(), true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    localStorage.clear()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          activities: [READ],
          logs: [done(formatDate(yesterday))],
          selectedDate: formatDate(yesterday),
          selectedMonth: yesterday.getMonth(),
          selectedYear: yesterday.getFullYear(),
          currentView: 'year',
          checkinEnabled: false,
          reminderOffered: true,
          feedbackInviteSeen: true,
        },
        version: 0,
      })
    )

    await useCalendarStore.persist.rehydrate()
    render(<App />)
    await act(async () => {})

    expect(useCalendarStore.getState().currentView).toBe('month')
    expect(screen.getByTestId('month-title-button')).toHaveTextContent(
      new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
    )
    expect(isTodayIn(today)).toBe(true)
    expect(screen.queryByTestId('quicklog-modal')).not.toBeInTheDocument()
    expect(screen.getByTestId('log-today-bar')).toHaveAccessibleName(
      'Log today: 0 of 1 activity completed'
    )
  })
})
