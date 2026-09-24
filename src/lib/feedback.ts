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
 */
export function sendShown(answer: string, origin: 'automatic' | 'menu'): Promise<boolean> {
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
