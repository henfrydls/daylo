import { useEffect, useState } from 'react'
import { Button, DIALOG_LEAVES_IN, Modal } from '../ui'
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
  /**
   * Called on Send, and only when something was actually written. Resolves true if it
   * left and false if it did not, and the dialog waits on that: the whole reason this
   * replaced a mailto: link is that the old one failed without saying so.
   */
  onComment: (answer: string, text: string) => Promise<boolean>
  /**
   * Whether the message this dialog produces will carry the check-in's random number,
   * which it does when the check-in is on and never when it is off. The line at the
   * bottom says which, so the two have to be given the same fact.
   */
  withCheckinId: boolean
  /**
   * Whether to point this copy at the Microsoft Store's own rating, which is true for a
   * copy installed from the Store that has not been pointed there before.
   *
   * It follows any score and not a good one. Microsoft's own guidance says a rating
   * feature inside an app has to send everybody to the Store whatever they pressed, and
   * sending only the happy ones is what its developer code of conduct calls rating
   * manipulation. Google says the same for Play and its API cannot filter by score at
   * all. So there is no version of this that asks only the people who liked it.
   */
  offerStoreReview: boolean
  /** Open the Store's page for rating Daylo. */
  onStoreReview: () => void
  /** Open a letter to the address in the line, and say so if nothing opened. */
  onWriteToUs: () => void
}

/**
 * How long the stars refuse a press, counted from the moment the question is put.
 *
 * The dialog enters from `opacity-0` over a quarter of a second, and until this it did so
 * with the stars live. A press already on its way, aimed at whatever the question has just
 * covered, was an answer to something nobody had been shown. Here that matters more than
 * anywhere else in the app: this is the only dialog that puts itself rather than being
 * opened, and what it collects is an opinion.
 *
 * The transition's own length and a frame or two, not a round number: what is being waited
 * for is the question being on the screen. It is no answer to a press that comes later,
 * which is a different hole and the reason a second press is allowed to replace the first.
 *
 * `inert` and not a check inside the handler, because the browser enforces it over the
 * whole row for pointer, keyboard and focus alike. jsdom does not enforce it, so what the
 * component test can watch is the attribute going on and coming off.
 */
