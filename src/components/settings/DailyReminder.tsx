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
 * Two things follow from the same count. The offer is put once, and only after a first
 * habit exists, because asking on an empty app is asking about nothing; and the reminder
 * comes down when the last habit goes, because a notification that outlives what it
 * reminds about is how an app gets uninstalled.
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

  useEffect(() => {
    void reconcileReminder(activityCount)
  }, [activityCount])

  // Once, when the app opens and the answer about the platform has arrived. The state is
  // read here rather than watched, because this is about how things stood on opening: a
  // reminder switched on later in the session has just been scheduled by the switch
  // itself. See refreshReminder for what the re-arming is for.
  useEffect(() => {
    if (!available) return
    const { reminderEnabled, reminderHour, reminderMinute } = useCalendarStore.getState()
    if (!reminderEnabled) return

    void refreshReminder(reminderHour, reminderMinute).then((stillOn) => {
      if (!stillOn) {
        setReminder(false, reminderHour, reminderMinute)
      }
    })
  }, [available, setReminder])

  const accept = async () => {
    const outcome = await enableReminder(hour, minute)
    if (outcome === 'on') {
      setReminder(true, hour, minute)
      return
    }
    if (outcome === 'permission-denied') {
      showToast('Daylo needs permission to send notifications', 'error')
    }
  }

  return (
    <ConfirmDialog
      isOpen={available && !offered && activityCount > 0}
      onClose={markReminderOffered}
      onConfirm={() => void accept()}
      title="Remind me each evening?"
      message={`A notification around ${formatReminderTime(hour, minute)} so the day does not go unlogged. You can change the time or turn it off from the menu.`}
      confirmText="Turn on"
      cancelText="Not now"
      data-testid="reminder-offer"
    />
  )
}
