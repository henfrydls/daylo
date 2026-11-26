import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { STORAGE_KEY, useCalendarStore } from './store'
import { useRescueStore } from './store/rescue'
import { formatDate } from './lib/dates'

const NOW = '2026-09-01T00:00:00.000Z'

/**
 * The failure that used to have no screen.
 *
 * App returns the skeleton while `_hasHydrated` is false, and hydration throwing leaves it
 * false for ever: zustand calls the rehydrate callback with no state, so nothing ever sets
 * it. The result was a loading screen that never finished, with no header, so no Settings,
 * so no Export, over data that was sitting on the disk the whole time.
 */
describe('when the data will not open', () => {
  beforeEach(() => {
    useRescueStore.setState({ failure: null })
  })

  it('shows a way out instead of a skeleton that never finishes', () => {
    useCalendarStore.setState({ _hasHydrated: false })
    useRescueStore.setState({
      failure: { reason: 'unreadable', raw: '{"state":{"logs":[truncated' },
    })

    render(<App />)

    expect(screen.getByTestId('could-not-open')).toBeInTheDocument()
    expect(screen.queryByTestId('app-skeleton')).not.toBeInTheDocument()
  })

  // Loading is not failing. A skeleton while hydration is still running is correct, and
  // replacing it with an error would be the app panicking at its own startup.
  it('still shows the skeleton while it is only loading', () => {
    useCalendarStore.setState({ _hasHydrated: false })

    render(<App />)

    expect(screen.getByTestId('app-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('could-not-open')).not.toBeInTheDocument()
  })
})

const remindersAvailable = vi.hoisted(() => vi.fn())
const openMailto = vi.hoisted(() => vi.fn())
const checkinFields = vi.hoisted(() => vi.fn())
const sendCheckinIfDue = vi.hoisted(() => vi.fn())
const startCheckinOnNewInstall = vi.hoisted(() => vi.fn())
const sendShown = vi.hoisted(() => vi.fn())
const sendRating = vi.hoisted(() => vi.fn())
const sendComment = vi.hoisted(() => vi.fn())

/**
 * Whether this is running inside the application or in a browser.
 *
 * The suite used to say "in the app" by making the check-in answer, because everything
 * that cared asked the check-in. Send feedback does not: it is a `mailto:` link now, and
 * what decides whether the link is followed or taken is whether there is a webview to
 * take it. The two are the same thing everywhere except a build with the check-in
 * compiled out, which is what the lab is, so they are set separately here.
 */
const inTheApp = vi.hoisted(() => ({ yes: false }))

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  isTauri: () => inTheApp.yes,
}))

vi.mock('./lib/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/feedback')>()),
  sendShown,
  sendRating,
  sendComment,
}))

vi.mock('./lib/checkin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lib/checkin')>()),
  checkinFields,
  sendCheckinIfDue,
  startCheckinOnNewInstall,
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

/**
 * Settings, by whichever way in this platform has.
 *
 * Where there is a reminder to offer there are two things to choose between and the corner
 * holds a menu; where there is not, the corner is the gear itself. Both land here, which is
 * the point of asking for it this way rather than naming one of them.
 */
async function openSettings() {
  const gear = screen.queryAllByTestId('settings-button')
  if (gear.length > 0) {
    await userEvent.click(gear[0])
  } else {
    await openTheMenu()
    await userEvent.click(screen.getAllByText('Settings')[0])
  }
  await screen.findByTestId('settings')
}

