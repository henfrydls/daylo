import { useId, useState } from 'react'
import type { CheckinFields } from '../../lib/checkin'
import { today } from '../../lib/checkin'

/**
 * A number that is not anyone's, shown where a real one would be. It is the same number
 * in the dialog every time and belongs to no device, which is the point: the real one
 * does not exist until somebody says yes.
 */
export const EXAMPLE_ID = '4f9c2a7e1b60d3a8c5e2f1b74a9d0c6e'

interface WhatGetsSentProps {
  /** The real version, system and packaging, or null while they are still being asked for. */
  fields: CheckinFields | null
  /** The real number once there is one. Null means this is showing an example. */
  id: string | null
}

/**
 * The whole message, written out, behind a row that has to be opened.
 *
 * Closed by default and not a link: a decision about what a program sends should be
 * answerable without leaving the decision, and the five lines are short enough to put
 * here.
 *
 * Everything the check-in has to say is in here now, which is why it opens into a panel
 * of its own rather than into the list. The switch above it is a switch and nothing else:
 * what it does and what it costs are one tap away, in one place, instead of two lines
 * under the switch and three more behind this row saying overlapping things.
 */
export function WhatGetsSent({ fields, id }: WhatGetsSentProps) {
  const [open, setOpen] = useState(false)
  const contentId = useId()

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="flex min-h-[48px] w-full items-center justify-between py-3 text-left text-gray-900"
        data-testid="checkin-what-gets-sent"
      >
        What gets sent
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-gray-500 transition-transform duration-150 ${
            open ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m9 5 7 7-7 7" />
        </svg>
      </button>

      {open ? (
        // A panel rather than more list, because what is in here is one thing: a sentence,
        // the message it describes, and what undoing it costs. Read together they answer
        // the question the row asks; spread down the list they read as five more settings.
        <div
          id={contentId}
          className="mb-1 space-y-3 rounded-[10px] bg-gray-50 px-3.5 py-3 text-sm text-gray-600"
        >
          <p>
            Once a day, it tells us the app is still in use. Nothing about you or what you track.
          </p>

          <dl className="space-y-1">
            {[
              ['Random number', id ?? EXAMPLE_ID],
              ['App version', fields?.version ?? ''],
              ['System', fields?.os ?? ''],
              // Where the copy came from, in the same order the message carries it. Two
              // people who installed the same file send the same word, which is why it
              // can be here at all.
              ['How it was installed', fields?.source ?? ''],
              ['Date', today()],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-gray-900">{label}</dt>
                <dd className="min-w-0 break-all">{value}</dd>
              </div>
            ))}
          </dl>

          {/* The one statement of its kind anywhere in the app, and the reason it is in
              here rather than only in the policy: this panel is where the long version
              goes. What was dropped alongside it was where the number is made, which the
              line above already says by showing it. */}
          <p>
            Like any website, our server sees your connection&apos;s address and does not keep it.
          </p>

          <p>Turning it off deletes the random number.</p>
        </div>
      ) : null}
    </div>
  )
}
