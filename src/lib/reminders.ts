import { cancel, Schedule } from '@tauri-apps/plugin-notification'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useCalendarStore } from '../store'
import { formatDate } from './dates'
import type { ActivityLog } from '../types'

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
   * The phone did not say whether Daylo may send notifications, within
   * PERMISSION_PATIENCE_MS. Nothing is asked and nothing is scheduled: not an answer from
   * the person or the phone, so nothing about the reminder is decided on it.
   */
  | 'unanswered'

/**
 * Whether this build can schedule a reminder at all.
 *
 * Asks the app rather than the user agent, the same way the save dialog does:
 * reminders_available is registered on Android only, so a rejected call means every other
 * platform. Desktop is deliberately out: a notification that only fires while the app is
 * running is not a reminder, and nobody has asked for one.
 */
/**
 * The time the offer proposes: nine in the evening (1.6, approved on 2026-11-02).
 *
 * It used to be the next hour on the hour, so somebody asked at two in the afternoon was
 * offered three, a reminder for a day they had already logged. Nine is late enough that
 * the day has happened and early enough to still log it.
 */
export const OFFERED_REMINDER_HOUR = 21

/** What the offer's rule reads. */
export interface ReminderOfferFacts {
  available: boolean
  /** The reminder is on now, whatever turned it on. */
  enabled: boolean
  offered: boolean
  activityCount: number
  lastTickDay: string | null
  dismissedOn: string | null
  closedThisSession: boolean
}

/**
 * Whether the reminder offer is owed: it may be asked, and has not been answered. The one
 * rule, read by DailyReminder to open it and by App to hold the invitation to write back
 * behind it, so the two cannot disagree.
 *
 * - Not on already. Turning it on or off in Settings marks the offer as answered, and so
 *   does the phone turning it off (useDailyReminder, armAgain), so this is only for a copy
 *   that turned it on in Settings before that mark was kept: while it is on, it is not asked.
 * - A habit. The first one is enough: the offer comes on the day it is made, once the
 *   sheet it was made in has closed (DailyReminder waits for that).
 * - Not answered: "Not now" and "Turn on" answer it, and so does a third close without
 *   an answer.
 * - Not closed in this session, answered or not.
 * - Closed without an answer on some day: owed again only after a tick on a later day.
 *   Never the same day.
 */
export function reminderOfferOwed(facts: ReminderOfferFacts): boolean {
  if (!facts.available || facts.offered || facts.closedThisSession) return false
  if (facts.enabled) return false
  if (facts.activityCount === 0) return false
  if (facts.dismissedOn === null) return true
  // YYYY-MM-DD compares as it reads.
  return facts.lastTickDay !== null && facts.lastTickDay > facts.dismissedOn
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
 * - `inexact`: Android 12 or later, and the build does not ask Android for
 *   SCHEDULE_EXACT_ALARM, so Android picks the moment and there is nothing to offer. This is
 *   the Google Play build: Play asks for the permission to be justified, its policy asks for
 *   inexact alarms when a feature does not need the minute, and a habit reminder does not.
 *   Android does not list such a build on its "Alarms & reminders" screen, so the screen
 *   must not be offered.
 * - `exact`: below Android 12, for every build, because there is no permission to have yet
 *   and the notification plugin arms an exact alarm for all of them (Arming.kt in the fork
 *   pinned in src-tauri/Cargo.toml: `armsExact(sdk, declares, can) = sdk < S || (declares
 *   && can)`); this follows the same rule so the words match what the phone does. From
 *   Android 12, the build asks and the phone allows it, or the phone could not be asked
 *   whether it is allowed: the only thing that decides is whether to offer a fix, and
 *   offering one for a problem that may not exist is worse than staying quiet.
 * - `denied`: Android 12 or later, the build asks, and the phone says no, which is where
 *   Android 14 and up start. It still arrives, later, and the screen says so and offers the
 *   way to change it.
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
 * offer nothing, so a wrong guess in that direction costs a sentence and never a button to
 * a screen Daylo is not on. A failure is also said in the console, because an app that
 * cannot read its own package is a fault to find, not a state to live in.
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
  const { requested, allowed, sdk } = (answer ?? {}) as {
    requested?: unknown
    allowed?: unknown
    sdk?: unknown
  }
  if (
    typeof requested !== 'boolean' ||
    typeof allowed !== 'boolean' ||
    typeof sdk !== 'number' ||
    !Number.isInteger(sdk)
  ) {
    console.error('[Daylo] the answer about exact alarms made no sense', answer)
    return 'inexact'
  }
  if (sdk < EXACT_ALARMS_NEED_PERMISSION_FROM) return 'exact'
  if (!requested) return 'inexact'
  return allowed ? 'exact' : 'denied'
}