beforeEach(() => {
  inTheApp.yes = false
  remindersAvailable.mockReset().mockResolvedValue(false)
  checkinFields.mockReset().mockResolvedValue(null)
  sendCheckinIfDue.mockReset().mockResolvedValue(undefined)
  startCheckinOnNewInstall.mockReset().mockResolvedValue(undefined)
  sendShown.mockReset().mockResolvedValue(true)
  sendRating.mockReset().mockResolvedValue(true)
  sendComment.mockReset().mockResolvedValue(true)
  // The ordinary case for most of this file: a device that has run Daylo before and has
  // a decision on disk. The tests about the first launch say otherwise for themselves.
  useCalendarStore.setState({ _checkinStart: 'decided' })
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

describe('the way into settings', () => {
  // A menu whose only entry is "Settings" is a button wearing a hat. Where the reminder
  // does not exist there is nothing to choose between, so the corner is the gear itself.
  it('is a gear where there is no reminder to choose between', async () => {
    render(<App />)
    await act(async () => {})

    expect(screen.queryAllByLabelText('More options')).toHaveLength(0)
    await openSettings()

    expect(screen.getByTestId('settings')).toBeInTheDocument()
  })

  it('is a menu of two on Android, and both of them land in the same place', async () => {
    remindersAvailable.mockResolvedValue(true)
    render(<App />)
    await act(async () => {})

    await openTheMenu()
    await userEvent.click(screen.getByText('Daily reminder'))

    // The reminder is a section of settings now, not a sheet of its own: one surface, and
    // the entry is a way in rather than a different thing.
    expect(await screen.findByTestId('settings')).toBeInTheDocument()
    expect(screen.getByTestId('reminder-switch')).toBeInTheDocument()
  })

  it('has no reminders to show where a notification cannot arrive', async () => {
    render(<App />)
    await act(async () => {})

    await openSettings()

    expect(screen.queryByTestId('reminder-switch')).not.toBeInTheDocument()
  })
})

// Import used to be three levels down, behind the gear and Settings, on the one day it
// matters: the first day of a reinstalled app, which looks exactly like a new one.
describe('the way into import from an empty app', () => {
  it('opens Import from the line under the empty month', async () => {
    render(<App />)
    await act(async () => {})

    await userEvent.click(screen.getByRole('button', { name: 'Import your backup' }))

    expect(await screen.findByRole('dialog', { name: 'Import Data' })).toBeInTheDocument()
    expect(screen.queryByTestId('settings')).not.toBeInTheDocument()
  })

  const backup = () =>
    new File(
      [
        JSON.stringify({
          activities: [
            {
              id: 'b1',
              name: 'Swim',
              color: '#3B82F6',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          logs: [],
        }),
      ],
      'daylo-backup.json',
      { type: 'application/json' }
    )

  // The button that had focus is gone the moment the calendar fills, and focus fell to
  // the page: somebody on a keyboard or a screen reader was left nowhere. The month's own
  // title is there before and after, and says where they are.
  it('leaves focus on the month after an import fills the calendar', async () => {
    render(<App />)
    await act(async () => {})

    await userEvent.click(screen.getByRole('button', { name: 'Import your backup' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import Data' })
    await userEvent.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, backup())
    await userEvent.click(await screen.findByRole('button', { name: /Import Data/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }))

    await act(async () => {})
    expect(useCalendarStore.getState().activities).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Import your backup' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('first-day-door')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByTestId('month-title-button'))
  })

  // fireEvent and not userEvent on purpose: a click that does not focus the button, which
  // is what Safari and WKWebView do with buttons. Focus then never was on the line, so
  // nothing brought it back there when Import closed with nothing imported.
  it('puts focus back on the line when Import closes with nothing imported', async () => {
    render(<App />)
    await act(async () => {})

    const line = screen.getByRole('button', { name: 'Import your backup' })
    fireEvent.click(line)
    await screen.findByRole('dialog', { name: 'Import Data' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await act(async () => {})
    expect(document.activeElement).toBe(line)
  })

  // On a phone the view that is not on screen is drawn beside it, so a drag has something
  // to reveal, and in Year that neighbour is an empty Month with its own line. It keeps
  // the line so the neighbour is as tall as it will be once it arrives, and it is inert:
  // hidden from screen readers and out of reach of the keyboard and the finger.
  // Year has its own door and line now. The Month drawn hidden beside it keeps the same
  // markup, so it is as tall as it will be once it arrives, but without the test ids: one
  // of each on the page, the one that works. The hidden one is inert and out of reach.
  it('keeps the line in the hidden month beside Year out of reach', async () => {
    useCalendarStore.setState({ currentView: 'year' })
    render(<App />)
    await act(async () => {})

    for (const id of ['month-empty-import', 'first-day-door', 'month-empty-state']) {
      const found = document.querySelectorAll(`[data-testid="${id}"]`)
      expect(found, id).toHaveLength(1)
      expect(found[0].closest('[inert]'), id).toBeNull()
    }
    const hidden = document.querySelector('[inert]')!
    expect(hidden.textContent).toContain('Used Daylo before? Import your backup')
    expect(hidden.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Import your backup' })).toHaveLength(1)
  })

  it('leaves focus on the year after an import from the door in Year', async () => {
    useCalendarStore.setState({ currentView: 'year' })
    render(<App />)
    await act(async () => {})

    await userEvent.click(screen.getByRole('button', { name: 'Import your backup' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import Data' })
    await userEvent.upload(dialog.querySelector('input[type="file"]') as HTMLInputElement, backup())
    await userEvent.click(await screen.findByRole('button', { name: /Import Data/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Import' }))

    await act(async () => {})
    expect(useCalendarStore.getState().activities).toHaveLength(1)
    expect(document.activeElement).toHaveAttribute('data-testid', 'year-title')
  })
})

describe('the first day', () => {
  // The day sheet opened here would otherwise stay open into the next test, where it holds
  // back everything that waits for it.
  afterEach(() => {
    useCalendarStore.setState({ selectedDate: null })
  })

  const habit = {
    id: 'a1',
    name: 'Exercise',
    color: '#10B981',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }

  // With nothing to manage, the round button only led to a panel that said so. The door
  // is the one green thing to press.
  it('has no floating button with no activities', async () => {
    render(<App />)
    await act(async () => {})

    expect(screen.queryByTestId('fab-button')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('first-day-door').length).toBeGreaterThan(0)
  })

  it('has the floating button once there is an activity', async () => {
    useCalendarStore.setState({ activities: [habit] })
    render(<App />)
    await act(async () => {})

    expect(screen.getByTestId('fab-button')).toBeInTheDocument()
    expect(screen.queryByTestId('first-day-door')).not.toBeInTheDocument()
  })

  it('goes from the door to a logged today, with a run of one in the header', async () => {
    render(<App />)
    await act(async () => {})

    const door = screen
      .getAllByTestId('first-day-door')
      .find((node) => node.closest('[inert]') === null)!
    await userEvent.click(door)
    const input = await screen.findByTestId('quicklog-new-activity-input')
    await waitFor(() => expect(input).toHaveFocus())
    await userEvent.type(input, 'Read')
    await userEvent.click(screen.getByTestId('quicklog-add-activity'))

    expect(screen.getByTestId('first-day-line')).toHaveTextContent(
      'Today is in. Log it again tomorrow.'
    )
    const today = formatDate(new Date())
    expect(useCalendarStore.getState().logs.filter((l) => l.date === today)).toHaveLength(1)
    expect(screen.queryByTestId('first-day-door')).not.toBeInTheDocument()
    expect(screen.getByTestId('fab-button')).toBeInTheDocument()

    const chip = screen.getAllByTestId('streak-chip')[0]
    expect(chip).toHaveTextContent('1 day')
    expect(chip.querySelector('[data-testid="streak-flame"]')).toHaveAttribute('data-lit', 'true')
  })

  // The run is there from its first day, hollow on the morning after until today is in.
  it('shows the run of one, hollow, on the second morning', async () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const date = formatDate(yesterday)
    useCalendarStore.setState({
      activities: [habit],
      logs: [{ id: 'l1', activityId: 'a1', date, completed: true, createdAt: date }],
    })
    render(<App />)
    await act(async () => {})

    const chip = screen.getAllByTestId('streak-chip')[0]
    expect(chip).toHaveTextContent('1 day')
    expect(chip.querySelector('[data-testid="streak-flame"]')).toHaveAttribute('data-lit', 'false')
    expect(screen.getAllByTestId('today-bar-line')[0]).toHaveTextContent(
      'Log today to make 2 days in a row'
    )
  })

  it('brings the door back, and takes the button away, when the last activity goes', async () => {
    useCalendarStore.setState({ activities: [habit] })
    render(<App />)
    await act(async () => {})

    act(() => useCalendarStore.getState().deleteActivity('a1'))

    expect(screen.getAllByTestId('first-day-door').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('fab-button')).not.toBeInTheDocument()
  })
})

// In a browser there is no command to send through, and a browser is the one place a
// mailto: actually opens something, so there the letter stays. The app's half of this is
// the describe below.
describe('writing without being asked, in a browser', () => {
  beforeEach(() => {
    openMailto.mockReset().mockResolvedValue('opened')
    useCalendarStore.setState({ feedbackInviteSeen: false })
  })

  it('is in settings, on every platform', async () => {
    render(<App />)
    await act(async () => {})

    await openSettings()

    expect(screen.getByTestId('settings-feedback')).toBeInTheDocument()
  })

  // It opens the letter and marks nothing. Pressing this out of curiosity and backing out
  // of the chooser would otherwise take the invitation away for good, and take it away
  // silently: the person would never learn there had been one. The cost the other way is
  // that somebody who did write may still be asked later, and that one they
  // can see and close.
  /**
   * In a browser the letter is opened by the link itself, which is what `openMailto` has
   * always assumed: it reports success without doing anything, and says in its own comment
   * that it "lets the anchor's own navigation do the work". There was no anchor until now,
   * so on the web this did nothing at all and said nothing either.
   */
  it('is a letter the browser can open by itself', async () => {
    render(<App />)
    await act(async () => {})
    await openSettings()

    expect(screen.getByTestId('settings-feedback')).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:daylo@henfrydls.com')
    )
  })

  // And it marks nothing. Pressing this out of curiosity and backing out of the chooser
  // would otherwise take the invitation away for good, and silently: the person would
  // never learn there had been one.
  it('spends no invitation when it is pressed', async () => {
    render(<App />)
    await act(async () => {})
    await openSettings()

    await userEvent.click(screen.getByTestId('settings-feedback'))

    await act(async () => {})
    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(false)
  })
})

/**
 * A build of the application with the check-in compiled out, which is what the lab is and
 * what anybody building Daylo themselves with the switch off gets.
 *
 * There is a webview, so the link must not be followed; and there is no platform to send a
 * question through, so the letter is asked for instead. When no mail app answers, the
 * address has to reach the person somehow, and a toast is the only place left.
 */
describe('writing from a build with no check-in', () => {
  beforeEach(() => {
    inTheApp.yes = true
    checkinFields.mockResolvedValue(null)
    openMailto.mockReset().mockResolvedValue('opened')
  })

  it('asks the platform for the letter rather than following the link', async () => {
    render(<App />)
    await act(async () => {})
    await openSettings()

    await userEvent.click(screen.getByTestId('settings-feedback'))

    await act(async () => {})
    expect(openMailto).toHaveBeenCalledTimes(1)
  })

  it('gives the address when no email app answers', async () => {
    openMailto.mockResolvedValue('failed')
    render(<App />)
    await act(async () => {})
    await openSettings()

    await userEvent.click(screen.getByTestId('settings-feedback'))

    expect(await screen.findByText(/Could not open an email app/)).toBeInTheDocument()
    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(false)
  })
})

// Everything below is the app: checkinFields answers, so there is a platform to send
// through and the question is a dialog rather than a letter.
describe('the question, in the app', () => {
  const pastTheGate = () => {
    // Counted from the real clock, because the gate reads it. Today is one of the three
    // days on purpose: the gate wants a record in this session, so the day it could
    // appear is always in the set.
    const day = (back: number) => {
      const d = new Date()
      d.setDate(d.getDate() - back)
      return formatDate(d)
    }
    useCalendarStore.setState({
      logs: [day(7), day(4), day(0)].map((date) => ({
        id: date,
        activityId: 'a1',
        date,
        completed: true,
        createdAt: date,
      })),
      firstOpenedAt: day(7),
      feedbackInviteSeen: false,
      _loggedThisSession: true,
      _offerThisSession: null,
      reminderOffered: true,
      checkinEnabled: false,
      checkinId: null,
      _checkinStart: 'decided',
    })
  }

  beforeEach(() => {
    inTheApp.yes = true
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux', source: 'deb' })
    openMailto.mockReset().mockResolvedValue('opened')
    // _feedbackAsked is a session flag and a session is one run of the app; between tests
    // it has to go back, or a test inherits an open question from the one before it and
    // reports its origin as automatic.
    useCalendarStore.setState({
      feedbackInviteSeen: false,
      _loggedThisSession: false,
      _feedbackAsked: false,
    })
  })

  it('is what settings opens here, and the letter is not', async () => {
    render(<App />)
    await act(async () => {})
    await openSettings()

    await userEvent.click(screen.getByTestId('settings-feedback'))

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    expect(openMailto).not.toHaveBeenCalled()
  })

  // Two ways in, and they are not the same person: one went looking for it, the other was
  // interrupted. Reading them together would average a volunteer with a bystander.
  // Two ways in, and they are not the same person. The word stays "menu" although the
  // place is now a panel: it names where the question came from in the numbers that have
  // already been gathered, and renaming it would split one measurement into two.
  it('says it was gone looking for, not offered', async () => {
    render(<App />)
    await act(async () => {})
    await openSettings()

    await userEvent.click(screen.getByTestId('settings-feedback'))

    expect(sendShown).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'menu')
  })

  // The launch that updates from before the check-in used to put a line about it on the
  // screen, and the invitation waited for that line for the rest of the session. The line
  // is gone, so there is nothing to wait for.
  it('opens by itself on the launch that updates, with nothing ahead of it', async () => {
    pastTheGate()
    useCalendarStore.setState({ _checkinStart: 'update' })

    render(<App />)
    await act(async () => {})

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()
  })

  it('opens by itself once the gate is past, and says so', async () => {
    pastTheGate()

    render(<App />)
    await act(async () => {})

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    expect(sendShown).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'automatic')
  })

  // Showing it is what spends it. A question that came back tomorrow because nobody
  // answered would be the app asking a favour twice.
  // The tick that opens the gate happens inside the day sheet, so without waiting the
  // question would arrive on top of it: two modals, two focus traps, and Escape closing
  // both, in the one gesture the app is for.
  it('waits while the day sheet is up, and does not lose its turn', async () => {
    const day = (back: number) => {
      const d = new Date()
      d.setDate(d.getDate() - back)
      return formatDate(d)
    }
    // Two days of use and the sheet open on today: the state of somebody about to make the
    // third. _loggedThisSession is deliberately NOT seeded, because the tick is what sets
    // it and the tick is the gesture being tested.
    pastTheGate()
    useCalendarStore.setState({
      logs: [day(7), day(4)].map((date) => ({
        id: date,
        activityId: 'a1',
        date,
        completed: true,
        createdAt: date,
      })),
      activities: [{ id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW }],
      _loggedThisSession: false,
      selectedDate: day(0),
    })

    render(<App />)
    await act(async () => {})

    // The gesture, not the flag it sets. Seeding _loggedThisSession would leave the one
    // claim this fix rests on untested: that the flag survives the sheet closing. Somebody
    // "tidying state on close" would turn the wait into a silent cancellation and a test
    // written against the flag would stay green.
    await act(async () => {
      useCalendarStore.getState().toggleLog('a1', day(0))
    })

    expect(screen.queryByTestId('feedback-rating')).not.toBeInTheDocument()

    // Closed through the action the app uses, not by writing the field. Writing it would
    // walk past setSelectedDate, which is exactly where somebody "tidying state on close"
    // would put the line that turns this wait into a cancellation.
    await act(async () => {
      useCalendarStore.getState().setSelectedDate(null)
    })

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
  })

  /**
   * It leaves instead of vanishing, and that costs nothing it was not already paying.
   *
   * It used to be `{questionIsOpen && <FeedbackRating isOpen />}`, which takes it out of
   * the page the instant it closes, so the frames where it goes down never happen. It now
   * stands there a moment longer with nothing drawn, which is the only way those frames
   * can exist, and then goes.
   *
   * Why it still is not simply left mounted, the way Export and Import are: the number it
   * carries is made on mount and must not outlive the dialog, and onShown is a mount
   * effect, so mounting it early would spend the invitation on somebody never asked.
   */
  it('stands there while it leaves, and then goes', async () => {
    pastTheGate()
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')

    await userEvent.click(screen.getByLabelText('Close modal'))

    // Still in the page with the closing under way: this is the whole of the change.
    expect(screen.getByTestId('feedback-rating')).toBeInTheDocument()

    await waitForElementToBeRemoved(() => screen.queryByTestId('feedback-rating'))
  })

  /**
   * And it is still put once.
   *
   * The thing that could have gone wrong here: onShown runs on mount, and the mount is now
   * governed by something that outlives the closing. If the question were re-mounted, or
   * mounted before being asked, the invitation would be spent on somebody who never saw it
   * and they would never be asked again.
   */
  it('is put once, however long it stands there', async () => {
    pastTheGate()
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')

    await userEvent.click(screen.getByLabelText('Close modal'))
    await waitForElementToBeRemoved(() => screen.queryByTestId('feedback-rating'))
    // Well past the window it stands there for, in case anything mounts again at the end.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })

    expect(sendShown).toHaveBeenCalledTimes(1)
    // And nothing comes back on its own.
    expect(screen.queryByTestId('feedback-rating')).not.toBeInTheDocument()
  })

  it('is spent by being shown', async () => {
    pastTheGate()

    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')

    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(true)
  })

  it('sends the star on the tap and the comment on the button', async () => {
    pastTheGate()
    sendComment.mockResolvedValue(true)
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')

    await userEvent.click(screen.getByLabelText('3 stars'))
    expect(sendRating).toHaveBeenCalledExactlyOnceWith(expect.any(String), 3)

    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'the year view')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(sendComment).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'the year view')
  })

  // The server records events and never updates them, so the two halves arrive as two
  // messages and something has to say they are one answer.
  it('gives both halves of one answer the same number', async () => {
    pastTheGate()
    sendComment.mockResolvedValue(true)
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')

    await userEvent.click(screen.getByLabelText('3 stars'))
    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'a note')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    const shownWith = sendShown.mock.calls[0][0]
    expect(sendRating.mock.calls[0][0]).toBe(shownWith)
    expect(sendComment.mock.calls[0][0]).toBe(shownWith)
  })

  // The channel this replaced failed without saying so, which is the whole reason it was
  // replaced. Somebody who wrote something and pressed a button is owed the truth.
  it('says so when what was written did not go', async () => {
    pastTheGate()
    sendComment.mockResolvedValue(false)
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('feedback-rating')

    await userEvent.click(screen.getByLabelText('3 stars'))
    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'a note')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText(/That did not send/)).toBeInTheDocument()
  })
})

// The check-in has no place outside the native app: the web build and the Docker image
// have no command to call and a CSP that forbids the call anyway.
describe('the check-in in settings', () => {
  it('is absent where nothing can be sent', async () => {
    render(<App />)
    await act(async () => {})

    await openSettings()

    expect(screen.queryByTestId('checkin-switch')).not.toBeInTheDocument()
  })

  // A switch on the surface rather than a sheet behind a menu entry: the decision and the
  // thing it decides are now in the same place as everything else that is decided.
  it('is a switch on the surface, in the app', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android', source: 'apk' })
    render(<App />)
    await act(async () => {})

    await openSettings()

    expect(screen.getByTestId('checkin-switch')).toBeInTheDocument()
  })
})

// Two moments, because two kinds of device. A phone is closed and opened; a desktop is
// left running for days and only the window coming back says somebody is there again. A
// second ask on the same day is refused by sendCheckinIfDue itself; App.newDay.test.tsx
// runs the real one to count what leaves the device.
describe('when the daily check-in is attempted', () => {
  it('asks once the store is there and the app can send', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux', source: 'deb' })
    render(<App />)
    await act(async () => {})

    expect(sendCheckinIfDue).toHaveBeenCalled()
  })

  it('does not ask where nothing can be sent', async () => {
    render(<App />)
    await act(async () => {})

    expect(sendCheckinIfDue).not.toHaveBeenCalled()
  })

  it('asks again when the window comes back on a new day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 10, 13, 21, 0))
      checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux', source: 'deb' })
      render(<App />)
      await act(async () => {})
      sendCheckinIfDue.mockClear()

      vi.setSystemTime(new Date(2026, 10, 14, 8, 30))
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(sendCheckinIfDue).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})

// On by default for a new installation and off for somebody updating, as before. What
// changed is that neither launch puts a line about it on the screen: the switch and what
// it sends are in the menu, and that is the whole of it.
describe('the check-in on a device that has never had Daylo', () => {
  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android', source: 'apk' })
    useCalendarStore.setState({
      _checkinStart: 'new',
      checkinEnabled: false,
      _offerThisSession: null,
      reminderOffered: true,
    })
  })

  it('turns it on at the first launch, and puts nothing about it on the screen', async () => {
    render(<App />)
    await act(async () => {})

    expect(startCheckinOnNewInstall).toHaveBeenCalled()
    expect(sendCheckinIfDue).not.toHaveBeenCalled()
    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument()
  })
})

// Somebody updating installed Daylo when it said it sent nothing anywhere, so it stays off
// for them. Nothing on the screen says so either: the switch is in the menu.
describe('the check-in on a device updating from an earlier version', () => {
  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android', source: 'apk' })
    useCalendarStore.setState({
      _checkinStart: 'update',
      checkinEnabled: false,
      _offerThisSession: null,
      reminderOffered: true,
    })
  })

  it('leaves it off, and puts nothing about it on the screen', async () => {
    render(<App />)
    await act(async () => {})

    expect(startCheckinOnNewInstall).not.toHaveBeenCalled()
    expect(sendCheckinIfDue).toHaveBeenCalled()
    expect(useCalendarStore.getState().checkinEnabled).toBe(false)
    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument()
  })
})

// The first launch of a new Android installation is the one where the reminder is owed
// and cannot be put yet, because there are no habits to be reminded about. Once there is
// one and it has been ticked, the offer comes, with nothing about the check-in before it
// or under it.
describe('the reminder offer on a new Android installation', () => {
  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android', source: 'apk' })
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({
      _checkinStart: 'new',
      checkinEnabled: false,
      _offerThisSession: null,
      // Owed from this launch, and unanswerable: no habits exist yet.
      reminderOffered: false,
      activities: [],
      // A session flag an earlier test leaves set. With it the feedback question is open,
      // and the reminder offer rightly waits for it.
      _feedbackAsked: false,
    })
  })

  it('is asked once there is a habit and a tick, with no line about the check-in', async () => {
    render(<App />)
    await act(async () => {})
    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()

    await act(async () => {
      useCalendarStore.setState({
        activities: [{ id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW }],
        logs: ['2026-10-08', '2026-10-09'].map((date) => ({
          id: date,
          activityId: 'a1',
          date,
          completed: true,
          createdAt: NOW,
        })),
        reminderLastTickDay: '2026-10-09',
        _tickedThisSession: true,
        _loggedThisSession: true,
      })
    })
    expect(await screen.findByText('Remind me each evening?')).toBeInTheDocument()
    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Not now'))
    await act(async () => {})

    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()
    expect(screen.queryByText(/check-in/i)).not.toBeInTheDocument()
  })
})

