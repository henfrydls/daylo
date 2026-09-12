import {
  cancel,
  isPermissionGranted,
  pending,
  requestPermission,
  Schedule,
} from '@tauri-apps/plugin-notification'
import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * One fixed id, so Daylo owns exactly one reminder and can always find it again. Cancelling
 * by id rather than calling cancelAll matters: cancelAll would take down anything else the
 * app ever schedules, and a reminder that quietly removes other notifications is a worse
 * bug than a reminder that fails to appear.
 */
export const REMINDER_ID = 1

const TITLE = 'Daylo'
const BODY = 'How did today go? Tap to log it.'

/**
 * The status-bar icon, named per notification rather than configured.
 *
 * The obvious place for this is `plugins.notification.icon` in tauri.conf.json, and the
 * plugin's Kotlin half does read a config block by that name. Its Rust half does not: it
 * builds with `Builder::new("notification")`, whose config type is the unit `()`, and
 * Tauri deserializes `plugins.notification` into that type while the app starts. A map
 * against a unit is an error, `.run()` turns it into an abort, and the app dies on the
 * first frame with "invalid type: map, expected unit" — which is what a phone did, twice.
 *
 * The per-notification field has no such problem: it goes through the same options object
 * as the title and the schedule, and Android resolves it against res/drawable. A bare
 * resource name is the only form that resolves; a path or an extension silently falls
 * back to the system's ic_dialog_info.
 */
export const REMINDER_ICON = 'ic_notification'

/** 21:00 as the person's own clock would write it, so the text matches what they set. */
export function formatReminderTime(hour: number, minute: number): string {
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export interface ReminderResult {
  outcome: ReminderOutcome
  /**
   * What the phone said when it refused, in its own words. Shown to the person rather
   * than only written to the console: on a release build nothing written to the console
   * leaves the device, because Tauri and wry gate every log line behind BuildConfig.DEBUG.
   */
  reason?: string
}

export type ReminderOutcome =
  /** Scheduled, and the platform said so. */
  | 'on'
  /** The platform refused it. Nothing is scheduled and the switch must not claim it is. */
  | 'failed'
  /** The person said no to notifications. Nothing is scheduled and nothing is asked again. */
  | 'permission-denied'
  /** Not the Android app. Nothing to schedule. */
  | 'unavailable'

/**
 * Whether this build can schedule a reminder at all.
 *
 * Asks the app rather than the user agent, the same way the save dialog does:
 * reminders_available is registered on Android only, so a rejected call means every other
 * platform. Desktop is deliberately out: a notification that only fires while the app is
 * running is not a reminder, and nobody has asked for one.
 */
export async function remindersAvailable(): Promise<boolean> {
  if (!isTauri()) {
    return false
  }
  try {
    return await invoke<boolean>('reminders_available')
  } catch {
    return false
  }
}

/**
 * Put the reminder on the phone's alarm queue, and say whether it got there.
 *
 * Called through invoke rather than through the plugin's own sendNotification, which is
 * where this went wrong: that helper builds a window.Notification, and the polyfill Tauri
 * injects forwards it inside an async function whose promise nobody returns or awaits. A
 * failure on the native side vanished, and the switch stayed on over nothing scheduled.
 * The command is the same one that helper calls, and notification:default allows it.
 *
 * The same id every time, so scheduling again replaces rather than stacks and changing the
 * time cannot leave yesterday's reminder behind.
 */
async function putOnTheQueue(hour: number, minute: number): Promise<string | null> {
  try {
    await invoke('plugin:notification|notify', {
      options: {
        id: REMINDER_ID,
        title: TITLE,
        body: BODY,
        icon: REMINDER_ICON,
        schedule: Schedule.interval({ hour, minute }, true),
      },
    })
    return null
  } catch (error) {
    // Both: the console for a debug build, and the returned text for a release one, where
    // the console goes nowhere. A Tauri command rejects with a string, so this is already
    // readable.
    console.error('[Daylo] the reminder could not be scheduled', error)
    return typeof error === 'string' ? error : ((error as Error)?.message ?? String(error))
  }
}

/**
 * Turn the daily reminder on at the given local time.
 *
 * The schedule is an interval matching an hour and a minute, which Android re-arms by
 * itself and which the plugin restores after a reboot. allowWhileIdle is set because
 * without it the alarm will not wake a dozing phone, and an evening reminder that waits
 * for the phone to be picked up is no reminder at all.
 *
 * It will fire whether or not anything was logged that day. Suppressing it on a day
 * already logged would mean cancelling and re-arming from inside the app, and then a
 * person who does not open Daylo for three days stops being reminded on the days they
 * most need it. The wording is neutral for that reason.
 */
export async function enableReminder(hour: number, minute: number): Promise<ReminderResult> {
  if (!(await remindersAvailable())) {
    return { outcome: 'unavailable' }
  }

  let granted = await isPermissionGranted()
  if (!granted) {
    granted = (await requestPermission()) === 'granted'
  }
  if (!granted) {
    return { outcome: 'permission-denied' }
  }

  const reason = await putOnTheQueue(hour, minute)
  return reason === null ? { outcome: 'on' } : { outcome: 'failed', reason }
}

/**
 * Arm an already-enabled reminder again, without asking for anything.
 *
 * The plugin sets the first alarm with setExactAndAllowWhileIdle on RTC_WAKEUP, but it
 * re-arms every later one from its own receiver with plain RTC, no wakeup and no idle
 * allowance. From the second evening on, a phone in Doze can hold the reminder back until
 * it next wakes. Scheduling it again when Daylo is opened restores the good alarm for the
 * next evening, and it costs one call.
 *
 * It also puts the switch back in step with the phone: a permission taken away in the
 * system settings leaves nothing scheduled, and this is how the app finds out. Returns
 * whether the reminder is on after the call.
 */
export async function refreshReminder(hour: number, minute: number): Promise<boolean> {
  if (!(await remindersAvailable())) {
    return false
  }
  // Deliberately does not request it. Being asked again on every launch is how an app
  // teaches people to say no.
  if (!(await isPermissionGranted())) {
    return false
  }

  return (await putOnTheQueue(hour, minute)) === null
}

/** Turn it off. Silent if it was never on. */
export async function disableReminder(): Promise<void> {
  if (!(await remindersAvailable())) {
    return
  }
  await cancel([REMINDER_ID])
}

/**
 * Take the reminder down when there is nothing left to be reminded about.
 *
 * Someone who deletes their last activity should not keep getting asked how the day went,
 * and a reminder outliving what it reminds about is the kind of thing that gets an app
 * uninstalled. Reads what is actually scheduled rather than trusting stored state, because
 * the two can drift: the phone's own settings can take notifications away.
 */
export async function reconcileReminder(activityCount: number): Promise<void> {
  if (activityCount > 0 || !(await remindersAvailable())) {
    return
  }
  const scheduled = await pending()
  if (scheduled.some((n) => n.id === REMINDER_ID)) {
    await cancel([REMINDER_ID])
  }
}
