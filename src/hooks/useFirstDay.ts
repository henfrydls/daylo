import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCalendarStore } from '../store'
import { personFirstDay } from '../lib/firstDay'

/**
 * The person's first day (lib/firstDay, personFirstDay), for every view that counts from
 * it: Month's line, the year's month figures and bar, and "This Month" in the statistics.
 * One hook so a view cannot leave the rule out, and worked out once per change to the
 * records rather than on every press of an arrow.
 */
export function useFirstDay(): string | null {
  const firstOpenedAt = useCalendarStore((state) => state.firstOpenedAt)
  const firstDayKept = useCalendarStore((state) => state.firstDayKept)
  const logs = useCalendarStore(useShallow((state) => state.logs))
  return useMemo(
    () => personFirstDay(firstOpenedAt, logs, firstDayKept),
    [firstOpenedAt, logs, firstDayKept]
  )
}