// The day sheet, for real: selectedDate through App, not a canAsk handed in by a test.
describe('the reminder offer and the day sheet', () => {
  it('waits for the day sheet to close', async () => {
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({
      activities: [{ id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW }],
      logs: [],
      reminderOffered: false,
      reminderLastTickDay: '2026-10-09',
      reminderOfferDismissals: 0,
      reminderOfferDismissedOn: null,
      _tickedThisSession: true,
      _reminderOfferClosed: false,
      _offerThisSession: null,
      selectedDate: '2026-10-09',
    })
    render(<App />)
    await act(async () => {})
    await act(async () => {})

    expect(screen.queryByText('Remind me each evening?')).not.toBeInTheDocument()

    await act(async () => {
      useCalendarStore.setState({ selectedDate: null })
    })

    expect(await screen.findByText('Remind me each evening?')).toBeInTheDocument()
  })

  // The feedback question is not in the day sheet's way and is not opened by App's
  // sheets: it waits on its own condition, and the offer waits for it.
  it('waits while the feedback question is open', async () => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android', source: 'apk' })
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({
      activities: [{ id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW }],
      reminderOffered: false,
      reminderLastTickDay: '2026-10-09',
      reminderOfferDismissals: 0,
      reminderOfferDismissedOn: null,
      _tickedThisSession: true,
      _reminderOfferClosed: false,
      _offerThisSession: null,
      selectedDate: null,
      _feedbackAsked: true,
    })
    render(<App />)

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    await act(async () => {})
    expect(screen.queryByText('Remind me each evening?')).not.toBeInTheDocument()
  })
})

