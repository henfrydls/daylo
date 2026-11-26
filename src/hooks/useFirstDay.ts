import { useShallow } from 'zustand/react/shallow'
import { useCalendarStore } from '../store'
import { personFirstDay } from '../lib/firstDay'
import { formatDate } from '../lib/dates'
import { useTodayDate } from '../lib/today'

/**
 * The person's first day (lib/firstDay, personFirstDay), for every view that counts from
 * it: Month's line, the year's month figures and bar, and "This Month" in the statistics.
 * One hook so a view cannot leave the rule out. Never later than the app's today.
 */
export function useFirstDay(): string | null {
  const firstOpenedAt = useCalendarStore((state) => state.firstOpenedAt)
  const firstDayKept = useCalendarStore((state) => state.firstDayKept)
  const logs = useCalendarStore(useShallow((state) => state.logs))
  const today = formatDate(useTodayDate())
  return personFirstDay(firstOpenedAt, logs, firstDayKept, today)
}
