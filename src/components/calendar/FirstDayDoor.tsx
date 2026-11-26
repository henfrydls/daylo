import { useContext, type Ref } from 'react'
import { useTodayDate } from '../../lib/today'
import { BesideContext } from '../../lib/beside'

/**
 * Today's number on the Today bar, said the way the grid says it: dashed while today has
 * nothing in it, filled once it has. It used to be filled emerald-500 every day, logged or
 * not, so the strongest green on the screen said something that was not true, and said it
 * at 2.47:1. emerald-700 carries white at 5.36:1; gray-900 on white is 17.74:1.
 */
export function TodayTile({ day, done }: { day: number; done: boolean }) {
  return (
    <div
      data-testid="today-tile"
      className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-bold text-sm ${
        done
          ? 'bg-emerald-700 text-white'
          : 'bg-white border-2 border-dashed border-emerald-700 text-gray-900'
      }`}
    >
      {day}
    </div>
  )
}

interface FirstDayDoorProps {
  /** Goes to today and opens its sheet, which with no activities opens on the form. */
  onOpenToday: () => void
  /** Opens Import, given the link that asked, so focus can go back to it. */
  onImport?: (opener: HTMLElement) => void
  /** The door itself, for whoever has to give it the focus. */
  ref?: Ref<HTMLButtonElement>
}

/**
 * The way in while there are no activities: the Today bar's own box, in its place and at
 * its height, with a second line that says what to do instead of counting nothing. Under
 * it, the backup, for whoever is not on their first day although the app looks like it.
 * Both go with the first activity, made or imported, and come back if the last one is
 * deleted: telling that apart would mean saving something new.
 *
 * Month and Year both show it. It leads to today and not to the month on screen.
 */
export function FirstDayDoor({ onOpenToday, onImport, ref }: FirstDayDoorProps) {
  const today = useTodayDate()
  // The copy drawn in the hidden view beside this one keeps its shape and drops its ids,
  // so each of them is on the page once: the one that works.
  const beside = useContext(BesideContext)
  const id = (name: string) => (beside ? undefined : name)
  return (
    // `month-empty-state`: the name the empty month has always had in the tests.
    <div className="mb-4" data-testid={id('month-empty-state')}>
      <button
        type="button"
        ref={ref}
        onClick={onOpenToday}
        className="w-full flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl min-h-[44px] cursor-pointer transition-colors hover:bg-emerald-100 active:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
        data-testid={id('first-day-door')}
        aria-label="Today: add your first activity"
      >
        <div className="flex items-center gap-3">
          <TodayTile day={today.getDate()} done={false} />
          <div className="text-left">
            <div className="text-sm font-semibold text-gray-900">Today</div>
            {/* gray-600 on emerald-50 is 7.17:1. */}
            <div className="text-xs text-gray-600">Add your first activity</div>
          </div>
        </div>
        <svg
          className="w-5 h-5 shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {/* The link is the finger's 44px: 12 above its line and 12 below, inside the gaps
          that already part it from the door (12) and from the calendar (16), so it reaches
          over neither. No full stop: a link is not a sentence. */}
      {onImport === undefined ? null : (
        <p
          className="mt-3 text-center text-sm text-gray-500"
          data-testid={id('month-empty-import')}
        >
          Used Daylo before?{' '}
          <button
            type="button"
            onClick={(event) => onImport(event.currentTarget)}
            className="-my-3 rounded-lg py-3 font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Import your backup
          </button>
        </p>
      )}
    </div>
  )
}
