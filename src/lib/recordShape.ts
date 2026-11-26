/**
 * What an activity and a log have to be for Daylo to draw them.
 *
 * One definition for the two ways a record gets in: a file being imported
 * (`validateImportDataWithErrors` in dataExport) and what the store finds on the disk when
 * it opens (`merge` in the store). The import applies these rules and adds limits of its
 * own on top (id characters and length, hex colours, empty or absurdly long names and
 * notes). Those extra limits are about refusing a hostile or malformed file, not about
 * what can be drawn, and none of them is applied to the disk: a copy that holds something
 * an import would refuse still opens, because Daylo itself may have written it.
 *
 * What is here is what throws when it is wrong. A timestamp that is not a date is Invalid
 * Date, and date-fns throws a RangeError formatting it (activityYear, feedbackInvite); a
 * day that is not `YYYY-MM-DD` is the same through parseISO.
 */

import { isValid, parseISO } from 'date-fns'

/** A timestamp a Date can be made of, such as what toISOString writes. */
export function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}

/** A day as Daylo writes it, `YYYY-MM-DD`, and one that is on the calendar. */
export function isValidDateFormat(date: string): boolean {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(date)) {
    return false
  }

  // Additional validation: check if it's a real date
  const [year, month, day] = date.split('-').map(Number)
  const dateObj = new Date(year, month - 1, day)

  return (
    dateObj.getFullYear() === year && dateObj.getMonth() === month - 1 && dateObj.getDate() === day
  )
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isTimestamp = (value: unknown) => typeof value === 'string' && isValidISODate(value)

/**
 * A timestamp as parseISO reads it, which is how a log's createdAt is read
 * (feedbackInvite). Stricter than isValidISODate on purpose: `new Date` also takes
 * "2026/11/01" or "Sun Nov 01 2026", parseISO does not, and what one let in the other
 * threw on. toISOString, which is what Daylo writes, passes; so does a bare `YYYY-MM-DD`.
 */
export function isISOTimestamp(value: unknown): boolean {
  return typeof value === 'string' && isValid(parseISO(value))
}

/**
 * A log whose createdAt `new Date` reads and parseISO does not, given back with that date
 * written as Daylo writes it: the same moment, through toISOString. Anything else, the
 * same object, untouched.
 *
 * For what is already on a disk, and for a backup made from it. Daylo never wrote such a
 * date, but an import accepted one until 1.6.1, so a copy may hold it, and Export writes
 * it out as stored. The record is the person's; refusing it would send them to the rescue
 * screen, or turn down their own backup, over a field the app only uses to count a week.
 * The store applies this in merge and the import in parseImportFileWithValidation, both
 * before validating. A date neither reads is left alone, and is refused as before.
 */
export function withReadableCreatedAt(value: unknown): unknown {
  if (!isPlainObject(value) || typeof value.createdAt !== 'string') return value
  if (isISOTimestamp(value.createdAt) || !isValidISODate(value.createdAt)) return value
  return { ...value, createdAt: new Date(value.createdAt).toISOString() }
}

/**
 * The first field of an activity that cannot be drawn, `''` when the activity itself is
 * not an object, or null when it can be.
 */
export function activityFault(value: unknown): string | null {
  if (!isPlainObject(value)) return ''
  for (const field of ['id', 'name', 'color']) {
    if (typeof value[field] !== 'string') return field
  }
  if (!isTimestamp(value.createdAt)) return 'createdAt'
  if (value.updatedAt !== undefined && !isTimestamp(value.updatedAt)) return 'updatedAt'
  return null
}

/**
 * The first field of a log that cannot be drawn, `''` when the log itself is not an
 * object, or null when it can be.
 */
export function logFault(value: unknown): string | null {
  if (!isPlainObject(value)) return ''
  for (const field of ['id', 'activityId']) {
    if (typeof value[field] !== 'string') return field
  }
  if (typeof value.date !== 'string' || !isValidDateFormat(value.date)) return 'date'
  if (typeof value.completed !== 'boolean') return 'completed'
  if (value.notes != null && typeof value.notes !== 'string') return 'notes'
  if (!isISOTimestamp(value.createdAt)) return 'createdAt'
  return null
}
