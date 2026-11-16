import { count } from '../../lib/plural'
import { YESTERDAY_RING } from './rings'

interface YesterdayRowProps {
  /** Yesterday's number in the month. */
  day: number
  /** What the streak will say once yesterday is logged. */
  wouldBe: number
  onOpen: () => void
}

/**
 * The second row of the Today bar, only on a morning when yesterday is still open.
 *
 * The same anatomy as the Today row (a day on the left, two lines, the arrow), so it is not
 * a new object but the bar saying one thing more. The day on the left is not the green
 * square of today but the very ring yesterday wears in the grid, with its number, so the
 * row is also the legend of that ring: "12" here, "12" there.
 *
 * No close button. It goes by itself: once yesterday is logged, or tomorrow, because the
 * rule only forgives one day. Without a cross there is no "closed for now" to remember.
 */
export function YesterdayRow({ day, wouldBe, onOpen }: YesterdayRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      // Under Today on the phone, a little lower than it (48px, still what a finger needs)
      // so that the grid is pushed down as little as possible. From 640px the bar has room
      // to spare across, so the row goes beside Today and the grid does not move for it.
      className="flex min-h-12 w-full cursor-pointer items-center justify-between border-t border-emerald-200 bg-white px-3 py-2 text-left transition-colors hover:bg-gray-50 active:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700 sm:w-auto sm:flex-1 sm:border-t-0 sm:border-l sm:py-3"
      data-testid="log-yesterday-row"
    >
      <span className="flex items-center gap-3">
        <span
          className="flex h-9 w-10 shrink-0 items-center justify-center sm:h-10"
          aria-hidden="true"
        >
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${YESTERDAY_RING}`}
            data-testid="yesterday-ring"
          >
            {day}
          </span>
        </span>
        <span>
          <span className="block text-sm font-semibold text-gray-900">Yesterday is still open</span>
          {/* gray-600 on white, 7.56:1. */}
          <span className="block text-xs text-gray-600">
            Log it to make {count(wouldBe, 'day', 'days')} in a row
          </span>
        </span>
      </span>
      <svg
        className="h-5 w-5 shrink-0 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
