import { useState } from 'react'
import { useCalendarStore } from '../store'
import { disableReminder, enableReminder, formatReminderTime } from '../lib/reminders'
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

  return {
    enabled,
    hour,
    minute,
    at: formatReminderTime(hour, minute),
    busy,
    failure,
    turnOn,
    turnOff,
    changeTime,
  }
}
