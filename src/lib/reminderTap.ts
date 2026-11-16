import { addPluginListener, invoke, isTauri, type PluginListener } from '@tauri-apps/api/core'
import { REMINDER_ID } from './reminders'

/**
 * A tap on the daily reminder, which opens today's sheet (#192).
 *
 * The notification says "How did today go? Tap to log it.", and the tap used to open Daylo
 * wherever it had been left, one search and one more tap short of what it promised. The
 * tap reaches the page by one of two roads, depending on whether Daylo was still in memory:
 *
 * - In memory (in the recent apps): Android hands the tap to the running activity, and the
 *   notification plugin turns it into its `actionPerformed` event. listenForReminderTaps.
 * - Not in memory (swiped away, or ended by Android): the tap starts the app, and the plugin
 *   fires the same event while it loads, before the page exists to listen. Tauri drops a
 *   plugin event nobody listens for, so the page asks the native side which notification,
 *   if any, started it. launchedFromReminder.
 */

/** Android, by the one fact the webview already carries. See androidBack.ts for why. */
function onAndroid(): boolean {
  return isTauri() && /Android/i.test(navigator.userAgent)
}

/**
 * Whether an `actionPerformed` event is a tap on the reminder.
 *
 * Not a dismissal, and not a notification with another id. One with no notification on it
 * counts: an alarm armed by a build from before the plugin kept what it scheduled carries
 * no copy of it, and Daylo sends one notification, so the tap is that one.
 */
export function isReminderTap(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const { actionId, notification } = payload as {
    actionId?: unknown
    notification?: { id?: unknown } | null
  }
  if (actionId === 'dismiss') return false
  const id = notification?.id
  return id === undefined || id === null || id === REMINDER_ID
}

let launch: Promise<boolean> | null = null

/**
 * Whether this launch of the app was a tap on the reminder.
 *
 * Asked once a page, and every caller gets that answer: the native side answers only the
 * first question of a process, so that a page loaded again does not open the sheet again
 * for a tap already answered. React running an effect twice would otherwise ask twice and
 * hear "no" the second time, with the first answer thrown away by the effect's cleanup.
 */
export function launchedFromReminder(): Promise<boolean> {
  if (!onAndroid()) return Promise.resolve(false)
  launch ??= invoke<number | null>('launch_notification').then(
    (id) => id === REMINDER_ID,
    () => false
  )
  return launch
}

/** Only for tests, which need each one to start before the page has asked. */
export function forgetTheLaunchForTests(): void {
  launch = null
}

/**
 * Call `onTap` whenever the reminder is tapped while Daylo is in memory, until the returned
 * function is called. Does nothing anywhere but Android, where there is no such event.
 */
export function listenForReminderTaps(onTap: () => void): () => void {
  if (!onAndroid()) return () => {}

  let stopped = false
  let listener: PluginListener | null = null
  addPluginListener('notification', 'actionPerformed', (payload: unknown) => {
    if (isReminderTap(payload)) onTap()
  }).then(
    (registered) => {
      // Told to stop while this was being registered: it goes now, or it would outlive
      // the screen that asked for it.
      if (stopped) void registered.unregister()
      else listener = registered
    },
    (error: unknown) => {
      // Nothing is lost but the shortcut: a tap still opens Daylo where it was.
      console.error('[Daylo] could not listen for taps on the reminder', error)
    }
  )

  return () => {
    if (stopped) return
    stopped = true
    void listener?.unregister()
  }
}
