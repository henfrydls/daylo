import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FeedbackRating } from './FeedbackRating'

const onShown = vi.fn()
const onClose = vi.fn()
const onRate = vi.fn()
const onComment = vi.fn()

beforeEach(() => {
  onShown.mockReset()
  onClose.mockReset()
  onRate.mockReset()
  onComment.mockReset()
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

  it('sends what was written', async () => {
    await rate()

    await userEvent.type(screen.getByPlaceholderText('Anything to add? Optional'), 'the year view')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(onComment).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'the year view')
    expect(onClose).toHaveBeenCalled()
  })

  // Nothing typed is not an empty message, it is no message. The star is already sent.
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
    render(
      <FeedbackRating
        isOpen
        onShown={onShown}
        onClose={onClose}
        onRate={onRate}
        onComment={onComment}
        withCheckinId
      />
    )
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
