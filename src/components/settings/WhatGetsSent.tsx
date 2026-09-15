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
  /** The real version and system, or null while they are still being asked for. */
  fields: CheckinFields | null
  /** The real number once there is one. Null means this is showing an example. */
  id: string | null
}

/**
 * The whole message, written out, behind a row that has to be opened.
 *
 * Closed by default and not a link: a decision about what a program sends should be
 * answerable without leaving the decision, and the four lines are short enough to put
 * here. The same row appears in the dialog and in the settings sheet, with the same
 * words, so that what was agreed to and what is happening are visibly the same thing.
 */
export function WhatGetsSent({ fields, id }: WhatGetsSentProps) {
  const [open, setOpen] = useState(false)
  const contentId = useId()

  return (
    <div className="mt-4 rounded-lg border border-gray-200">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left text-sm text-gray-700"
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
        <div id={contentId} className="space-y-3 px-4 pb-4 text-sm text-gray-600">
          <dl className="space-y-1">
            {[
              ['Random number', id ?? EXAMPLE_ID],
              ['App version', fields?.version ?? ''],
              ['System', fields?.os ?? ''],
              ['Date', today()],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap gap-x-3">
                <dt className="w-32 shrink-0 text-gray-500">{label}</dt>
                <dd className="min-w-0 font-mono break-all text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>

          <p>
            Made on this device, tied to nothing, and deleted if you turn this off. Your habits and
            notes are never part of it.
          </p>
          <p>
            Like any website, our server sees your connection&apos;s address and does not keep it.
          </p>
        </div>
      ) : null}
    </div>
  )
}
