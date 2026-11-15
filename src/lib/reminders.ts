import {
  cancel,
  isPermissionGranted,
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
/** The earliest and latest the offer will ever propose, when the next hour is no good. */
export const TOO_LATE = 23
export const TOO_EARLY = 7
export const INSTEAD = 20

/**
 * The time to offer somebody who has just made their first activity.
 *
 * The next hour on the hour, because the question is being asked now and the answer should
 * be soon enough to mean something: told at 20:52, a reminder at 21:00 is tonight. A fixed
 * hour chosen when this was written is a reminder somebody has to go and move.
 *
 * Except at night. Between eleven and seven the next hour is a notification nobody wants,
 * so it offers eight in the evening instead: the next time of day somebody would plausibly
 * be told anything. Seven is outside the quiet window on purpose, because being reminded
 * at seven in the morning is a choice people make.
 *
 * That is a rule about the hour offered, so read from the clock it starts an hour earlier:
 * from ten at night until six in the morning the next hour is already in the window, and
 * eight in the evening is what comes back. This paragraph used to give 22:52 as the
 * example of a reminder tonight, which is the one case `does not propose eleven` exists to
 * forbid. Nothing was wrong with the code; the example was.
 */
export function offeredReminderTime(now: Date = new Date()): { hour: number; minute: number } {
  const next = (now.getHours() + 1) % 24
  if (next >= TOO_LATE || next < TOO_EARLY) return { hour: INSTEAD, minute: 0 }
  return { hour: next, minute: 0 }
}

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
 * How close to its time the reminder can arrive, with the build that is installed, on the
 * phone it is installed on.
 *
 * - `inexact`: the build does not ask Android for SCHEDULE_EXACT_ALARM, so Android always
 *   picks the moment and there is nothing to offer. This is the Google Play build: Play asks
 *   for the permission to be justified, its policy asks for inexact alarms when a feature
 *   does not need the minute, and a habit reminder does not. Android does not list such a
 *   build on its "Alarms & reminders" screen, so the screen must not be offered.
 * - `exact`: the build asks, and the phone allows it. Also the answer below Android 12,
 *   where there is nothing to allow, and when the phone could not be asked whether it is
 *   allowed: the only thing that decides is whether to offer a fix, and offering one for a
 *   problem that may not exist is worse than staying quiet.
 * - `denied`: the build asks, and the phone says no, which is where Android 14 and up start.
 *   It still arrives, later, and the screen says so and offers the way to change it.
 *
 * The APK keeps the permission, because an update that dropped it would make Android remove
 * the exact alarm already pending on every phone that allowed it. So the two builds are the
 * same code, and the difference is read from the installed package rather than written into
 * the app: whatever the manifest Gradle merged says, including a permission a library adds,
 * is what this sees.
 */
export type ExactAlarms = 'inexact' | 'exact' | 'denied'

/**
 * Ask the installed build what it requests, and the phone what it allows, and say which of
 * the three that makes. See ExactAlarms.
 *
 * Anything short of a clear answer is `inexact`: no phone to ask, a command that failed, or
 * an answer in a shape this does not know. Those are the words that promise nothing and
 * offer nothing, and they are true of every build on every phone, so a wrong guess in that
 * direction costs a sentence and never a button to a screen Daylo is not on. A failure is
 * also said in the console, because an app that cannot read its own package is a fault to
 * find, not a state to live in.
 */
export async function exactAlarms(): Promise<ExactAlarms> {
  if (!isTauri()) {
    return 'inexact'
  }
  let answer: unknown
  try {
    answer = await invoke('exact_alarms')
  } catch (error) {
    console.error('[Daylo] could not tell whether this build asks for exact alarms', error)
    return 'inexact'
  }
  const { requested, allowed } = (answer ?? {}) as { requested?: unknown; allowed?: unknown }
  if (typeof requested !== 'boolean' || typeof allowed !== 'boolean') {
    console.error('[Daylo] the answer about exact alarms made no sense', answer)
    return 'inexact'
  }
  if (!requested) return 'inexact'
  return allowed ? 'exact' : 'denied'
}

/**
 * Open the phone's own "Alarms & reminders" screen, and say whether it opened.
 *
 * Opening a screen grants nothing. The person decides there, and the app finds out by
 * asking again when it comes back, which is why nothing here waits for an answer.
 */
export async function askForExactAlarms(): Promise<boolean> {
  if (!isTauri()) {
    return false
  }
  try {
    return await invoke<boolean>('ask_for_exact_alarms')
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
        // The zero is load bearing. The plugin's Kotlin builds the next trigger from a
        // calendar made of *now* and sets only the fields it was given, zeroing the
        // milliseconds and leaving the seconds (NotificationSchedule.kt,
        // buildNextTriggerTime). Without this, a reminder set at 21:00:36 fires at
        // 21:00:36 every night: on the minute by accident of when the switch was pressed.
        // Seen on a phone on 2026-10-13 as origWhen=21:00:36.
        schedule: Schedule.interval({ hour, minute, second: 0 }, true),
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
 * The order in which calls change the reminder, and a way to tell a call that it is stale.
 *
 * Opening the app re-arms the reminder, and that takes a few round trips to the phone. Two
 * things can happen during them. Somebody deletes their last habit, the reminder is
 * cancelled, and then the re-arm that was already on its way arrives and schedules it again:
 * the plugin stores it, and it rings every evening, across restarts, over an app with
 * nothing in it. Or somebody turns the switch on, and then the re-arm that started before
 * the permission was given comes back saying it is off, and the screen cancels what was just
 * armed. Each call reaching the phone on its own schedule is what let the older one win.
 *
 * So every call that arms or cancels waits for the ones before it, and the two that run by
 * themselves, the re-arm at launch and the cancel when the habits are gone, stand down when
 * a newer call has come in behind them. The calls somebody makes with the switch always
 * act, in the order they were made.
 *
 * A call that never settles would hold up the ones behind it. Every call here settles on
 * its own except the permission request, which waits for the person to answer, and while
 * that question is on the screen there is nothing else to do.
 */
let issued = 0
let tail: Promise<unknown> = Promise.resolve()

function inTurn<T>(work: (overtaken: () => boolean) => Promise<T>): Promise<T> {
  const turn = ++issued
  const run = tail.then(() => work(() => turn !== issued))
  tail = run.catch(() => {})
  return run
}

/**
 * Turn the daily reminder on at the given local time.
 *
 * The schedule is an interval matching an hour and a minute, which the plugin re-arms by
 * itself each day, and after a restart or an update of Daylo: see refreshReminder.
 * allowWhileIdle is set because without it the alarm will not wake a dozing phone, and an
 * evening reminder that waits for the phone to be picked up is no reminder at all.
 *
 * What it does not buy is punctuality. Without SCHEDULE_EXACT_ALARM the alarm is an
 * inexact one, which Android is free to move within a window of about an hour, and
 * further than that out of a deep doze. Two deliveries measured on the same phone, a
 * Galaxy S24+ on Android 16:
 *
 *   set for 11:00, arrived 12:19, 79 minutes late, phone asleep since the night before
 *   set for 19:00, arrived 19:00, on the minute, phone in use
 *   arrived 4 minutes late, phone in use
 *
 * Which is the behaviour the documentation describes rather than a fault: close when the
 * device is awake, stretched when it has not been. The two on a phone in use came out
 * differently, on the minute once and four minutes late the next, which is what inexact
 * means even at its best, and why the wording says "usually close" rather than a number.
 *
 * Asking for the exact-alarm permission was weighed and refused here and reversed in 1.5.1:
 * Henfry saw other apps arrive on the minute. The APK declares SCHEDULE_EXACT_ALARM and the
 * screen asks `exactAlarms` whether it was granted, because from Android 14 it comes denied
 * by default. The Google Play build, from 1.5.4, does not declare it: every reminder there
 * is the inexact one described above, and so is every reminder on an APK without the grant.
 *
 * The plugin used to re-arm the following days in its receiver with plain RTC, without
 * RTC_WAKEUP and without allowWhileIdle. Daylo builds a patched copy where the first
 * alarm and the re-armed ones decide the same way, which matters to anybody who has not
 * granted the permission too: the re-armed reminder still wakes a dozing phone, inexactly. See
 * `[patch.crates-io]` in src-tauri/Cargo.toml.
 *
 * It will fire whether or not anything was logged that day. Suppressing it on a day
 * already logged would mean cancelling and re-arming from inside the app, and then a
 * person who does not open Daylo for three days stops being reminded on the days they
 * most need it. The wording is neutral for that reason.
 */
export function enableReminder(hour: number, minute: number): Promise<ReminderResult> {
  return inTurn(async () => {
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
  })
}

/**
 * Arm an already-enabled reminder again, without asking for anything.
 *
 * A restart used to take the reminder away until Daylo was opened again, which is what
 * this was first for. The plugin has a receiver for BOOT_COMPLETED that restores whatever
 * is in its own store, and the store was always empty: `show`, the only path the Rust API
 * offers, wrote nothing. The patched copy pinned in src-tauri/Cargo.toml writes it now, and
 * the same receiver also runs when Daylo is updated, so a restart or an update puts the
 * reminder back without the app being opened.
 *
 * Only for a reminder stored by a build with that fix, though. One armed by 1.5.2 or
 * earlier is not in the store until something schedules it again, and this call is that
 * something: opening Daylo once after updating is what makes the reminder restorable. That
 * matters most for an update that stops asking for exact alarms, because Android removes
 * the exact alarm on that update and only the store can bring it back. The APK never makes
 * that update; a phone that moves from the APK to the Google Play build, which does not
 * ask, does.
 *
 * That is also why the APK still declares SCHEDULE_EXACT_ALARM, and only the Google Play
 * build goes without it. Android's AlarmManagerService, on a package replaced, removes the
 * exact alarms of an app that no longer has the permission, without telling it: read in the
 * Android 13 to 16 source, not yet watched on a phone. An APK update that dropped it would
 * leave the store to bring the reminder back, and whoever skipped 1.5.3 has nothing in it.
 *
 * It also puts the switch back in step with the phone: a permission taken away in the
 * system settings leaves nothing scheduled, and this is how the app finds out. Returns
 * whether the reminder is on after the call.
 *
 * It used to be here for a third reason, the re-arming the plugin's receiver did with
 * plain RTC and no idle allowance, which this call undid for the next evening. That is
 * fixed in the plugin now, in the patched copy pinned in src-tauri/Cargo.toml, so this is
 * no longer the only thing standing between a daily reminder and a dozing phone.
 *
 * Null when another call to arm or cancel came in while this one was on its way: it then
 * schedules nothing, and its answer is not acted on, because the newer call decides. See
 * inTurn.
 */
export function refreshReminder(hour: number, minute: number): Promise<boolean | null> {
  return inTurn(async (overtaken) => {
    if (!(await remindersAvailable())) {
      return overtaken() ? null : false
    }
    // Deliberately does not request it. Being asked again on every launch is how an app
    // teaches people to say no.
    if (!(await isPermissionGranted())) {
      return overtaken() ? null : false
    }
    if (overtaken()) {
      return null
    }

    const armed = (await putOnTheQueue(hour, minute)) === null
    return overtaken() ? null : armed
  })
}

/**
 * Turn it off. Silent if it was never on.
 *
 * Cancelling also takes it out of the plugin's store, so a restart cannot bring it back.
 */
export function disableReminder(): Promise<void> {
  return inTurn(async () => {
    if (!(await remindersAvailable())) {
      return
    }
    await cancel([REMINDER_ID])
  })
}

/**
 * Take the reminder down when there is nothing left to be reminded about.
 *
 * Someone who deletes their last activity should not keep getting asked how the day went,
 * and a reminder outliving what it reminds about is the kind of thing that gets an app
 * uninstalled.
 *
 * It used to ask the phone what was scheduled first, and that question was the bug. The
 * plugin answers it from its own store, and that store was only ever written by the Kotlin
 * `batch` path: Daylo schedules through `notify`, which reaches `show`, and `show` wrote
 * nothing. So on a real phone, with the reminder live and ringing every night, `pending()`
 * answered with an empty list, the old condition read that as "nothing of ours is
 * scheduled", and nothing was cancelled. The one case this function exists for was the one
 * case it could not act in, for the whole of its life.
 *
 * It does not ask any more. By the time it runs there is nothing left to be reminded
 * about, so taking the reminder down is the whole of what it came to do, and cancelling
 * one that was never scheduled costs nothing. The old comment argued for exactly this and
 * then wrote a condition that did the opposite.
 *
 * That store is written by `show` now, in the patched plugin, so `pending()` would no
 * longer answer empty. Asking it again would still be a question with nothing to decide;
 * see refreshReminder for what the store is for.
 */
export async function reconcileReminder(activityCount: number): Promise<void> {
  if (activityCount > 0) {
    return
  }
  return inTurn(async (overtaken) => {
    // A habit added back, or the switch touched, while this waited: that call decides.
    if (!(await remindersAvailable()) || overtaken()) {
      return
    }
    // Nothing here may throw. It runs from a screen somebody is looking at, in the moment
    // just after they deleted something, and a failure to cancel is not their problem.
    try {
      await cancel([REMINDER_ID])
    } catch {
      // Deliberately swallowed, and nothing is reported: there is no screen to report it
      // on and nothing the person could do about it.
    }
  })
}
