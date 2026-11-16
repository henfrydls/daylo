import { useCalendarStore } from '../store'
import { reminderOfferOwed } from '../lib/reminders'

/**
 * Whether the reminder offer is owed, from the store, through the one rule in
 * lib/reminders.ts. DailyReminder opens it from this and App holds the invitation to write
 * back behind it from this, so the two read the same thing.
 */
export function useReminderOfferOwed(available: boolean): boolean {
  const offered = useCalendarStore((s) => s.reminderOffered)
  const activityCount = useCalendarStore((s) => s.activities.length)
  const tickDays = useCalendarStore((s) => s.reminderTickDays)
  const lastTickDay = useCalendarStore((s) => s.reminderLastTickDay)
  const dismissedOn = useCalendarStore((s) => s.reminderOfferDismissedOn)
  const closedThisSession = useCalendarStore((s) => s._reminderOfferClosed)
  return reminderOfferOwed({
    available,
    offered,
    activityCount,
    tickDays,
    lastTickDay,
    dismissedOn,
    closedThisSession,
  })
}