/** Android 12, API 31, where an exact alarm became something an app has to be allowed. */
const EXACT_ALARMS_NEED_PERMISSION_FROM = 31

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
 * Whether Daylo may send notifications, as the phone has it right now.
 *
 * - `granted` and `denied`, as Android says. From Android 13, `denied` is the plugin's word
 *   for a permission Android will not ask about again, after the second no; below 13 it
 *   means notifications were turned off for Daylo in the phone's settings. Either way only
 *   the settings can change it.
 * - `prompt`: Android 13 or later, and Android would still ask. Not asked yet, or asked and
 *   refused once.
 * - `unknown`: no phone, a question that failed, or one that did not come back within
 *   PERMISSION_PATIENCE_MS.
 *
 * Asked of the plugin every time, and not through its isPermissionGranted. That one reads
 * window.Notification.permission, which the plugin's script sets once, when the page loads.
 * Somebody who said no, allowed notifications in the phone's settings and came back found
 * a page that still believed the no: the switch refused until Daylo was closed and opened
 * again (#192).
 */
export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/**
 * How long the permission question may take. It is a lookup on the phone and answers in
 * milliseconds; one that has not answered in three seconds is not going to, and the switch,
 * and every call queued behind it in inTurn, would wait for it for ever.
 */
export const PERMISSION_PATIENCE_MS = 3_000

/** The promise, or a rejection once `ms` have passed without it settling. */
function withPatience<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

export async function notificationPermission(): Promise<NotificationPermission> {
  // Asked first so that the desktop, where the plugin is not registered, is not a console
  // error every time a screen wants to know.
  if (!(await remindersAvailable())) {
    return 'unknown'
  }
  let answer: unknown
  try {
    // The plugin's own command, which asks Android (checkPermissions) every time: true,
    // false, or null for "Android would still ask".
    answer = await withPatience(
      invoke('plugin:notification|is_permission_granted'),
      PERMISSION_PATIENCE_MS
    )
  } catch (error) {
    console.error('[Daylo] could not tell whether notifications are allowed', error)
    return 'unknown'
  }
  if (answer === true) return 'granted'
  if (answer === false) return 'denied'
  if (answer === null) return 'prompt'
  console.error('[Daylo] the answer about notifications made no sense', answer)
  return 'unknown'
}

/**
 * Ask the person, and say whether they said yes.
 *
 * The plugin's command rather than its requestPermission, which goes through the same
 * cached window.Notification. Not given a time limit, because it waits for a person: while
 * Android's question is on the screen there is nothing else to do. It used to be able to
 * wait for ever with nobody to answer, from Android 13, when the permission was already
 * granted: the plugin's Kotlin had no branch for that and never replied. The fork pinned in
 * src-tauri/Cargo.toml replies.
 */
async function askForNotifications(): Promise<boolean> {
  return (await invoke('plugin:notification|request_permission')) === 'granted'
}

/**
 * Open the phone's own notification settings for Daylo, and say whether they opened.
 *
 * The only way left once Android has stopped asking, which it does after the second no, and
 * the only way at all below Android 13 when notifications were turned off there. Opening
 * them grants nothing: the person decides, and the app reads the permission again when it
 * comes back to the front.
 */
export async function openNotificationSettings(): Promise<boolean> {
  if (!isTauri()) {
    return false
  }
  try {
    return (await invoke<boolean>('open_notification_settings')) === true
  } catch {
    return false
  }
}

/**
 * When the reminder may first ring, as milliseconds since the epoch, or undefined for "the
 * next time it comes round".
 *
 * After midnight when anything was logged today: "How did today go? Tap to log it." to
 * somebody who logged at seven, every evening, teaches them to silence it (#192). Today is
 * the clock's day at the moment of arming, the same one the log was ticked on, and any
 * completed log counts, which is how the rest of the app decides a day was logged.
 *
 * Only the first ring moves. The plugin's interval re-arms itself every day from then on,
 * so somebody who does not open Daylo for three days is still reminded on each of them.
 * That is why this is not done by cancelling the reminder, which would stop it until the
 * app was opened again.
 */
export function reminderStartsAfter(
  logs: readonly Pick<ActivityLog, 'date' | 'completed'>[],
  now: Date
): number | undefined {
  const today = formatDate(now)
  if (!logs.some((log) => log.completed && log.date === today)) {
    return undefined
  }
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
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
  // The zero is load bearing. The plugin's Kotlin builds the next trigger from a calendar
  // made of *now* and sets only the fields it was given, zeroing the milliseconds and
  // leaving the seconds (NotificationSchedule.kt, buildNextTriggerTime). Without this, a
  // reminder set at 21:00:36 fires at 21:00:36 every night: on the minute by accident of
  // when the switch was pressed. Seen on a phone on 2026-10-13 as origWhen=21:00:36.
  const schedule = Schedule.interval({ hour, minute, second: 0 }, true)
  // Read here, at the moment of arming, so that every way in (the switch, the offer, the
  // re-arm at launch and after a tick) decides the same way. `notBefore` is the fork's
  // (src-tauri/Cargo.toml): the first ring is the first match at or after it.
  const startsAfter = reminderStartsAfter(useCalendarStore.getState().logs, new Date())
  if (startsAfter !== undefined && schedule.interval) {
    schedule.interval = { ...schedule.interval, notBefore: startsAfter } as typeof schedule.interval
  }
  try {
    await invoke('plugin:notification|notify', {
      options: {
        id: REMINDER_ID,
        title: TITLE,
        body: BODY,
        icon: REMINDER_ICON,
        schedule,
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
 * On a day already logged it waits for tomorrow: see reminderStartsAfter, which moves only
 * the first ring, so a person who does not open Daylo for three days is still reminded on
 * each of them. It used to fire whether or not anything was logged, because the only way
 * then to skip a day was to cancel and re-arm from inside the app.
 */
export function enableReminder(hour: number, minute: number): Promise<ReminderResult> {
  return inTurn(async () => {
    if (!(await remindersAvailable())) {
      return { outcome: 'unavailable' }
    }

    const permission = await notificationPermission()
    if (permission === 'unknown') {
      return { outcome: 'unanswered' }
    }
    // Asked on `denied` too. It costs nothing, Android answers no at once without showing
    // anything, and the plugin's `denied` is a note it keeps, which could be older than
    // the phone's own state. The screen offers the settings for that case.
    if (permission !== 'granted' && !(await askForNotifications())) {
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
 * inTurn. Null too when the phone did not say whether notifications are allowed.
 *
 * Also what moves the reminder to tomorrow when today gets logged, and back to today when
 * the last tick of the day is taken off and its time has not come yet: DailyReminder calls
 * it on both, and putOnTheQueue reads the day as it is at that moment.
 */
export function refreshReminder(hour: number, minute: number): Promise<boolean | null> {
  return inTurn(async (overtaken) => {
    if (!(await remindersAvailable())) {
      return overtaken() ? null : false
    }
    // Deliberately does not request it. Being asked again on every launch is how an app
    // teaches people to say no.
    const permission = await notificationPermission()
    // Not knowing is not "off". Said as null, which the screen does not act on, so a slow
    // answer cannot turn the switch off and cancel a reminder that may be fine.
    if (permission === 'unknown') {
      return null
    }
    if (permission !== 'granted') {
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
