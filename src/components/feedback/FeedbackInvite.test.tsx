import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackInvite } from './FeedbackInvite'
import { useCalendarStore } from '../../store'
import { FEEDBACK_MAILTO } from '../../lib/feedbackInvite'

const openMailto = vi.hoisted(() => vi.fn())
vi.mock('../../lib/feedbackInvite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/feedbackInvite')>()),
  openMailto,
}))

const onThanked = vi.fn()
const show = () => render(<FeedbackInvite onThanked={onThanked} />)
const link = () => screen.getByTestId('feedback-invite-link')
const note = () => screen.getByTestId('feedback-invite-note')

beforeEach(() => {
  openMailto.mockReset().mockResolvedValue('opened')
  onThanked.mockReset()
  useCalendarStore.setState({ feedbackInviteSeen: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('what it says', () => {
  // One sentence and a link. The long version said why it was asking and what would
  // happen when the link was pressed; the person it was asking called it invasive, and a
  // favour asked at length is a favour asked twice.
  it('asks for a line, in one sentence', () => {
    show()

    expect(screen.getByTestId('feedback-invite')).toHaveTextContent(
      'Two weeks in. How did it go? daylo@henfrydls.com'
    )
    expect(link()).toHaveAttribute('href', FEEDBACK_MAILTO)
    // Nothing else: no explanation of the email, and no note until there is one to give.
    expect(screen.queryByTestId('feedback-invite-note')).not.toBeInTheDocument()
  })

  // A band, not a dialog: it can be ignored, and ignoring is a valid answer.
  it('is not a dialog', () => {
    show()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('when the letter opens', () => {
  it('thanks, and does not ask again', async () => {
    show()

    await userEvent.click(link())

    await waitFor(() => expect(useCalendarStore.getState().feedbackInviteSeen).toBe(true))
    expect(screen.getByTestId('feedback-invite-thanks')).toHaveTextContent(
      'Thank you. That is open in your email app.'
    )
    expect(screen.queryByTestId('feedback-invite')).not.toBeInTheDocument()
  })
})

// A phone with no mail app is the case this whole branch exists for: the invitation was
// never put, so it has not been answered, and the address has to stay on screen.
describe('when no email app answers', () => {
  it('keeps the invitation, says so, and leaves the address', async () => {
    openMailto.mockResolvedValue('failed')
    show()

    await userEvent.click(link())

    await waitFor(() =>
      expect(note()).toHaveTextContent('Could not open an email app. Write to daylo@henfrydls.com.')
    )
    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(false)
    expect(link()).toBeInTheDocument()
  })

  it('paints the failure in red, where the reminder puts its own', async () => {
    openMailto.mockResolvedValue('failed')
    show()

    await userEvent.click(link())

    await waitFor(() => expect(note().className).toContain('text-red-600'))
  })
})

describe('when it is dismissed', () => {
  it('goes, without thanking, and does not come back', async () => {
    show()

    await userEvent.click(screen.getByLabelText('Dismiss'))

    expect(useCalendarStore.getState().feedbackInviteSeen).toBe(true)
    expect(screen.queryByTestId('feedback-invite-thanks')).not.toBeInTheDocument()
    // Nothing else is needed to make it go: the condition that mounted it reads the same
    // flag, so marking it seen is what removes the band.
    expect(onThanked).not.toHaveBeenCalled()
  })

  // Written to disk, not only to memory: the deferred storage flushes on an idle callback,
  // so a test that checked the store alone would pass over a band that came back tomorrow.
  it('is remembered after a restart', async () => {
    show()

    await userEvent.click(screen.getByLabelText('Dismiss'))

    await waitFor(() => {
      const raw = localStorage.getItem('simple-calendar-storage')
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw!).state.feedbackInviteSeen).toBe(true)
    })
  })

  // Reported once on a phone about another control: a 44px target is the app's minimum.
  it('has a target a thumb can hit', () => {
    show()

    expect(screen.getByLabelText('Dismiss').className).toContain('min-h-[44px]')
  })
})
