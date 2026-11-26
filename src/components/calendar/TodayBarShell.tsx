import type { ReactNode, Ref } from 'react'
import { TodayTile } from './FirstDayDoor'

interface TodayBarShellProps {
  /**
   * `today`: the green bar that logs today, in the month of today. `quiet`: the white one
   * that brings that month back from any other.
   */
  tone: 'today' | 'quiet'
  /** The day of the month on the square, and whether anything is logged on it. */
  day: number
  done: boolean
  /** The line under "Today". */
  line: ReactNode
  /** Where the bar sits and how its corners go: each caller's own. */
  className: string
  onClick: () => void
  'aria-label': string
  'data-testid': string
  ref?: Ref<HTMLButtonElement>
}

const TONE = {
  today: 'bg-emerald-50 border-emerald-700 hover:bg-emerald-100 active:bg-emerald-100',
  quiet: 'bg-white border-gray-200 hover:bg-gray-50 active:bg-gray-50',
}

// Forward for the bar that opens today, a turn back for the one that brings its month back.
const ARROW = {
  today: 'M9 5l7 7-7 7',
  quiet: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
}

/**
 * The box both Today bars share, so they stay the same size and the calendar under them
 * does not move when one takes the other's place.
 *
 * A permanent 2px edge drawn on the bar's own rounded shape (emerald-700, 5.36:1 on white,
 * on the green one); p-[11px] is p-3 less that extra pixel. The keyboard ring is outside
 * it, a white gap and then emerald-700, and the focused row rises above its neighbour. On
 * the desktop it is reached by Tab.
 */
export function TodayBarShell({
  tone,
  day,
  done,
  line,
  className,
  onClick,
  'aria-label': label,
  'data-testid': testId,
  ref,
}: TodayBarShellProps) {
  return (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className={`relative w-full flex items-center justify-between p-[11px] border-2 min-h-[44px] transition-colors focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${TONE[tone]} ${className}`}
      data-testid={testId}
      aria-label={label}
    >
      <div className="flex items-center gap-3">
        <TodayTile day={day} done={done} />
        <div className="text-left">
          <div className="text-sm font-semibold text-gray-900">Today</div>
          {line}
        </div>
      </div>
      <svg
        className="w-5 h-5 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ARROW[tone]} />
      </svg>
    </button>
  )
}
