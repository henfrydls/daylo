import { useEffect, useRef } from 'react'
import { parseDateString } from '../../lib/dates'
import { isBestEver, lastDays } from '../../lib/streaks'
import { onAndroidBack } from '../../lib/androidBack'
import { useCountsAsOpenDialog } from '../../hooks'

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export interface StreakDetailsProps {
  /** The run as the chip says it. Never 0 in the app: with no run there is no chip. */
  streak: number
  /** The longest there has ever been. */
  best: number
  todayDone: boolean
  /** Every day with something logged. */
  done: ReadonlySet<string>
  /** The day on screen, which is what "today" means everywhere in the header. */
  now: Date
}

/**
 * What is behind the chip: the run, the best there has been, and the last two weeks.
 *
 * The same content on a phone and on a desktop; what differs is the surface around it (a
 * sheet from the bottom edge, a panel under the chip), and that is decided by whoever
 * mounts this.
 *
 * Nothing here can be pressed. It is something to look at, which is why it has no button
 * of its own and why closing it belongs to the surface.
 */
export function StreakDetails({ streak, best, todayDone, done, now }: StreakDetailsProps) {
  // Fourteen days ending today, in two rows of seven. Because a row is a week long, each
  // column is one day of the week in both rows, so the letters above them are true, and
  // today is always the last cell.
  const fortnight = lastDays(done, now, 14).map((day) => ({
    ...day,
    on: parseDateString(day.date),
  }))
  const logged = fortnight.filter((day) => day.done).length

  return (
    <div data-testid="streak-details">
      <p className="text-sm text-gray-600">
        {todayDone ? 'Today is in.' : 'Today is not logged yet.'}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        <Tile value={streak} label="Right now" testId="streak-tile-now" />
        {/* The one rule about words in here. When the run going now is the best there has
            been, "Longest" beside the same number reads as a second fact; it is the same
            fact, and the tile says so. */}
        <Tile
          value={best}
          label={isBestEver(streak, best) ? 'Your best ever' : 'Longest'}
          testId="streak-tile-best"
        />
      </div>

      <p className="mt-4 text-xs font-semibold tracking-wider text-gray-500 uppercase">
        Last 14 days
      </p>
      <div
        className="mt-1 grid grid-cols-7"
        role="img"
        aria-label={`Last 14 days: something logged on ${logged} of them`}
      >
        {fortnight.slice(0, 7).map((day) => (
          <span
            key={`letter-${day.date}`}
            data-testid="streak-weekday"
            className="flex h-6 items-center justify-center text-xs font-semibold text-gray-500"
            aria-hidden="true"
          >
            {WEEKDAY[day.on.getDay()]}
          </span>
        ))}
        {fortnight.map((day) => (
          <span
            key={day.date}
            className="flex h-10 items-center justify-center"
            aria-hidden="true"
            data-testid="streak-day"
            data-done={day.done}
            data-today={day.isToday}
          >
            {/* The month grid's own rule, on fourteen days instead of one: filled is a
                day with something logged, dashed is today while it has nothing.
                emerald-700 carries white at 5.36:1; an empty day is gray-500 on white,
                4.84:1. */}
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium tabular-nums sm:text-sm ${
                day.done
                  ? 'bg-emerald-700 text-white'
                  : day.isToday
                    ? 'border-2 border-dashed border-emerald-700 text-gray-900'
                    : 'text-gray-500'
              }`}
            >
              {day.on.getDate()}
            </span>
          </span>
        ))}
      </div>

      <p className="mt-3 pb-1 text-xs text-gray-600">A day counts once you log any activity.</p>
    </div>
  )
}

/** The Statistics tile, so the two numbers here read like the ones in the panel. */
function Tile({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3" data-testid={testId}>
      <div className="text-xl font-bold text-gray-900 tabular-nums sm:text-2xl">
        {value}{' '}
        <span className="text-sm font-medium text-gray-600">{value === 1 ? 'day' : 'days'}</span>
      </div>
      <div className="text-xs text-gray-600 sm:text-sm">{label}</div>
    </div>
  )
}

interface StreakPanelProps extends StreakDetailsProps {
  /** Closes it. `giveFocusBack` is whether the chip should take the focus again. */
  onClose: (giveFocusBack: boolean) => void
}

/**
 * The same thing on a wide screen: a panel hanging from the chip.
 *
 * Not a dialog in the middle of the window. It is two numbers and two rows of days, read
 * in a couple of seconds, and dimming a whole 1200px window for that would be the app
 * making an occasion out of a glance. Hanging from the chip it also leaves the month in
 * view beside it, which is the other half of what it is talking about.
 *
 * It goes on Escape (and Android's back, on a tablet wide enough to get the panel), on a
 * press anywhere else, when the focus leaves it, and on pressing the chip again. Focus
 * moves into it when it opens, so a keyboard and a screen reader land on what just
 * appeared, and the chip gets it back unless something else has just taken it.
 *
 * It counts as an open dialog while it is up, like the sheet does through Modal, so the
 * reminder's offer does not open over it.
 */
export function StreakPanel({ onClose, ...details }: StreakPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useCountsAsOpenDialog(true)

  // Kept in a ref so the listeners below are added once and not on every render of the
  // header, which happens on every tick.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const panel = panelRef.current
    panel?.focus()
    // The panel and the chip share a parent, so a press on the chip is not "outside": the
    // chip's own press closes it, and closing it here first would open it again.
    const wrapper = panel?.parentElement

    const onPress = (event: MouseEvent) => {
      if (wrapper?.contains(event.target as Node)) return
      // Whatever was pressed decides where the focus goes. Something that takes it (the
      // gear, a day) keeps it; a press on nothing in particular leaves it on the page,
      // and then the chip takes it back. Read after the press has moved it.
      close.current(false)
      setTimeout(() => {
        const at = document.activeElement
        if (at === null || at === document.body) {
          wrapper?.querySelector<HTMLElement>('[data-testid="streak-chip"]')?.focus()
        }
      }, 0)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current(true)
    }
    document.addEventListener('mousedown', onPress)
    document.addEventListener('keydown', onKey)
    const stopBack = onAndroidBack(() => close.current(true))
    return () => {
      document.removeEventListener('mousedown', onPress)
      document.removeEventListener('keydown', onKey)
      stopBack()
    }
  }, [])

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Your streak"
      tabIndex={-1}
      data-testid="streak-panel"
      // The shell is the menu's: white, the same border, the same shadow, hanging from the
      // right edge of what opened it. The fade is the view's own, and only for somebody
      // who has not asked for less movement.
      className="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-lg focus:outline-none motion-safe:animate-[view-fade_150ms_ease_both]"
    >
      <h2 className="mb-1 text-base font-semibold text-gray-900">Your streak</h2>
      <StreakDetails {...details} />
    </div>
  )
}