describe('the streak in the header', () => {
  const fourDaysRunning = () => {
    const today = new Date()
    const logs = [1, 2, 3, 4].map((back) => {
      const day = new Date(today)
      day.setDate(day.getDate() - back)
      const date = formatDate(day)
      return { id: `l${back}`, activityId: 'a1', date, completed: true, createdAt: date }
    })
    useCalendarStore.setState({
      activities: [
        {
          id: 'a1',
          name: 'Exercise',
          color: '#10B981',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
      logs,
    })
  }

  // The one that would have caught the fault: the chip mounted only in the group that the
  // phone shows, so at desktop width there was no chip at all. With the Statistics tile
  // gone in this version, that leaves 107 of the 115 copies with the streak nowhere. A
  // screenshot of a phone says nothing about it.
  it('is in both of the header groups, so neither width is left without it', async () => {
    fourDaysRunning()
    render(<App />)
    await act(async () => {})

    const chips = screen.getAllByTestId('streak-chip')

    expect(chips).toHaveLength(2)
    // The chip sits in its own box (the sheet hangs from it), inside the header group.
    const group = (chip: HTMLElement) => chip.parentElement?.parentElement?.className ?? ''
    expect(chips.filter((chip) => group(chip).includes('sm:hidden'))).toHaveLength(1)
    expect(chips.filter((chip) => group(chip).includes('sm:flex'))).toHaveLength(1)
  })

  it('says the run, and that today is still open', async () => {
    fourDaysRunning()
    render(<App />)
    await act(async () => {})

    expect(screen.getAllByTestId('streak-chip')[0]).toHaveAccessibleName(
      '4 days in a row, today not logged yet. Show your streak'
    )
  })

  // The rule that lived in the Statistics tile until 1.6: the number is today's, whatever
  // year is being looked at. The panel had it wrong once, because it read only the selected
  // year and a run through the new year was cut in half by the calendar. The chip is not
  // handed a year at all, and this test is what says it stays that way.
  it('says the same run whatever year is on screen', async () => {
    fourDaysRunning()
    useCalendarStore.setState({ selectedYear: 2024 })
    render(<App />)
    await act(async () => {})

    expect(screen.getAllByTestId('streak-chip')[0]).toHaveAccessibleName(
      '4 days in a row, today not logged yet. Show your streak'
    )
  })

  // The other half of the same rule, and the one the tile's own test used to hold: a run
  // that began in December is still one run on 2 January. Only the date is faked, so the
  // rest of the app keeps its real timers.
  it('carries a run across the new year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2027, 0, 2, 12))
    try {
      useCalendarStore.setState({
        selectedYear: 2027,
        selectedMonth: 0,
        activities: [
          {
            id: 'a1',
            name: 'Exercise',
            color: '#10B981',
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
          },
        ],
        logs: ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'].map((date) => ({
          id: date,
          activityId: 'a1',
          date,
          completed: true,
          createdAt: date,
        })),
      })
      render(<App />)
      await act(async () => {})

      expect(screen.getAllByTestId('streak-chip')[0]).toHaveAccessibleName(
        '4 days in a row, today included. Show your streak'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('is nowhere at all when there is no run', async () => {
    render(<App />)
    await act(async () => {})

    expect(screen.queryAllByTestId('streak-chip')).toHaveLength(0)
  })

  // Each group opens its own surface: the phone's a sheet from the bottom edge, the wide
  // screen's a panel hanging from the chip.
  it('opens the sheet from the phone chip and the panel from the desktop one', async () => {
    fourDaysRunning()
    render(<App />)
    await act(async () => {})
    const [phone, desktop] = screen.getAllByTestId('streak-chip')

    await userEvent.click(phone)
    expect(screen.getByTestId('streak-sheet')).toHaveTextContent('Your streak')
    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent('4 days')
    expect(screen.getByTestId('streak-tile-best')).toHaveTextContent('Your best ever')
    expect(screen.queryByTestId('streak-panel')).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('streak-sheet')).not.toBeInTheDocument())

    await userEvent.click(desktop)
    expect(screen.getByTestId('streak-panel')).toHaveTextContent('Today is not logged yet.')
    expect(screen.queryByTestId('streak-sheet')).not.toBeInTheDocument()
  })

  // The reminder's offer reads useOpenDialogs, and the sheet counts itself there.
  it('keeps the reminder offer back while the sheet is open', async () => {
    fourDaysRunning()
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({
      reminderOffered: false,
      reminderLastTickDay: '2026-10-09',
      reminderOfferDismissals: 0,
      reminderOfferDismissedOn: null,
      _tickedThisSession: false,
      _reminderOfferClosed: false,
      _offerThisSession: null,
      selectedDate: null,
    })
    render(<App />)
    await act(async () => {})
    await userEvent.click(screen.getAllByTestId('streak-chip')[0])

    await act(async () => {
      useCalendarStore.setState({ _tickedThisSession: true })
    })
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)))
    expect(screen.queryByText('Remind me each evening?')).not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('Remind me each evening?')).toBeInTheDocument()
  })

  // App holds the feedback question back while the sheet is up, as it does for the day
  // sheet, and it opens once the sheet is closed.
  it('keeps the feedback question back while the panel is open', async () => {
    fourDaysRunning()
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'windows', source: 'msi' })
    // Nothing else that would put the question: only the ask below.
    useCalendarStore.setState({
      selectedDate: null,
      feedbackInviteSeen: true,
      _feedbackAsked: false,
    })
    render(<App />)
    await act(async () => {})
    expect(screen.queryByTestId('feedback-rating')).not.toBeInTheDocument()
    await userEvent.click(screen.getAllByTestId('streak-chip')[1])
    expect(screen.getByTestId('streak-panel')).toBeInTheDocument()

    await act(async () => {
      useCalendarStore.setState({ _feedbackAsked: true })
    })
    // The question is a lazy chunk, so a single tick proves nothing: give it the time it
    // takes to arrive once it is allowed.
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)))
    expect(screen.queryByTestId('feedback-rating')).not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
  })
})

