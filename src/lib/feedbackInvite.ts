import { differenceInCalendarDays, parseISO } from 'date-fns'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { formatDate } from './dates'
import type { ActivityLog } from '../types'

/**
 * The letter the invitation opens, already addressed and already started.
 *
 * Three headings and nothing else: no version, no platform, no name, nothing the app
 * knows about the person. That is what lets the band say "nothing leaves your device
 * until you send the email" and mean it — the only thing that ever leaves is what
 * somebody typed and chose to send.
 *
 * Built rather than written out so the encoding is the language's and not mine, and
 * pinned by a test to the exact string, because a mail client that meets a stray
 * character shows the reader a body full of percent signs.
 */
const MAILTO_TO = 'daylo@henfrydls.com'
const MAILTO_SUBJECT = 'How Daylo is going'
const MAILTO_BODY = 'What I am tracking:\r\n\r\nWhat works:\r\n\r\nWhat I wish it did:\r\n'

export const FEEDBACK_MAILTO =
  `mailto:${MAILTO_TO}` +
  `?subject=${encodeURIComponent(MAILTO_SUBJECT)}` +
  `&body=${encodeURIComponent(MAILTO_BODY)}`

export interface FeedbackInviteInput {
  /** Today, local, as the app writes days everywhere else. */
  today: string
  firstOpenedAt: string | null
  logs: ActivityLog[]
  feedbackInviteSeen: boolean
  loggedThisSession: boolean
  offerThisSession: 'reminder' | 'checkin' | null
  reminderOfferPending: boolean
  checkinNoticePending: boolean
}

/** The day a record was made, which is a day the person opened the app. */
const dayOf = (log: ActivityLog) => formatDate(parseISO(log.createdAt))

/**
 * Whether to ask this person, in this session, how it is going.
 *
 * Seven conditions, and every one of them is there to stop the app asking a favour of
 * somebody who has not earned the question or is in the middle of something else.
 *
 * The week is counted from the earliest of the first day this installation was opened and
 * the oldest record it holds. Somebody who restored a backup onto a new phone has lived
 * with Daylo for a year, and should not be treated as new because the handset is. The same
 * person is still not asked on their first day here, because that day they are setting a
 * phone up, not using the app.
 *
 * How many days the app was used no longer counts, and the history is the point. It asked
 * for fourteen calendar days and eight distinct days of use until 2026-09-23, then seven
 * and three, and since 2026-09-27 only the week. Each cut had the same reason: at the
 * usage the check-in can see, the gate was beyond where anybody had been. Of the fourteen
 * devices on the panel, four have had the chance to cross seven days and none did; the
 * other ten are younger than that and have no verdict yet.
 *
 * Dropping the days of use is not another loosening, it is a condition that was measuring
 * something the week already says: if seven days have passed between the first record and
 * today, that person came back. That is the whole question. One condition less to explain
 * and one less to get wrong.
 *
 * Worth saying plainly, because the paragraph above will outlive its numbers: the app does
 * not report whether this was ever shown, so what we know is who could have crossed and
 * did not, never who saw it.
 */
export function shouldInviteFeedback(input: FeedbackInviteInput): boolean {
  if (input.feedbackInviteSeen) return false
  if (!input.loggedThisSession) return false
  if (input.firstOpenedAt === null || input.firstOpenedAt === input.today) return false

  // Three things want this session and none may talk over another: the reminder offer
  // goes first, then the check-in's one-line notice, then this. Owed counts as taken, so
  // a person who has not yet met the other two does not meet this one first.
  if (input.offerThisSession !== null) return false
  if (input.reminderOfferPending || input.checkinNoticePending) return false

  if (input.logs.length === 0) return false

  const days = input.logs.map(dayOf)
  // Plain string comparison: these are YYYY-MM-DD, which sorts as it reads.
  const oldestRecord = days.reduce((a, b) => (a < b ? a : b))
  const start = input.firstOpenedAt < oldestRecord ? input.firstOpenedAt : oldestRecord

  return differenceInCalendarDays(parseISO(input.today), parseISO(start)) >= 7
}

/**
 * Open the letter, and say whether it opened.
 *
 * Through the platform when there is one, because a webview asked to navigate to a
 * `mailto:` does nothing useful and the app would never learn that it did nothing. The
 * command is the opener plugin's, which on Android is an ACTION_VIEW intent and rejects
 * with the system's own exception when no mail app exists — the only platform that can
 * tell us, and the one where it is most likely to happen.
 *
 * In a browser there is no platform to ask, so this reports success and lets the anchor's
 * own navigation do the work.
 */
export async function openMailto(url: string): Promise<'opened' | 'failed'> {
  if (!isTauri()) return 'opened'
  try {
    await invoke('plugin:opener|open_url', { url })
    return 'opened'
  } catch (error) {
    console.error('[Daylo] no email app answered', error)
    return 'failed'
  }
}
