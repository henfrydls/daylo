import { useMemo, useState } from 'react'
import { subDays } from 'date-fns'
import { useShallow } from 'zustand/react/shallow'
import { useCalendarStore } from '../../store'
import { completedDates } from '../../lib/activityYear'
import { formatDate } from '../../lib/dates'
import { count } from '../../lib/plural'
import { currentStreak, yesterdayStillOpen } from '../../lib/streaks'
import { useTodayDate } from '../../lib/today'

/**
 * What yesterday's sheet says, under the date, on a morning when yesterday is still open.
 *
 * Before anything is ticked, the offer, with the number it will make. Once something is,
 * the same line says that number: the instant of the rescue happens here because this is
 * where the person who has just ticked is looking, and the header with the streak is
 * behind the sheet's veil.
 *
 * Not a different sheet and not a notice: a line only yesterday's sheet has, and only on
 * that morning. Every other sheet, and this one on any other morning, is as it always was.
 */
export function YesterdayLine({ day }: { day: string }) {
  const today = useTodayDate()
  const logs = useCalendarStore(useShallow((state) => state.logs))
  const { promise, streak } = useMemo(() => {
    const done = completedDates(logs)
    return { promise: yesterdayStillOpen(done, today), streak: currentStreak(done, today) }
  }, [logs, today])
  const isYesterday = day === formatDate(subDays(today, 1))

  // Whether the offer was there when this sheet opened. Ticking puts it out, and that is
  // exactly when the line has to say it worked, so it has to be remembered. QuickLog gives
  // this a new key on every opening, so the memory lasts one opening: open the sheet again
  // once yesterday is logged and there is nothing left to say.
  const [offered] = useState(() => isYesterday && promise !== null)

  if (!isYesterday) return null
  if (promise === null && !offered) return null

  return (
    // min-h-10 is the two lines the offer takes at 360px and in the desktop dialog. With
    // the height reserved, the list does not move under the finger at the moment of
    // ticking, which is exactly when the offer turns into the run.
    <div
      className="-mt-2 mb-4 flex min-h-10 items-center"
      aria-live="polite"
      data-testid="yesterday-line"
    >
      {promise !== null ? (
        // sm:text-balance: without it, in the desktop dialog the sentence broke leaving
        // "row." alone on the second line. On the phone it breaks well on its own.
        <p className="text-sm text-gray-600 sm:text-balance">
          <span className="font-medium text-gray-900">Yesterday is still open.</span> Log any
          activity to make {count(promise, 'day', 'days')} in a row.
        </p>
      ) : (
        // gray-900 on emerald-50, 16.85:1: the soft green of the streak in the header.
        <p className="inline-flex min-h-8 items-center rounded-full bg-emerald-50 px-3 text-sm font-medium text-gray-900 tabular-nums">
          {count(streak, 'day', 'days')} in a row
        </p>
      )}
    </div>
  )
}
