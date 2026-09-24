import { useEffect, useState } from 'react'
import { Button, Modal } from '../ui'
import { newAnswer } from '../../lib/feedback'

interface FeedbackRatingProps {
  isOpen: boolean
  /**
   * Called once, on the first render, with the number that joins this answer together.
   * Being drawn is what puts the question, so this is where it is reported and where it
   * is spent, not in whatever decided to draw it.
   */
  onShown: (answer: string) => void
  /** Closing is a complete answer at either step; nothing here is owed. */
  onClose: () => void
  /** Called the moment a star is pressed, with 1 to 5, and the answer's number. */
  onRate: (answer: string, stars: number) => void
  /** Called on Send, and only when something was actually written. */
  onComment: (answer: string, text: string) => void
  /**
   * Whether the message this dialog produces will carry the check-in's random number,
   * which it does when the check-in is on and never when it is off. The line at the
   * bottom says which, so the two have to be given the same fact.
   */
  withCheckinId: boolean
}

/**
 * The question Daylo asks, and the only way anything typed can reach us from inside the
 * app.
 *
 * It replaced a `mailto:` link, and the reason is worth keeping because the link looked
 * like it worked. On Linux with no mail client configured, `xdg-open` exits zero without
 * opening anything, so the app said thank you for a letter nobody wrote and marked the
 * invitation as answered for good. On macOS the link opens the account setup assistant,
 * and on Android the compose activity ships disabled. A letter also asks somebody to
 * identify themselves one screen after the app promised it does not know who they are.
 *
 * In a browser the old link stays, and that is not an oversight left behind: a browser is
 * the one place a `mailto:` does work, usually against webmail, and the page has no
 * platform to send through anyway. The dialog is for the app; the link is for the web.
 *
 * A dialog and not a band, which contradicts the rule the rest of the app follows. That
 * was decided deliberately: the band it replaces had never once been answered, and a
 * question that can be scrolled past is a question that gets scrolled past.
 *
 * Two steps in one dialog rather than one screen with everything on it, and the reason is
 * a measurement and not a preference: with the stars, the box and the button together at
 * 360x740 the send button lands in the last pixels of the screen, underneath where a
 * phone on gesture navigation keeps its own bar.
 */
export function FeedbackRating({
  isOpen,
  onShown,
  onClose,
  onRate,
  onComment,
  withCheckinId,
}: FeedbackRatingProps) {
  // Made here and kept for as long as this is mounted, which is the whole of its life:
  // unmounting is the only way it goes, and the next question makes another one. A number
  // that outlived the dialog would be an identifier, and this one may not be.
  const [answer] = useState(newAnswer)
  const [rated, setRated] = useState<number | null>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    onShown(answer)
    // Once per mount, on purpose: this reports that the question was put, and it was put
    // once however many times anything above here re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The tap is the answer. A star followed by a button to confirm it would mean the app
  // has the rating and is holding it hostage for the rest of the form, and the rest of
  // the form is optional.
  const rate = (stars: number) => {
    setRated(stars)
    onRate(answer, stars)
  }

  const send = () => {
    const written = text.trim()
    // Nothing typed is not an empty message, it is no message: the star already went.
    if (written !== '') onComment(answer, written)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={rated === null ? 'How is it going?' : 'Thanks.'}
      data-testid="feedback-rating"
      footer={
        rated === null ? undefined : (
          <Button onClick={send} size="lg" className="w-full" data-testid="feedback-rating-send">
            Send
          </Button>
        )
      }
    >
      <div className="flex justify-center gap-1" role="group" aria-label="How is it going?">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => rate(value)}
            disabled={rated !== null}
            aria-pressed={rated !== null && value <= rated}
            aria-label={value === 1 ? '1 star' : `${value} stars`}
            // 42px because a star is the whole answer and it is pressed once, with a
            // thumb, on the first screen a person meets after being interrupted.
            className="flex h-[42px] w-[42px] items-center justify-center rounded-lg text-gray-300 transition-colors hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-default disabled:hover:text-inherit aria-pressed:text-amber-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8" aria-hidden="true">
              <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.37l-5.81 3.03 1.11-6.47-4.7-4.58 6.5-.95L12 2.5z" />
            </svg>
          </button>
        ))}
      </div>

      {rated === null ? null : (
        <>
          <label className="sr-only" htmlFor="feedback-rating-text">
            Anything to add? Optional
          </label>
          <textarea
            id="feedback-rating-text"
            rows={2}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Anything to add? Optional"
            className="mt-4 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
          {/* Two sentences and not one, because the message has two shapes. Somebody who
              turned the check-in off turned off exactly this: a persistent number leaving
              their device. Putting that number in another message because it suits us
              would undo their decision without telling them. */}
          <p className="mt-2 text-xs text-gray-500" data-testid="feedback-rating-note">
            {withCheckinId
              ? 'It arrives without your name, with the same random number as the check-in.'
              : 'It arrives without your name.'}
          </p>
        </>
      )}
    </Modal>
  )
}
