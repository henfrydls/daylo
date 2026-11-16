import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog, useToast } from '../ui'
import { useCalendarStore } from '../../store'
import { useOpenDialogs, useReminderOfferOwed, useRemindersAvailable } from '../../hooks'
import { formatDate } from '../../lib/dates'
import { useToday } from '../../lib/today'
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
/**
 * Arm the reminder again at its stored time, and when it can no longer be armed, usually
 * because the permission was taken away in the phone's settings, turn the switch off and
 * take down the alarm still on the queue. The plugin restores that alarm after a restart,
 * so left there it would ring the day the permission came back, under a switch that says
 * off.
 *
 * Not when the answer is null: something newer, the switch or the last habit going, came
 * in while this was on its way and has decided already, or the phone did not say whether
 * notifications are allowed. A late "off" acted on here would cancel a reminder somebody
 * had just turned on.
 */
function armAgain(hour: number, minute: number): void {
  void refreshReminder(hour, minute).then((stillOn) => {
    if (stillOn === false) {
      useCalendarStore.getState().setReminder(false, hour, minute)
      void disableReminder().catch(() => {})
    }
  })
}

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

    armAgain(reminderHour, reminderMinute)
  }, [available, activityCount])

  // Whether today is logged decides when the reminder next rings: tomorrow when it is, today
  // when it is not and its time has not come yet (#192). So it is armed again when that
  // changes within a day: the first tick of the day, and the last one taken off. Not on the
  // first answer, which the effect above has just armed with, and not for ticks that leave
  // it as it was. Not when the day itself changes either: a day logged yesterday armed the
  // reminder from midnight, which is now, so the phone already has today's ring.
  const today = useToday()
  const loggedToday = useCalendarStore((state) =>
    state.logs.some((log) => log.completed && log.date === today)
  )
  const before = useRef<{ day: string } | null>(null)
  useEffect(() => {
    if (!available) return
    const was = before.current
    before.current = { day: today }
    // Within a day this runs only when loggedToday changed: it is the one dependency left
    // that can, `available` turns true once, and that first run is the one with nothing
    // before it.
    if (was === null || was.day !== today) return

    const { reminderEnabled, reminderHour, reminderMinute, activities } =
      useCalendarStore.getState()
    if (!reminderEnabled || activities.length === 0) return
    armAgain(reminderHour, reminderMinute)
  }, [available, today, loggedToday])

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
    // Not an answer either: the phone said reminders do not exist here after all. Said, so
    // that "Turn on" does not close on nothing, and left owed.
    if (outcome === 'unavailable') {
      showToast('Daylo could not set the reminder on this phone', 'error')
      return
    }
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
  // - After something was ticked in this session, with nothing else open: canAsk from App,
  //   and no other dialog anywhere (useOpenDialogs). The question is about the moment
  //   somebody has just logged, and it does not stack on the day sheet or whatever
  //   closing it leads into.
  // - Once open it stays until it is answered or closed, whatever opens behind it.
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
  const otherDialogs = useOpenDialogs((state) => state.open)
  const mayOpen =
    owed && tickedThisSession && canAsk && otherDialogs === 0 && offerThisSession !== 'checkin'
  // Latched: whether it may open is checked to open it, not to keep it open. Its own
  // dialog counts in useOpenDialogs, and canAsk can change under it; either would
  // otherwise take it away without an answer, and bring it back later in the session.
  const [offerIsOpen, setOfferIsOpen] = useState(false)
  if (mayOpen && !offerIsOpen) setOfferIsOpen(true)
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
      // The dialog stays in the page while it leaves, and its backdrop still takes taps.
      // Everything after the first close is ignored until it opens again: a double tap is
      // one close, and a stray tap after an answer is not a close without one.
      onClose={() => {
        if (!offerIsOpen) return
        if (answered.current) closeReminderOffer()
        else dismissReminderOffer(formatDate(new Date()))
        answered.current = false
        setOfferIsOpen(false)
      }}
      onCancel={() => {
        if (!offerIsOpen) return
        answered.current = true
        markReminderOffered()
      }}
      onConfirm={() => {
        if (!offerIsOpen) return
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
