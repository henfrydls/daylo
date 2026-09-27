import { useEffect } from 'react'
import { RefreshIcon, XIcon } from '../ui'
import { useCalendarStore } from '../../store'

/**
 * What the app says about a newer version, and nothing more than that.
 *
 * The same card as the check-in's line, in the same place, for a reason that is a rule and
 * not a coincidence: there is one way this app tells somebody something, and a second
 * shape would make the first one mean less. A dialog was considered and rejected, and the
 * test for choosing between the two is whether an answer is wanted. The question with
 * stars wants one, so it interrupts. This does not: whoever does not care about updating
 * should be able to read straight past it.
 *
 * It says nothing at all in two cases, and neither is an error: a copy from the Microsoft
 * Store, which the Store keeps up to date, and a check that failed without anybody asking.
 */

/** Everything the card can be showing, which is the whole of this piece. */
export type UpdateState =
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number | null }
  | { kind: 'installing' }
  | { kind: 'restart' }
  /** A format the updater cannot replace in place, so it points at the downloads page. */
  | { kind: 'elsewhere'; version: string }
  | { kind: 'unverified' }
  | { kind: 'download-failed' }
  | { kind: 'install-failed' }

interface UpdateNoticeProps {
  state: UpdateState
  /** Pressed on "Update", and on "Restart" when a relaunch did not happen by itself. */
  onAct: () => void
  /** The X, which means later rather than no: the dot in the menu keeps the offer. */
  onLater: () => void
}

/** The sentence, the action, and whether the X is there. One row per state, on purpose. */
function saying(state: UpdateState): { text: string; action?: string; canDismiss: boolean } {
  switch (state.kind) {
    case 'available':
      return { text: `Daylo ${state.version} is out.`, action: 'Update', canDismiss: true }
    case 'downloading':
      return {
        text: state.percent === null ? 'Downloading…' : `Downloading… ${state.percent}%`,
        canDismiss: false,
      }
    // One sentence for all three systems. On Windows the installer closes the app and
    // opens it again; on macOS and the AppImage the app relaunches itself once the
    // install returns. Saying it only on Windows would have been true and would have left
    // the other two closing without warning.
    case 'installing':
      return { text: 'Installing. Daylo will close and open again.', canDismiss: false }
    // Only reached when the relaunch did not happen. It is a net, not a step.
    case 'restart':
      return { text: 'Done. Restart Daylo to finish.', action: 'Restart', canDismiss: true }
    case 'elsewhere':
      return {
        text: `Daylo ${state.version} is out.`,
        action: 'Get it from the downloads page',
        canDismiss: true,
      }
    // The download arrived and was not signed by the key inside this app. Said plainly,
    // and with what did not happen, because "could not be verified" alone leaves somebody
    // wondering whether their app is now half replaced.
    case 'unverified':
      return {
        text: 'That update could not be verified, so nothing was installed.',
        canDismiss: true,
      }
    case 'download-failed':
      return { text: 'That did not download. You can try again later.', canDismiss: true }
    case 'install-failed':
      return {
        text: 'That did not install. Daylo is still on the version you had.',
        canDismiss: true,
      }
  }
}

export function UpdateNotice({ state, onAct, onLater }: UpdateNoticeProps) {
  const markSeen = useCalendarStore((s) => s.markUpdateNoticeSeen)
  const version = state.kind === 'available' || state.kind === 'elsewhere' ? state.version : null

  // Seen because it was shown. Somebody who reads it and carries on has been told, and the
  // same card tomorrow would be the app repeating itself at somebody who did nothing
  // wrong. By version, so the next release gets its own turn.
  useEffect(() => {
    if (version !== null) markSeen(version)
  }, [version, markSeen])

  const { text, action, canDismiss } = saying(state)

  return (
    <section
      aria-labelledby="update-notice-text"
      data-testid="update-notice"
      className="mb-4 sm:mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:px-5 sm:py-4"
    >
      {/* min-h-7 so the row keeps its height when the cross goes: without it the card
          drops from 54 to 46 pixels the moment a download starts, and the page under it
          jumps. Measured at 360 and 1440. */}
      <div className="flex min-h-7 items-start gap-3">
        {/* The same icon as its menu entry, so the two are recognisably one thing. In the
            grey the crosses use since the contrast fix, not the lighter one. */}
        <RefreshIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-gray-600">
          <span id="update-notice-text" className="font-medium text-gray-900">
            {text}
          </span>{' '}
          {action === undefined ? null : (
            <button
              onClick={onAct}
              className="rounded font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              data-testid="update-notice-action"
            >
              {action}
            </button>
          )}
        </p>
        {canDismiss ? (
          <button
            onClick={onLater}
            aria-label="Later"
            className="-m-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            data-testid="update-notice-later"
          >
            <XIcon className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </section>
  )
}
