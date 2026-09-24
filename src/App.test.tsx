import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { useCalendarStore } from './store'
import { formatDate } from './lib/dates'

const NOW = '2026-09-01T00:00:00.000Z'

const remindersAvailable = vi.hoisted(() => vi.fn())
const openMailto = vi.hoisted(() => vi.fn())
const checkinFields = vi.hoisted(() => vi.fn())
const sendCheckinIfDue = vi.hoisted(() => vi.fn())
const startCheckinOnNewInstall = vi.hoisted(() => vi.fn())
const sendShown = vi.hoisted(() => vi.fn())
const sendRating = vi.hoisted(() => vi.fn())
const sendComment = vi.hoisted(() => vi.fn())

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

beforeEach(() => {
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

// In a browser there is no command to send through, and a browser is the one place a
// mailto: actually opens something, so there the letter stays. The app's half of this is
// the describe below.
describe('writing without being asked, in a browser', () => {
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
  // that somebody who did write may still be asked later, and that one they
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
      checkinNoticeSeen: true,
      _checkinNoticeShown: false,
      _checkinStart: 'decided',
    })
  }

  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'linux' })
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

  it('is what the menu opens here, and the letter is not', async () => {
    render(<App />)
    await act(async () => {})
    await openTheMenu()

    await userEvent.click(screen.getByText('Send feedback'))

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    expect(openMailto).not.toHaveBeenCalled()
  })

  // Two ways in, and they are not the same person: one went looking for it, the other was
  // interrupted. Reading them together would average a volunteer with a bystander.
  it('says the menu is where it came from', async () => {
    render(<App />)
    await act(async () => {})
    await openTheMenu()

    await userEvent.click(screen.getByText('Send feedback'))

    expect(sendShown).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'menu')
  })

  it('opens by itself once the gate is past, and says so', async () => {
    pastTheGate()

    render(<App />)
    await act(async () => {})

    expect(await screen.findByTestId('feedback-rating')).toBeInTheDocument()
    expect(sendShown).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'automatic')
    expect(screen.queryByTestId('feedback-invite')).not.toBeInTheDocument()
  })

  // Showing it is what spends it. A question that came back tomorrow because nobody
  // answered would be the app asking a favour twice.
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

// On by default for a new installation, and the line is what makes that honest: it is on
// the screen in the same launch that starts sending, before anything has to be tapped.
describe('the check-in on a device that has never had Daylo', () => {
  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android' })
    useCalendarStore.setState({
      _checkinStart: 'new',
      checkinEnabled: false,
      checkinNoticeSeen: false,
      _checkinNoticeShown: false,
      _offerThisSession: null,
      reminderOffered: true,
    })
  })

  it('turns it on at the first launch, and says so', async () => {
    render(<App />)
    await act(async () => {})

    expect(startCheckinOnNewInstall).toHaveBeenCalled()
    expect(sendCheckinIfDue).not.toHaveBeenCalled()
    expect(await screen.findByTestId('checkin-notice')).toHaveTextContent(
      'Anonymous check-in is on.'
    )
  })

  it('says it once: the line is marked as seen while it is on screen', async () => {
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('checkin-notice')

    expect(useCalendarStore.getState().checkinNoticeSeen).toBe(true)
    // And still there, because the flag it just set is the one the condition reads.
    expect(screen.getByTestId('checkin-notice')).toBeInTheDocument()
  })
})

// Somebody updating installed Daylo when it said it sent nothing anywhere. That promise
// is not withdrawn behind their back.
describe('the check-in on a device updating from an earlier version', () => {
  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android' })
    useCalendarStore.setState({
      _checkinStart: 'update',
      checkinEnabled: false,
      checkinNoticeSeen: false,
      _checkinNoticeShown: false,
      _offerThisSession: null,
      reminderOffered: true,
    })
  })

  it('leaves it off and invites instead', async () => {
    render(<App />)
    await act(async () => {})

    expect(startCheckinOnNewInstall).not.toHaveBeenCalled()
    expect(sendCheckinIfDue).toHaveBeenCalled()
    // What a phone shows of this line is the first three words and the link, so those
    // three words are the ones that have to be true.
    const notice = await screen.findByTestId('checkin-notice')
    expect(notice).toHaveTextContent('Anonymous check-in is off.')
    expect(notice).toHaveTextContent('See and turn on')
    expect(useCalendarStore.getState().checkinEnabled).toBe(false)
  })

  it('says nothing to somebody who already decided', async () => {
    useCalendarStore.setState({ _checkinStart: 'decided' })
    render(<App />)
    await act(async () => {})

    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()
  })

  it('says nothing again once it has been seen', async () => {
    useCalendarStore.setState({ checkinNoticeSeen: true })
    render(<App />)
    await act(async () => {})

    expect(screen.queryByTestId('checkin-notice')).not.toBeInTheDocument()
  })
})

// The launch the line exists for is the first one, and on Android that is exactly the
// launch where the reminder offer is owed and cannot be put yet, because there are no
// habits to be reminded about. A line that queued behind it would be a new installation
// sending its first check-in and saying nothing, which is the one thing this default is
// not allowed to do.
describe('the line and the reminder, on a new Android installation', () => {
  beforeEach(() => {
    checkinFields.mockResolvedValue({ version: '1.3.0', os: 'android' })
    remindersAvailable.mockResolvedValue(true)
    useCalendarStore.setState({
      _checkinStart: 'new',
      checkinEnabled: false,
      checkinNoticeSeen: false,
      _checkinNoticeShown: false,
      _offerThisSession: null,
      // Owed from this launch, and unanswerable: no habits exist yet.
      reminderOffered: false,
      activities: [],
    })
  })

  it('shows on the first launch, before there is anything to be reminded about', async () => {
    render(<App />)
    await act(async () => {})

    expect(await screen.findByTestId('checkin-notice')).toBeInTheDocument()
    expect(useCalendarStore.getState().checkinNoticeSeen).toBe(true)
  })

  it('stays while the reminder is asked, and after it is answered', async () => {
    render(<App />)
    await act(async () => {})
    await screen.findByTestId('checkin-notice')

    // A first habit exists, so the reminder can finally ask. Its modal opens over the
    // line, which is allowed: one is a question, the other is a statement.
    await act(async () => {
      useCalendarStore.setState({
        activities: [{ id: 'a1', name: 'Read', color: '#10B981', createdAt: NOW, updatedAt: NOW }],
      })
    })
    expect(await screen.findByText('Remind me each evening?')).toBeInTheDocument()
    expect(screen.getByTestId('checkin-notice')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Not now'))
    await act(async () => {})

    expect(screen.getByTestId('checkin-notice')).toBeInTheDocument()
  })
})
