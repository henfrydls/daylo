import { useEffect, useRef } from 'react'
import { ConfirmDialog, useToast } from '../ui'
import { useCalendarStore } from '../../store'
import { useReminderOfferOwed, useRemindersAvailable } from '../../hooks'
import { formatDate } from '../../lib/dates'
import {
  disableReminder,
  enableReminder,
  formatReminderTime,
  OFFERED_REMINDER_HOUR,
  reconcileReminder,
  refreshReminder,
} from '../../lib/reminders'

/**
 * Keeps the daily reminder in step with whether there is anything to be reminded about.
 *
 * Everything here follows from the same count. The offer is put once, and only on the
 * second day with something logged (see when it opens, below); the alarm
 * comes down when the last habit goes, because a notification that outlives what it
 * reminds about is how an app gets uninstalled; and it comes back when a habit does.
 *
 * Both the accepted and the declined answer are recorded, so the question is never put
 * again. Closing it without answering is not an answer. The setting in the menu is what
 * somebody uses to change their mind.
 */
interface DailyReminderProps {
  /** Nothing else is open: no day sheet, no Settings, no sheet, no Export or Import. */
  canAsk: boolean
}

export function DailyReminder({ canAsk }: DailyReminderProps) {
  const activityCount = useCalendarStore((state) => state.activities.length)
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

    // When it could not be armed again, usually because the permission was taken away in
    // the phone's settings, the switch goes off and so does the alarm still on the queue.
    // The plugin restores that alarm after a restart, so left there it would ring the day
    // the permission came back, under a switch that says off.
    //
    // Not when the answer is null: something newer, the switch or the last habit going,
    // came in while this was on its way and has decided already. A late "off" acted on here
    // would cancel a reminder somebody had just turned on.
    void refreshReminder(reminderHour, reminderMinute).then((stillOn) => {
      if (stillOn === false) {
        setReminder(false, reminderHour, reminderMinute)
        void disableReminder().catch(() => {})
      }
    })
  }, [available, activityCount, setReminder])

  // Spent only on an answer the phone gave: on, a refused permission, or a refused
  // schedule. A call that threw is not an answer, so the offer stays owed and somebody is
  // told it did not work, the same way a refused schedule is.
  const accept = async () => {
    let outcome
    try {
      ;({ outcome } = await enableReminder(offerHour, offerMinute))
    } catch {
      showToast('Daylo could not set the reminder on this phone', 'error')
      return
    }
    if (outcome === 'unavailable') return
    markReminderOffered()
    if (outcome === 'on') {
      setReminder(true, offerHour, offerMinute)
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

  // When it opens (1.6, approved on 2026-11-02, confirmed and reviewed on 2026-11-15):
  //
  // - Owed, by the one rule in lib/reminders.ts that App also reads: a habit, a second
  //   day of use with a tick, not answered, not closed this session, and after a close
  //   without an answer, only on a later day with a tick.
  // - After something was ticked in this session, with nothing else open (canAsk): the
  //   question is about the moment somebody has just logged, and it does not stack on the
  //   day sheet or whatever closing it leads into.
  // - Tapping beside it or back is not an answer. It puts it off to a later day, and the
  //   third time counts as no. "Not now" and "Turn on" are the answers.
  const owed = useReminderOfferOwed(available)
  const tickedThisSession = useCalendarStore((state) => state._tickedThisSession)
  const dismissReminderOffer = useCalendarStore((state) => state.dismissReminderOffer)
  const closeReminderOffer = useCalendarStore((state) => state.closeReminderOffer)
  // Set by the two answers just before the dialog closes itself, so that the close which
  // follows them is not read as a close without an answer.
  const answered = useRef(false)

  // Three things want a person's attention once, and none of them may talk over another:
  // this offer, the check-in's, and the invitation to write. Whichever opens first takes
  // the session, and the other two stand down until the next one.
  const offerThisSession = useCalendarStore((state) => state._offerThisSession)
  const offerIsOpen = owed && tickedThisSession && canAsk && offerThisSession !== 'checkin'
  const claimOffer = useCalendarStore((state) => state.claimOffer)
  useEffect(() => {
    if (offerIsOpen) claimOffer('reminder')
  }, [offerIsOpen, claimOffer])

  const chosen = useCalendarStore((state) => state.reminderTimeChosen)
  // Theirs if they picked one, ours if nobody has. Somebody who went into Settings and set
  // a time before this was ever put has answered the question already.
  const offerHour = chosen ? hour : OFFERED_REMINDER_HOUR
  const offerMinute = chosen ? minute : 0

  return (
    <ConfirmDialog
      isOpen={offerIsOpen}
      onClose={() => {
        if (answered.current) closeReminderOffer()
        else dismissReminderOffer(formatDate(new Date()))
        answered.current = false
      }}
      onCancel={() => {
        answered.current = true
        markReminderOffered()
      }}
      onConfirm={() => {
        answered.current = true
        void accept()
      }}
      title="Remind me each evening?"
      message={`A notification around ${formatReminderTime(offerHour, offerMinute)} so the day does not go unlogged. Android picks the exact moment. You can change the time or turn it off in Settings.`}
      confirmText="Turn on"
      cancelText="Not now"
      data-testid="reminder-offer"
    />
  )
}
