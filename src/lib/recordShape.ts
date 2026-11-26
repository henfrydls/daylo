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

/**
 * The one rule for a stored or imported timestamp: a string a Date can be made of. Loose on
 * purpose, and the same as every version before: `new Date` also takes "2026/11/01", and a
 * copy or a backup holding one opens and comes in. Whatever reads such a field with parseISO
 * has to cope with what it cannot read (feedbackInvite's dayOf does).
 */
export const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && isValidISODate(value)

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
  if (!isTimestamp(value.createdAt)) return 'createdAt'
  return null
}
