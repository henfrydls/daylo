import { useEffect } from 'react'
import { useCalendarStore } from '../store'
import { formatDate } from '../lib/dates'
import { launchedFromReminder, listenForReminderTaps } from '../lib/reminderTap'

/**
 * Open today's sheet when the daily reminder is tapped (#192).
 *
 * A tap is noted in the store as soon as it arrives, by either road (see reminderTap.ts),
 * and answered here once two things are true:
 *
 * - `ready`: the store has been read from disk, so there are habits to show in the sheet.
 * - `shownDay` is the clock's day. A tap the morning after arrives while the app still
 *   shows yesterday, and the moment it notices the new day it closes any sheet that is
 *   open (startNewDay). Opened first, today's sheet would be closed by that a moment later.
 *   Waiting costs nothing: the new day is noticed when the app comes to the front, which is
 *   what a tap does, and this runs again when it is.
 *
 * `clearTheWay` closes what App has open on top of the calendar, Settings or a sheet, so
 * the day sheet is what the tap shows. One function for the life of App, or this runs
 * again on every render.
 */
export function useReminderOpensToday(
  shownDay: string,
  ready: boolean,
  clearTheWay: () => void
): void {
  useEffect(() => {
    const ask = () => useCalendarStore.getState().askToOpenToday()
    void launchedFromReminder().then((yes) => {
      if (yes) ask()
    })
    return listenForReminderTaps(ask)
  }, [])

  const asked = useCalendarStore((state) => state._openTodayAsked)
  useEffect(() => {
    if (!ready || !asked) return
    if (formatDate(new Date()) !== shownDay) return
    clearTheWay()
    useCalendarStore.getState().openToday(shownDay)
  }, [ready, asked, shownDay, clearTheWay])
}
