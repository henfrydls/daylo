import { useEffect, useState } from 'react'
import { XIcon } from '../ui'
import { useCalendarStore } from '../../store'

interface CheckinNoticeProps {
  /** On for a new installation, off for one updating from before the check-in existed. */
  on: boolean
  /** Opens the sheet in the menu, which is where the switch and the message live. */
  onOpen: () => void
}

/**
 * The line that says the check-in exists, once in the life of an installation.
 *
 * A new installation has it on, which is the owner's decision. What the code owes that
 * decision is that nobody finds out later: this appears on the first launch, before
 * anything has to be tapped, in the place the two-week invitation uses, and it says the
 * state in its first three words. The way out is the same line.
 *
 * Somebody updating from an earlier version reads the other half. They installed Daylo
 * when it said it sent nothing anywhere, so the check-in stays off for them and the line
 * offers rather than warns. Both halves name the state in their first three words, and
 * for the same reason: a phone keeps those words and the link, and drops the sentence
 * between them, so a title that only said the name would leave "turn on" as the loudest
 * word on a screen where the check-in is off.
 *
 * A line and not a dialog, for the reason the invitation is one: a person opening their
 * calendar should not have to answer something first. The X closes it and changes
 * nothing about the check-in, which is the honest meaning of a cross.
 */
export function CheckinNotice({ on, onOpen }: CheckinNoticeProps) {
  const markSeen = useCalendarStore((s) => s.markCheckinNoticeSeen)
  const [closed, setClosed] = useState(false)

  // Seen because it was shown, not because it was answered. Somebody who reads it and
  // carries on has been told, and being told again tomorrow would be the app repeating
  // itself at somebody who did nothing wrong. The X is for getting it off the screen now.
  useEffect(() => {
    markSeen()
  }, [markSeen])

  if (closed) return null

  return (
    <section
      aria-labelledby="checkin-notice-title"
      data-testid="checkin-notice"
      className="mb-4 sm:mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-4"
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-sm text-gray-600">
          <span id="checkin-notice-title" className="font-medium text-gray-900">
            {on ? 'Anonymous check-in is on.' : 'Anonymous check-in is off.'}
          </span>{' '}
          {/* The middle sentence is the first thing a narrow screen loses. What is left
              on a phone is the state and the way in, over two lines, which is why the
              state has to be in the title and not in the sentence. */}
          <span className="hidden sm:inline">
            {on
              ? 'It tells us the app is still in use, nothing about what you track. '
              : 'It would tell us the app is still in use, nothing about what you track. '}
          </span>
          <button
            onClick={onOpen}
            className="rounded font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            data-testid="checkin-notice-open"
          >
            {on ? (
              <>
                <span className="sm:hidden">See</span>
                <span className="hidden sm:inline">See or turn off</span>
              </>
            ) : (
              'See and turn on'
            )}
          </button>
        </p>
        <button
          onClick={() => setClosed(true)}
          aria-label="Dismiss"
          className="-m-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          data-testid="checkin-notice-dismiss"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>
    </section>
  )
}
