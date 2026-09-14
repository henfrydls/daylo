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

async function send(id: string, last: boolean): Promise<boolean> {
  sending = true
  try {
    const ok = await sendCheckin({ id, date: today(), last })
    useCalendarStore.getState().recordCheckinAttempt(today(), new Date().toISOString(), ok)
    return ok
  } finally {
    sending = false
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
  if (sending) return

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

  return (await sendCheckin({ id, date: today(), last: true })) ? 'sent' : 'lost'
}
