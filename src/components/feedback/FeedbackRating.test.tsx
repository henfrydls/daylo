import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackRating, STARS_TAKE_A_PRESS_AFTER } from './FeedbackRating'

const onShown = vi.fn()
const onClose = vi.fn()
const onRate = vi.fn()
const onComment = vi.fn()
const onStoreReview = vi.fn()
const onWriteToUs = vi.fn()

beforeEach(() => {
  onShown.mockReset()
  onClose.mockReset()
  onRate.mockReset()
  // The dialog waits on this now, so it has to answer.
  onComment.mockReset().mockResolvedValue(true)
  onStoreReview.mockReset()
  onWriteToUs.mockReset()
})

const show = (props: Partial<Parameters<typeof FeedbackRating>[0]> = {}) =>
  render(
    <FeedbackRating
      isOpen
      onShown={onShown}
      onClose={onClose}
      onRate={onRate}
      onComment={onComment}
      withCheckinId={false}
      offerStoreReview={false}
      onStoreReview={onStoreReview}
      onWriteToUs={onWriteToUs}
      {...props}
    />
  )

const stars = () => screen.getAllByRole('button', { name: /star/ })

describe('the question', () => {
  // The first screen is the whole question. Anything else on it is something to read
  // before answering, and the answer is one tap.
  it('is five stars and nothing else', () => {
    show()

    expect(screen.getByText('How is it going?')).toBeInTheDocument()
    expect(stars()).toHaveLength(5)
    expect(screen.queryByPlaceholderText(/Anything to add/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
  })

  // No button to press afterwards: the tap is the answer, and the rating is out before
  // anybody decides whether to write anything.
  it('answers the moment a star is pressed', async () => {
    show()

    await userEvent.click(stars()[3])

    expect(onRate).toHaveBeenCalledExactlyOnceWith(expect.any(String), 4)
  })

  it('can be closed without answering', async () => {
    show()

    await userEvent.click(screen.getByLabelText('Close modal'))

    expect(onClose).toHaveBeenCalled()
    expect(onRate).not.toHaveBeenCalled()
  })
})

/**
 * The quarter second the question spends fading in, which it used to spend taking presses.
 *
 * It is the only dialog in the app that puts itself, and it puts itself over the month
 * grid: a press already on its way to a day cell was an answer to something nobody had
 * been shown. What holds the row is `inert`, which the browser enforces for pointer,
 * keyboard and focus alike and jsdom does not enforce at all, so what is watched here is
 * the attribute arriving and leaving. The press this protects against is the early one;
 * the later one is answered by letting a second press replace the first.
 */
describe('before it is on the screen', () => {
  const row = () => screen.getByRole('group', { name: 'How is it going?' })

  it('holds the stars while the question is still arriving', () => {
    show()

    expect(row()).toHaveAttribute('inert')
  })

  it('lets go once it is there', async () => {
    show()

    await act(() => new Promise((there) => setTimeout(there, STARS_TAKE_A_PRESS_AFTER + 20)))

    expect(row()).not.toHaveAttribute('inert')
  })
})

describe('what comes after the star', () => {
  const rate = async (value = 4) => {
    show()
    await userEvent.click(stars()[value - 1])
  }

  // The same dialog, rewritten. A second one appearing over the first would be two
  // interruptions for one answer.
  it('thanks, keeps the star on screen and asks for more', async () => {
    await rate()

    expect(screen.getByText('Thanks.')).toBeInTheDocument()
    expect(screen.queryByText('How is it going?')).not.toBeInTheDocument()
    expect(stars().filter((s) => s.getAttribute('aria-pressed') === 'true')).toHaveLength(4)
    expect(screen.getByPlaceholderText('Anything to add? Optional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
  })

  it('sends what was written, and closes once it has gone', async () => {
    await rate()

    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'the year view')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onComment).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'the year view')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // The failure this whole dialog exists because of. The mailto: it replaced reported
  // success and opened nothing, so the one thing this may not do is close on a send that
  // did not happen.
  it('stays where it is when the send fails, with what was written still there', async () => {
    onComment.mockResolvedValue(false)
    await rate()

    const box = screen.getByPlaceholderText('Anything to add? Optional')
    await userEvent.type(box, 'the year view')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByTestId('feedback-rating-failed')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(box).toHaveValue('the year view')
  })

  // Two taps during the wait would put two rows in the panel, and two rows read as two
  // people rather than one double tap. A duplicate in the data, not a rough edge.
  it('cannot be pressed twice while it is in the air', async () => {
    let letItFinish: (ok: boolean) => void = () => {}
    onComment.mockReturnValue(
      new Promise<boolean>((resolve) => {
        letItFinish = resolve
      })
    )
    await rate()
    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'a note')

    const send = screen.getByRole('button', { name: 'Send' })
    await userEvent.click(send)

    expect(send).toBeDisabled()
    await userEvent.click(send)
    expect(onComment).toHaveBeenCalledOnce()

    letItFinish(true)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  // Nothing typed is not an empty message, it is no message. The star is already sent, so
  // there is nothing to wait for and it closes at once.
  it('sends nothing when nothing was written', async () => {
    await rate()

    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onComment).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('sends nothing for a box with only spaces in it', async () => {
    await rate()

    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onComment).not.toHaveBeenCalled()
  })

  // Closing here is a complete answer, not an abandoned one: the star went the moment it
  // was pressed, and this screen only ever asked for a favour on top.
  it('keeps the star when the cross is pressed instead', async () => {
    await rate(2)

    await userEvent.click(screen.getByLabelText('Close modal'))

    expect(onRate).toHaveBeenCalledExactlyOnceWith(expect.any(String), 2)
    expect(onComment).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

// What the line says has to match what the message carries, and what it carries depends
// on whether there is a check-in number to carry.
/**
 * Changing the score, which exists because of how the question arrives rather than because
 * anybody asked for it.
 *
 * Measured on 2026-10-21: the dialog is put the moment the day sheet closes, and at
 * 1280x800 its five stars land on top of five day cells of the month grid. The next thing
 * a person does after closing that sheet is often to press another day, and that press
 * answers a question they had not read. Of the first three scores, none can be trusted.
 *
 * The press is still the answer and there is still no button to confirm it. What changes
 * is that it is no longer the last word: a second press replaces it, under the same
 * number, and the panel keeps the last score for a number rather than the first.
 */
describe('changing your mind', () => {
  it('takes a later press as the answer, under the same number', async () => {
    show()
    const announced = onShown.mock.calls[0][0]

    await userEvent.click(stars()[0])
    await userEvent.click(stars()[4])

    expect(onRate).toHaveBeenCalledTimes(2)
    expect(onRate.mock.calls[0]).toEqual([announced, 1])
    expect(onRate.mock.calls[1]).toEqual([announced, 5])
    expect(stars().filter((s) => s.getAttribute('aria-pressed') === 'true')).toHaveLength(5)
  })

  // The offer is spent by the first score, so by the second press the parent is already
  // saying no. Reading the prop again there would take the line off the screen while
  // somebody was reading it, which is the app withdrawing something it had offered.
  it('does not take the Store line away when the score changes', async () => {
    const props = {
      isOpen: true,
      onShown,
      onClose,
      onRate,
      onComment,
      withCheckinId: false,
      onStoreReview,
      onWriteToUs,
    }
    const { rerender } = render(<FeedbackRating {...props} offerStoreReview />)

    await userEvent.click(stars()[0])
    rerender(<FeedbackRating {...props} offerStoreReview={false} />)
    await userEvent.click(stars()[4])

    expect(screen.getByTestId('feedback-store-review')).toBeInTheDocument()
  })
})

// The number that joins the two halves is made here and reported once, on being drawn:
// being drawn is what puts the question.
describe('the number this answer travels under', () => {
  it('is announced once, when the question is put', () => {
    show()

    expect(onShown).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^[0-9a-f]{32}$/))
  })

  it('is the same one both halves are sent with', async () => {
    show()
    const announced = onShown.mock.calls[0][0]

    await userEvent.click(stars()[2])
    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'a note')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onRate.mock.calls[0][0]).toBe(announced)
    expect(onComment.mock.calls[0][0]).toBe(announced)
  })

  // A number that came back would be an identifier, which is the one thing it may not be.
  it('is a new one for the next question', () => {
    const { unmount } = show()
    const first = onShown.mock.calls[0][0]
    unmount()

    show()

    expect(onShown.mock.calls[1][0]).not.toBe(first)
  })
})

describe('what it says it sends', () => {
  it('names the number when there is one', async () => {
    show({ withCheckinId: true })
    await userEvent.click(stars()[4])

    expect(screen.getByTestId('feedback-rating-note')).toHaveTextContent(
      'It arrives without your name, with the same random number as the check-in.'
    )
  })

  it('says only what is true when there is not', async () => {
    show()
    await userEvent.click(stars()[4])

    expect(screen.getByTestId('feedback-rating-note').textContent).toBe(
      'It arrives without your name.'
    )
  })
})

describe('the two lines after the stars', () => {
  const rate = async (props = {}) => {
    const user = userEvent.setup()
    show(props)
    await user.click(stars()[2])
    return user
  }

  // Microsoft's own guidance: a rating feature inside an app has to send everybody to the
  // Store, whatever they pressed. Offering it only to the happy ones is rating
  // manipulation, and this repository is public. So the line follows any score.
  it('offers the Store to a copy from the Store, whatever the score', async () => {
    const user = await rate({ offerStoreReview: true })

    await user.click(screen.getByTestId('feedback-store-review'))
    expect(onStoreReview).toHaveBeenCalled()
  })

  it('offers it after one star as readily as after five', async () => {
    const user = userEvent.setup()
    show({ offerStoreReview: true })

    await user.click(stars()[0])

    expect(screen.getByTestId('feedback-store-review')).toBeInTheDocument()
    await user.click(screen.getByTestId('feedback-store-review'))
    expect(onStoreReview).toHaveBeenCalled()
  })

  it('says nothing about the Store to a copy that did not come from it', async () => {
    await rate({ offerStoreReview: false })

    expect(screen.queryByTestId('feedback-store-review')).not.toBeInTheDocument()
  })

  // An address, not a request. Whoever pressed one star is the person we know least
  // about, so this is for every copy and every score.
  it('leaves an address for anyone who wants to talk', async () => {
    const user = await rate()

    await user.click(screen.getByTestId('feedback-write-to-us'))
    expect(onWriteToUs).toHaveBeenCalled()
  })

  // The red line already carries the address. Two of the same address, one of them in
  // red, reads as an instruction rather than an invitation.
  it('steps out of the way when sending failed', async () => {
    onComment.mockResolvedValue(false)
    const user = userEvent.setup()
    show()
    await user.click(stars()[2])
    await user.type(screen.getByPlaceholderText(/Anything to add/), 'hello')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByTestId('feedback-rating-failed')).toBeInTheDocument())
    expect(screen.queryByTestId('feedback-write-to-us')).not.toBeInTheDocument()
  })
})