export const STARS_TAKE_A_PRESS_AFTER = DIALOG_LEAVES_IN + 100

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
  offerStoreReview,
  onStoreReview,
  onWriteToUs,
}: FeedbackRatingProps) {
  // Made here and kept for as long as this is mounted, which is the whole of its life:
  // unmounting is the only way it goes, and the next question makes another one. A number
  // that outlived the dialog would be an identifier, and this one may not be.
  const [answer] = useState(newAnswer)
  const [rated, setRated] = useState<number | null>(null)
  // Taken once, when the score is given, because showing the line is what spends it: the
  // flag behind the prop is marked at the same moment, and a line that vanished while
  // somebody was reading it would be the app taking the offer back.
  const [offeringStore, setOfferingStore] = useState(false)
  // Whether the question is on the screen yet. See STARS_TAKE_A_PRESS_AFTER.
  const [settled, setSettled] = useState(false)
  const [text, setText] = useState('')
  // 'idle' until Send, 'sending' while it is in the air, 'failed' when it did not go.
  // There is no 'sent': that one closes.
  const [sending, setSending] = useState<'idle' | 'sending' | 'failed'>('idle')
  // Only after a wait worth reporting. Measured: a cold request is 200 to 550ms and a
  // warm one about 60, and by the time Send is pressed two messages have already gone, so
  // most of the time nothing is shown at all. Saying "Sending…" instantly would put a
  // word on screen for a tenth of a second on the common path.
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const onScreen = setTimeout(() => setSettled(true), STARS_TAKE_A_PRESS_AFTER)
    return () => clearTimeout(onScreen)
  }, [])

  useEffect(() => {
    onShown(answer)
    // Once per mount, on purpose: this reports that the question was put, and it was put
    // once however many times anything above here re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The tap is the answer. A star followed by a button to confirm it would mean the app
  // has the rating and is holding it hostage for the rest of the form, and the rest of
  // the form is optional.
  //
  // It is not the last word, though, and that is deliberate. The question is put the
  // moment the day sheet closes, and measured on 2026-10-21 its five stars land on five
  // day cells of the month grid at 1280x800: the next press a person makes, meaning to
  // mark another day, answers a question they have not read. A second press replaces the
  // score under the same number, and the panel keeps the last one it was sent.
  const rate = (stars: number) => {
    // Only the first score takes the offer. Reading the prop again would find the parent
    // already saying no, having spent it, and the line would go off the screen while
    // somebody was reading it.
    if (rated === null) setOfferingStore(offerStoreReview)
    setRated(stars)
    onRate(answer, stars)
  }

  const send = async () => {
    const written = text.trim()
    // Nothing typed is not an empty message, it is no message: the star already went.
    if (written === '') {
      onClose()
      return
    }

    setSending('sending')
    setSlow(false)
    const sayItIsSlow = setTimeout(() => setSlow(true), 300)

    const left = await onComment(answer, written)
    clearTimeout(sayItIsSlow)

    if (left) {
      onClose()
      return
    }

    // It stays, with what was written still in the box. The toast this used to raise was
    // drawn underneath the dialog's own portal, so the one message that mattered appeared
    // behind the thing covering it, and the dialog was gone by then anyway.
    setSending('failed')
    setSlow(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={rated === null ? 'How is it going?' : 'Thanks.'}
      data-testid="feedback-rating"
      footer={
        rated === null ? undefined : (
          <Button
            onClick={() => void send()}
            size="lg"
            className="w-full"
            // Pressing twice during the wait would send the comment twice, and two rows
            // in the panel read as two people rather than one double tap.
            disabled={sending === 'sending'}
            data-testid="feedback-rating-send"
          >
            {slow ? 'Sending…' : 'Send'}
          </Button>
        )
      }
    >
      <div
        // The bottom space is the floating button's, and it is there to be empty.
        //
        // On a phone this dialog is a sheet at the bottom edge, and that button lives in
        // the same corner as the fifth star: measured on 2026-10-21, 48 by 48 pixels of
        // overlap at 360 wide, 22 by 48 at 412, 4 by 48 at 448, nothing above that. The
        // button cannot be pressed while this is up and cannot even be seen, because the
        // sheet is opaque over it. What reaches for it is a hand that knows where it was,
        // and what that hand presses is five stars, which is an answer.
        //
        // Hiding the button was tried first and fixes nothing: the star is what is on top,
        // so the press lands on it either way. Two screenshots at 360x740, with the button
        // drawn and not drawn, came out identical. What moves the star out of that corner
        // is space under it.
        //
        // `sm:pb-0` because above that width this is no longer a sheet at the bottom edge
        // but a dialog in the middle of the screen, nowhere near the button, which was
        // measured too: no overlap at 520.
        className="flex justify-center gap-1 pb-20 sm:pb-0"
        role="group"
        aria-label="How is it going?"
        inert={!settled}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => rate(value)}
            aria-pressed={rated !== null && value <= rated}
            aria-label={value === 1 ? '1 star' : `${value} stars`}
            // 56px, and the number is not a preference. Measured on a real phone at
            // 1080/420dpi: the first version drew a 42px button whose visible star came
            // out at about 24dp, half of Android's 48dp minimum for anything you touch.
            // The button is the target and it is now 56dp; the glyph below fills it.
            className="flex h-14 w-14 items-center justify-center rounded-lg text-gray-300 transition-colors hover:text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 aria-pressed:text-amber-400"
          >
            {/* The viewBox is cropped to the path rather than left at 0 0 24 24. With the
                square box the drawing filled about three quarters of it, so a 32px svg
                showed a 24dp star: the glyph was small for a reason nobody could see in
                the CSS. Cropped, what is asked for is what appears. */}
            <svg
              viewBox="1.5 2.5 21 18"
              fill="currentColor"
              className="h-11 w-11"
              aria-hidden="true"
            >
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
          {sending === 'failed' ? (
            <p
              className="mt-2 text-xs text-red-600"
              aria-live="polite"
              data-testid="feedback-rating-failed"
            >
              That did not send. You can try again, or write to daylo@henfrydls.com.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500" data-testid="feedback-rating-note">
            {withCheckinId
              ? 'It arrives without your name, with the same random number as the check-in.'
              : 'It arrives without your name.'}
          </p>
          {offeringStore ? (
            <p className="mt-2 text-sm text-gray-600">
              {'You can also '}
              <button
                type="button"
                onClick={onStoreReview}
                data-testid="feedback-store-review"
                className="rounded text-emerald-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                rate Daylo in the Microsoft Store
              </button>
              .
            </p>
          ) : null}
          {/* Not while the red line is up: that one already carries the address, and the
              same address twice, one of them in red, reads as an instruction rather than
              an invitation. */}
          {sending === 'failed' ? null : (
            <p className="mt-2 text-sm text-gray-600">
              {'Tell us how you use Daylo: '}
              <button
                type="button"
                onClick={onWriteToUs}
                data-testid="feedback-write-to-us"
                className="rounded text-emerald-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                daylo@henfrydls.com
              </button>
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
