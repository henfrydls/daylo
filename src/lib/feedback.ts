import { invoke } from '@tauri-apps/api/core'
import { useCalendarStore } from '../store'

/**
 * The answers to the question Daylo asks once, from this side of the wall.
 *
 * Everything here decides *what travels*. The messages themselves are built and sent in
 * `src-tauri/src/checkin.rs`, for the same reason the check-in is: the app's CSP is
 * `default-src 'none'`, so the page can reach no host at all.
 */

/**
 * The number that joins one answer together: sixteen random bytes as hex.
 *
 * Made when the question opens and gone when it closes. It is not stored, does not come
 * back in another session, and identifies nobody between one time and the next. It exists
 * because the server records events and never updates them, so a rating and a comment
 * arrive as two messages and something has to say they are two halves of one answer.
 *
 * Deliberately not the check-in's number and deliberately not persisted. Those two
 * properties are the whole difference between a number that joins two messages and a
 * number that joins two months.
 */
export function newAnswer(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The check-in's number, but only while the check-in is on.
 *
 * It reads the switch and not just the stored number. They agree today, because turning
 * the switch off deletes the number, but the switch is what the person pressed and the
 * number is an artefact of it: if the two ever disagreed, sending would be doing the
 * opposite of what was asked.
 */
function lastingId(): string | undefined {
  const { checkinEnabled, checkinId } = useCalendarStore.getState()
  return checkinEnabled && checkinId ? checkinId : undefined
}

/** Whether this device is one that speaks to us at all. */
function speaksToUs(): boolean {
  return useCalendarStore.getState().checkinEnabled
}

/**
 * Hand one answer to the native side. True if it left, false if it did not.
 *
 * A refusal is a fact to return, not an error to propagate: nothing in the app may break
 * because a server was unreachable. The log line names neither number, because a line
 * naming them would put on this device the one thing these messages are careful about.
 */
async function send(args: Record<string, unknown>): Promise<boolean> {
  try {
    await invoke('send_feedback', args)
    return true
  } catch (error) {
    console.error('[Daylo] an answer did not go through', error)
    return false
  }
}

/**
 * That the question was put, and how it arrived.
 *
 * Without this, no answers means either "nobody wanted to" or "nobody ever saw it", and
 * those two ask for opposite things to be done next. `menu` is somebody who went looking
 * for it; `automatic` is somebody the app interrupted.
 *
 * It is the only one of the three that nobody asked for, and the only one that waits on
 * the check-in's switch. A rating and a comment are answers: somebody pressed a star or
 * wrote a sentence, and sending what they did is the point of the dialog. This one is the
 * dialog reporting its own arrival, on a screen that put itself there after seven days.
 * With the switch off that was the app reaching a server off its own bat, which is the
 * single thing that switch exists to stop.
 *
 * It never carried the lasting number, because `lastingId` already read the switch. That
 * was not enough: a connection carries an address and the fact that Daylo is in use today,
 * and "Anonymous check-in is off. It would tell us the app is still in use" is on screen
 * saying that no longer happens. The sentence in checkin.rs is the policy, and it is now
 * true of all three: of somebody who turned the check-in off we know only what they chose
 * to write to us.
 *
 * What this costs is real and is worth naming: with the switch off there is no denominator
 * any more, so a silence from those devices cannot be read as "saw it and said nothing"
 * rather than "never saw it". That is a thing we no longer get to know, which is what
 * turning it off means.
 */
export function sendShown(answer: string, origin: 'automatic' | 'menu'): Promise<boolean> {
  if (!speaksToUs()) return Promise.resolve(false)
  return send({ kind: 'shown', answer, id: lastingId(), origin })
}

/** The star, sent the moment it is pressed rather than when a form is completed. */
export function sendRating(answer: string, stars: number): Promise<boolean> {
  return send({ kind: 'rating', answer, id: lastingId(), stars })
}

/** What somebody wrote: the only message Daylo sends that carries anything typed. */
export function sendComment(answer: string, text: string): Promise<boolean> {
  return send({ kind: 'comment', answer, id: lastingId(), text })
}
