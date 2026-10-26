import { useEffect, useRef, useState } from 'react'
import { useCalendarStore } from '../store'
import {
  askForExactAlarms,
  disableReminder,
  enableReminder,
  exactAlarmsAllowed,
  formatReminderTime,
} from '../lib/reminders'
import { useToast } from '../components/ui'

interface DailyReminder {
  enabled: boolean
  hour: number
  minute: number
  /** The time as somebody would say it, for the line under the switch. */
  at: string
  /** True while the platform is being asked, so nothing is pressed twice. */
  busy: boolean
  /** What the phone said when it refused, when it said anything. */
  failure: string | null
  /**
   * Whether it will arrive at the time it was set for. False means it still arrives, but
   * Android is free to move it, so the screen says so and offers the way to change it.
   */
  onTime: boolean
  /** Open the phone's own screen where arriving on time is allowed. */
  askForTime: () => Promise<void>
  turnOn: (hour: number, minute: number) => Promise<boolean>
  turnOff: () => Promise<void>
  changeTime: (hour: number, minute: number) => void
}

/**
 * The daily reminder, as the one place that knows how to turn it on.
 *
 * It lives here because it is now asked for from two screens: the settings, where the
 * switch is, and the sheet that the first-time offer opens. Writing it twice would be
 * writing the refusals twice, and a refusal handled in one place and not the other is a
 * switch that says a reminder is running when the phone declined to schedule it.
 *
 * The store is written **after** the platform agrees, never before. That ordering is the
 * whole safety of this: a refusal leaves the switch where it was.
 */
export function useDailyReminder(): DailyReminder {
  const enabled = useCalendarStore((s) => s.reminderEnabled)
  const hour = useCalendarStore((s) => s.reminderHour)
  const minute = useCalendarStore((s) => s.reminderMinute)
  const setReminder = useCalendarStore((s) => s.setReminder)
  const markChosen = useCalendarStore((s) => s.markReminderTimeChosen)
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // True until something says otherwise, so a phone that cannot be asked is a phone the
  // screen says nothing about.
  const [onTime, setOnTime] = useState(true)
  // What the last answer was, kept out of state so that reading it does not depend on
  // the render a callback was created in.
  const wasOnTime = useRef(true)

  // Only while the reminder is on: there is nothing to say about the punctuality of a
  // reminder nobody has set, and turning it on re-runs this because `enabled` changes.
  //
  // Asked again whenever the app comes back to the front, because the permission is
  // granted on a screen that belongs to the phone and not to Daylo. Coming back is the
  // only moment the app can learn the answer changed, and without it the sheet would go
  // on offering a fix for something already fixed.
  useEffect(() => {
    if (!enabled) return
    let listening = true
    const ask = () => {
      void exactAlarmsAllowed().then((allowed) => {
        if (!listening) return
        // Granting the permission does not touch an alarm that is already pending.
        // Measured on a phone on 2026-10-13: after the permission was given, the alarm
        // set before it was still RTC_WAKEUP with a window of about an hour, and only
        // became exact when the switch was turned off and on by hand. So the one night
        // the person went to the trouble of fixing this was still the night it could
        // arrive late. Setting it again here is what makes the permission take effect
        // when it is given rather than the next time something else reschedules.
        //
        // Only on the change, and only in that direction. Coming back to the front is an
        // ordinary thing that happens many times a day, and replacing a pending alarm on
        // each of them would be churn for nothing.
        const justGranted = !wasOnTime.current && allowed
        wasOnTime.current = allowed
        setOnTime(allowed)
        if (justGranted) {
          // From the store rather than from this closure, which belongs to the render
          // where the effect was set up and would hold the time as it was then.
          const { reminderHour, reminderMinute } = useCalendarStore.getState()
          void enableReminder(reminderHour, reminderMinute)
        }
      })
    }
    ask()
    const onReturn = () => {
      if (document.visibilityState === 'visible') ask()
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      listening = false
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [enabled])

  // Changes take effect as they are made, the way a phone's own settings behave.
  const turnOn = async (nextHour: number, nextMinute: number): Promise<boolean> => {
    setBusy(true)
    try {
      const { outcome, reason } = await enableReminder(nextHour, nextMinute)
      if (outcome === 'on') {
        setFailure(null)
        setReminder(true, nextHour, nextMinute)
        return true
      }
      if (outcome === 'permission-denied') {
        showToast('Daylo needs permission to send notifications', 'error')
      }
      if (outcome === 'failed') {
        showToast('Daylo could not set the reminder on this phone', 'error')
        setFailure(reason ?? 'the phone did not say why')
      }
      setReminder(false, nextHour, nextMinute)
      return false
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async (): Promise<void> => {
    setBusy(true)
    try {
      await disableReminder()
      setFailure(null)
      setReminder(false, hour, minute)
    } finally {
      setBusy(false)
    }
  }

  // While it is on, a new time is scheduled the moment it is picked: the time picker's own
  // OK is the confirmation, and there is nothing left to press. While it is off, the time
  // is only remembered, because there is nothing to reschedule.
  const changeTime = (nextHour: number, nextMinute: number): void => {
    // Said out loud, because the offer needs to know: a time somebody picked is not the
    // time we would have suggested, and proposing our own over theirs would be asking a
    // question they have already answered.
    markChosen()
    if (enabled) {
      void turnOn(nextHour, nextMinute)
      return
    }
    setReminder(false, nextHour, nextMinute)
  }

  // Nothing is awaited beyond the screen opening, and nothing is re-asked here: whatever
  // the person decides over there arrives through the effect above when they come back.
  const askForTime = async (): Promise<void> => {
    await askForExactAlarms()
  }

  return {
    enabled,
    hour,
    minute,
    at: formatReminderTime(hour, minute),
    busy,
    failure,
    onTime,
    askForTime,
    turnOn,
    turnOff,
    changeTime,
  }
}
