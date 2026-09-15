import { useState } from 'react'
import { XIcon } from '../ui'
import { useCalendarStore } from '../../store'
import { FEEDBACK_MAILTO, openMailto } from '../../lib/feedbackInvite'

interface FeedbackInviteProps {
  /**
   * Called once the letter has opened, so the slot stays open for the thank-you line
   * after the condition that put the band there has stopped being true.
   */
  onThanked: () => void
}

/**
 * Two weeks in, one invitation to say how it went.
 *
 * A band and not a dialog. The reminder already spends the app's one modal, and that one
 * earns it by giving something the person asked for; this one asks a favour, and a modal
 * turns a favour into a toll — you answer before you see your own calendar. Ignoring it
 * has to be a free and valid answer, which is what a band allows and a modal does not. A
 * toast will not do either: it leaves before it is read and takes the address with it.
 *
 * It appears once in the life of the app, and once means one invitation rather than one
 * drawing: it comes back until it is closed with the X or the email is opened. There is
 * no counter of how many times it was shown, and no record of which of the two happened.
 *
 * Nothing about it is coloured except the link. The status dot rule of the rest of the app
 * holds here too: one green thing at a time, and here that thing is the way out.
 */
export function FeedbackInvite({ onThanked }: FeedbackInviteProps) {
  const markSeen = useCalendarStore((s) => s.markFeedbackInviteSeen)
  const [thanked, setThanked] = useState(false)
  const [failed, setFailed] = useState(false)

  const open = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    // In the app the platform opens the letter, so the webview must not also try to
    // navigate; in a browser the anchor is the only thing that can do it, so it is left
    // alone and openMailto reports success without being asked anything.
    const { isTauri } = await import('@tauri-apps/api/core')
    if (isTauri()) event.preventDefault()

    if ((await openMailto(FEEDBACK_MAILTO)) === 'opened') {
      markSeen()
      setThanked(true)
      onThanked()
      return
    }
    // Not marked: an invitation that never opened has not been answered. The address stays
    // on screen, which is the whole reason this is not a toast.
    setFailed(true)
  }

  // Nothing else to do: marking it seen makes the condition false and the band goes.
  const dismiss = () => markSeen()

  if (thanked) {
    return (
      <p
        className="mb-4 sm:mb-6 text-sm text-gray-500"
        aria-live="polite"
        data-testid="feedback-invite-thanks"
      >
        Thank you. That is open in your email app.
      </p>
    )
  }

  return (
    <section
      aria-labelledby="feedback-invite-title"
      data-testid="feedback-invite"
      className="mb-4 sm:mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-600">
            <span id="feedback-invite-title" className="font-medium text-gray-900">
              Two weeks in.
            </span>{' '}
            How did it go?{' '}
            <a
              href={FEEDBACK_MAILTO}
              onClick={(event) => void open(event)}
              className="rounded font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              data-testid="feedback-invite-link"
            >
              daylo@henfrydls.com
            </a>
          </p>
          {/* Only when there is something to say, and spoken: the address is the way out
              and somebody who cannot see the screen needs it read. */}
          {failed ? (
            <p
              className="mt-1 text-xs text-red-600"
              aria-live="polite"
              data-testid="feedback-invite-note"
            >
              Could not open an email app. Write to daylo@henfrydls.com.
            </p>
          ) : null}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          data-testid="feedback-invite-dismiss"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
    </section>
  )
}