/**
 * Somebody whose stored logs carry a createdAt that `new Date` reads and parseISO does
 * not, such as "2026/11/01". Until 1.6.1 an import let that in, the app opened as usual,
 * and the first tick threw a RangeError from the invitation's gate: "Something went
 * wrong", on the gesture the app is for. Driven from the disk, through hydration, because
 * that is where the repair happens.
 */
describe('a log stored with a date the app did not write', () => {
  const day = (back: number) => {
    const d = new Date()
    d.setDate(d.getDate() - back)
    return d
  }
  const slashed = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`

  beforeEach(async () => {
    inTheApp.yes = true
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux', source: 'deb' })
    openMailto.mockReset().mockResolvedValue('opened')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useRescueStore.setState({ failure: null })
    useCalendarStore.setState({
      _loggedThisSession: false,
      _feedbackAsked: false,
      _offerThisSession: null,
      selectedDate: null,
    })
    // Let the deferred write from the setState above land before the disk is seeded.
    await new Promise((done) => setTimeout(done, 20))
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          activities: [
            { id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW },
          ],
          logs: [
            {
              id: 'old',
              activityId: 'a1',
              date: formatDate(day(7)),
              completed: true,
              createdAt: slashed(day(7)),
            },
          ],
          firstOpenedAt: formatDate(day(7)),
          feedbackInviteSeen: false,
          reminderOffered: true,
          checkinEnabled: false,
          checkinId: null,
        },
        version: 0,
      })
    )
    await useCalendarStore.persist.rehydrate()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('opens the calendar, not the rescue screen, with the record kept', async () => {
    render(<App />)
    await act(async () => {})

    expect(screen.queryByTestId('could-not-open')).not.toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(useCalendarStore.getState().logs.map((l) => l.id)).toEqual(['old'])
  })

  it('takes a tick, and goes on as it would for anybody past the week', async () => {
    render(<App />)
    await act(async () => {})

    await act(async () => {
      useCalendarStore.getState().toggleLog('a1', formatDate(day(0)))
    })

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    expect(useCalendarStore.getState().logs).toHaveLength(2)
  })
})
