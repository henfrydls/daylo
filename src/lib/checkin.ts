import { invoke, isTauri } from '@tauri-apps/api/core'
import { useCalendarStore } from '../store'
import { formatDate } from './dates'

/**
 * The check-in, from this side of the wall.
 *
 * Everything here decides *whether* and *when*. The message itself is built and sent in
 * `src-tauri/src/checkin.rs`, because the app's CSP is `default-src 'none'` and the
 * webview can reach no host at all — which is the argument as much as the mechanism.
 *
 * Nothing in this file may send twice in a day, keep a queue, or retry. A day that was
 * tried is spent, and the sheet says so.
 */

export interface CheckinFields {
  version: string
  os: string
  /**
   * One word for the way this copy was installed: store, installer, appimage, snap, deb,
   * rpm, macos, play, apk, or unknown where nothing packaged it. Added in 1.4.1, because
   * the panel could see twenty copies on Windows and not know how many came from the
   * Store.
   *
   * play and apk are the same question asked again on Android, from 1.5: Daylo is on
   * Google Play and is also a file on the site, and only the phone knows which one a copy
   * came through. The words are decided in src-tauri/src/packaging.rs.
   */
  source: string
}

/**
 * The version and system this build would send, or null where there is no check-in.
 *
 * `checkin_fields` is registered on desktop and Android only, so a rejected call is the
 * answer rather than a failure: it is how iOS, the web build and the Docker image say
 * that no code path here can send anything. Same shape as `remindersAvailable`.
 */
export async function checkinFields(): Promise<CheckinFields | null> {
  if (!isTauri()) return null
  try {
    return await invoke<CheckinFields>('checkin_fields')
  } catch {
    return null
  }
}

/**
 * A number for this installation: 16 random bytes as 32 lowercase hex characters.
 *
 * Not `randomUUID`, for two reasons that both matter more than the line it would save.
 * It needs a secure context, which a `tauri://` page is not obliged to be, and a value
 * shaped like a UUID reads like an identifier issued by somebody. This one is made on
 * the device, tied to nothing, and deleted when the switch goes off.
 */
export function generateCheckinId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Whether this copy has at least one habit, which is the sixth thing the message carries
 * (1.6). With it the panel can tell a copy that was installed and left empty from one
 * that started a habit. It is a yes or a no on purpose: how many, or which, would say
 * something about what a person tracks, and the message says nothing about that. Read at
 * the moment the message is made, so a habit created a minute ago counts today.
 */
function hasAHabit(): boolean {
  return useCalendarStore.getState().activities.length > 0
}

/** The day as the person's own calendar has it, which is the day the message carries. */
export function today(): string {
  return formatDate(new Date())
}

/**
 * Hand one message to the native side. True if it left, false if it did not.
 *
 * A refusal is a fact to record, not an error to propagate: no part of the app may break
 * because a server was unreachable, and nothing is shown about it except in the sheet.
 */
export async function sendCheckin(args: {
  id: string
  date: string
  last: boolean
  /** Whether there is at least one habit. Not how many, and not which. */
  activities: boolean
}): Promise<boolean> {
  try {
    await invoke('send_checkin', args)
    return true
  } catch (error) {
    // Without the id: a log line naming it would put on this device the one thing the
    // message is careful not to attach to anything.
    console.error('[Daylo] check-in did not go through', error)
    return false
  }
}

/**
 * Whether a send is in the air. Module state on purpose and the only state here: two
 * callers want the same instant on a desktop that has been open for days — the effect
 * that runs once the store has hydrated, and the window becoming visible again.
 */
let sending = false
/**
 * Somebody came back while a send was in the air. Their return is looked at again once it
 * lands: if the send was for the same day there is nothing to add, and if the day changed
 * while it was in the air, the new day goes then. Dropped, it would wait for the next
 * time the window came back, which on a desktop left in front could be hours.
 */
let askedWhileSending = false

async function send(id: string, last: boolean): Promise<boolean> {
  sending = true
  try {
    // Read once. A send that crosses midnight records the day it said, not the day the
    // answer came back on, or tomorrow would be spent on a message about today.
    const date = today()
    const ok = await sendCheckin({ id, date, last, activities: hasAHabit() })
    useCalendarStore.getState().recordCheckinAttempt(date, new Date().toISOString(), ok)
    return ok
  } finally {
    sending = false
    if (askedWhileSending) {
      askedWhileSending = false
      void sendCheckinIfDue()
    }
  }
}

/**
 * Say yes: make the number, keep it, and send today's straight away.
 *
 * Straight away because the device is open and this is a day it was opened, so the rule
 * is already satisfied — and because a switch that says it is on while nothing has
 * happened yet has no honest sentence to show.
 */
export async function turnOnCheckin(): Promise<void> {
  const id = generateCheckinId()
  useCalendarStore.getState().setCheckin(true, id)
  await send(id, false)
}

/**
 * What a new installation does on its first launch: turn the check-in on and say hello.
 *
 * On by default is the owner's decision, made with the cost in front of him. From 1.3.0 to
 * 1.5.x a line under the header announced it; that line is gone, and the switch and what
 * it sends are in the menu, under Anonymous check-in. What the code still owes is that nobody who installed Daylo under
 * "it sends nothing anywhere" is moved without asking, which is why this is only ever
 * called for a store that had nothing in it at all.
 */
export async function startCheckinOnNewInstall(): Promise<void> {
  if (useCalendarStore.getState().checkinEnabled) return
  await turnOnCheckin()
}

/**
 * Today's, if today has not been tried yet.
 *
 * Tried, not sent: a day whose send failed is spent. Retrying tomorrow would not recover
 * it — the message says "Daylo was opened on this date" — so it would be a second
 * heartbeat for a day that already had one, and "once a day at most" is in the dialog.
 */
export async function sendCheckinIfDue(): Promise<void> {
  const { checkinEnabled, checkinId, checkinLastAttempt } = useCalendarStore.getState()
  if (!checkinEnabled || !checkinId) return
  if (checkinLastAttempt?.date === today()) return
  if (sending) {
    askedWhileSending = true
    return
  }

  await send(checkinId, false)
}

/**
 * Say no: forget the number first, then say goodbye with it.
 *
 * The order is the whole design. What protects the person happens on this device,
 * immediately, and does not wait on a network that may never answer. The last note is
 * sent with a number that is already gone from disk, and its outcome is only a sentence
 * in this sitting — nothing about the season that just ended is kept.
 */
export async function turnOffCheckin(): Promise<'sent' | 'lost'> {
  const id = useCalendarStore.getState().checkinId
  useCalendarStore.getState().setCheckin(false, null)
  if (!id) return 'lost'

  return (await sendCheckin({ id, date: today(), last: true, activities: hasAHabit() }))
    ? 'sent'
    : 'lost'
}
