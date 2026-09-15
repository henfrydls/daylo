import { useEffect } from 'react'
import { ConfirmDialog, useToast } from '../ui'
import { useCalendarStore } from '../../store'
import { useRemindersAvailable } from '../../hooks'
import {
  enableReminder,
  formatReminderTime,
  reconcileReminder,
  refreshReminder,
} from '../../lib/reminders'

/**
 * Keeps the daily reminder in step with whether there is anything to be reminded about.
 *
 * Everything here follows from the same count. The offer is put once, and only after a
 * first habit exists, because asking on an empty app is asking about nothing; the alarm
 * comes down when the last habit goes, because a notification that outlives what it
 * reminds about is how an app gets uninstalled; and it comes back when a habit does.
 *
 * Both the accepted and the declined answer are recorded, so the question is never put
 * again. The setting in the menu is what somebody uses to change their mind.
 */
export function DailyReminder() {
  const activityCount = useCalendarStore((state) => state.activities.length)
  const offered = useCalendarStore((state) => state.reminderOffered)
  const hour = useCalendarStore((state) => state.reminderHour)
  const minute = useCalendarStore((state) => state.reminderMinute)
  const setReminder = useCalendarStore((state) => state.setReminder)
  const markReminderOffered = useCalendarStore((state) => state.markReminderOffered)
  const available = useRemindersAvailable()
  const { showToast } = useToast()

  // One rule, applied when the app opens and again whenever the number of activities
  // changes: something is scheduled exactly when the reminder is on and there is anything
  // to be reminded about.
  //
  // The switch itself is a wish, not a schedule, which is why deleting the last habit
  // takes the alarm down and leaves the switch alone: nobody changed their mind about
  // evenings, and adding a habit back brings the reminder back with it.
  //
  // The stored state is read here rather than watched, so that turning the switch on
  // mid-session does not run this as well; that path has just scheduled the reminder
  // itself. See refreshReminder for what the re-arming is for.
  useEffect(() => {
    if (!available) return
    if (activityCount === 0) {
      void reconcileReminder(activityCount)
      return
    }

    const { reminderEnabled, reminderHour, reminderMinute } = useCalendarStore.getState()
    if (!reminderEnabled) return

    void refreshReminder(reminderHour, reminderMinute).then((stillOn) => {
      if (!stillOn) {
        setReminder(false, reminderHour, reminderMinute)
      }
    })
  }, [available, activityCount, setReminder])

  const accept = async () => {
    const { outcome } = await enableReminder(hour, minute)
    if (outcome === 'on') {
      setReminder(true, hour, minute)
      return
    }
    if (outcome === 'permission-denied') {
      showToast('Daylo needs permission to send notifications', 'error')
    }
    // The phone had the permission and still would not take it. Saying nothing would
    // leave a switch that looks on over a reminder that will never arrive.
    if (outcome === 'failed') {
      showToast('Daylo could not set the reminder on this phone', 'error')
    }
  }

  // Three things want a person's attention once, and none of them may talk over another:
  // this offer, the check-in's, and the two-week invitation. Whichever opens first takes
  // the session, and the other two stand down until the next one.
  const offerThisSession = useCalendarStore((state) => state._offerThisSession)
  const offerIsOpen = available && !offered && activityCount > 0 && offerThisSession !== 'checkin'
  const claimOffer = useCalendarStore((state) => state.claimOffer)
  useEffect(() => {
    if (offerIsOpen) claimOffer('reminder')
  }, [offerIsOpen, claimOffer])

  return (
    <ConfirmDialog
      isOpen={offerIsOpen}
      onClose={markReminderOffered}
      onConfirm={() => void accept()}
      title="Remind me each evening?"
      message={`A notification around ${formatReminderTime(hour, minute)} so the day does not go unlogged. Android picks the exact moment. You can change the time or turn it off from the menu.`}
      confirmText="Turn on"
      cancelText="Not now"
      data-testid="reminder-offer"
    />
  )
}
