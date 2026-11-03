import type { Activity, ActivityLog } from '../types'
import { LONGEST_NAME } from './limits'

export interface ExportData {
  activities: Activity[]
  logs: ActivityLog[]
  exportedAt: string
  version: string
}

// Validation constants
const VALIDATION_LIMITS = {
  MAX_ACTIVITIES: 10_000,
  MAX_LOGS: 100_000,
  /** What the forms let somebody type. Enforced there, where it can be seen happening. */
  MAX_NAME_LENGTH: LONGEST_NAME,
  /**
   * What an import will take. Far above the form's limit on purpose: Daylo shipped for
   * years with no limit on either form, so longer names exist in real files that Daylo
   * itself wrote, and a backup of your own has to open. This one only catches the absurd.
   */
  LONGEST_NAME_ACCEPTED: 10000,
  LONGEST_NOTES_ACCEPTED: 100000,
  MAX_COLOR_LENGTH: 20,
  MAX_ID_LENGTH: 100,
  MAX_NOTES_LENGTH: 1000,
} as const

// Validation error types
export interface ValidationError {
  field: string
  message: string
  index?: number
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  sanitizedData?: {
    activities: Activity[]
    logs: ActivityLog[]
  }
}

/**
 * Export activities and logs to JSON format
 */
export function exportToJSON(activities: Activity[], logs: ActivityLog[]): string {
  const exportData: ExportData = {
    activities,
    logs,
    exportedAt: new Date().toISOString(),
    version: '1.0',
  }
  return JSON.stringify(exportData, null, 2)
}

/**
 * Export activities and logs to CSV format
 * Creates a combined CSV with sections for activities and logs
 */
export function exportToCSV(activities: Activity[], logs: ActivityLog[]): string {
  const lines: string[] = []

  // Activities section
  lines.push('# Activities')
  lines.push('id,name,color,createdAt,updatedAt')
  activities.forEach((activity) => {
    lines.push(
      `${escapeCSV(activity.id)},${escapeCSV(activity.name)},${escapeCSV(activity.color)},${escapeCSV(activity.createdAt)},${escapeCSV(activity.updatedAt)}`
    )
  })

  lines.push('')

  // Logs section
  lines.push('# Logs')
  lines.push('id,activityId,date,completed,notes,createdAt')
  logs.forEach((log) => {
    lines.push(
      `${escapeCSV(log.id)},${escapeCSV(log.activityId)},${escapeCSV(log.date)},${log.completed},${escapeCSV(log.notes || '')},${escapeCSV(log.createdAt)}`
    )
  })

  return lines.join('\n')
}

/**
 * Escape CSV field values
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Trigger file download in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Parse imported JSON file content
 * @returns Object with activities and logs if valid, null otherwise
 * @deprecated Use parseImportFileWithValidation for detailed error messages
 */
export function parseImportFile(
  content: string
): { activities: Activity[]; logs: ActivityLog[] } | null {
  const result = parseImportFileWithValidation(content)
  if (!result.valid || !result.sanitizedData) {
    return null
  }
  return result.sanitizedData
}

/**
 * Parse and validate imported JSON file content with detailed error messages
 */
export function parseImportFileWithValidation(content: string): ValidationResult {
  // Try to parse JSON
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return {
      valid: false,
      errors: [{ field: 'file', message: 'Invalid JSON format. The file could not be parsed.' }],
    }
  }

  // Validate structure
  const structureResult = validateImportDataWithErrors(data)
  if (!structureResult.valid) {
    return structureResult
  }

  // Sanitize and return data
  const exportData = data as ExportData
  const sanitizedActivities = exportData.activities.map(sanitizeActivity)
  const sanitizedLogs = exportData.logs.map(sanitizeActivityLog)

  return {
    valid: true,
    errors: [],
    sanitizedData: {
      activities: sanitizedActivities,
      logs: sanitizedLogs,
    },
  }
}

/**
 * Validate the structure of imported data
 * @deprecated Use validateImportDataWithErrors for detailed error messages
 */
export function validateImportData(data: unknown): data is ExportData {
  const result = validateImportDataWithErrors(data)
  return result.valid
}

/**
 * Validate the structure of imported data with detailed error messages
 */
export function validateImportDataWithErrors(data: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'data', message: 'Import data must be a valid object.' }],
    }
  }

  const obj = data as Record<string, unknown>

  // Check activities array exists
  if (!Array.isArray(obj.activities)) {
    errors.push({ field: 'activities', message: 'Missing or invalid "activities" array.' })
  } else {
    // Check activities count limit
    if (obj.activities.length > VALIDATION_LIMITS.MAX_ACTIVITIES) {
      errors.push({
        field: 'activities',
        message: `Too many activities. Maximum allowed is ${VALIDATION_LIMITS.MAX_ACTIVITIES}, but found ${obj.activities.length}.`,
      })
    } else {
      // Validate each activity
      for (let i = 0; i < obj.activities.length; i++) {
        const activityErrors = validateActivity(obj.activities[i], i)
        errors.push(...activityErrors)
      }
    }
  }

  // Check logs array exists
  if (!Array.isArray(obj.logs)) {
    errors.push({ field: 'logs', message: 'Missing or invalid "logs" array.' })
  } else {
    // Check logs count limit
    if (obj.logs.length > VALIDATION_LIMITS.MAX_LOGS) {
      errors.push({
        field: 'logs',
        message: `Too many log entries. Maximum allowed is ${VALIDATION_LIMITS.MAX_LOGS}, but found ${obj.logs.length}.`,
      })
    } else {
      // Validate each log
      for (let i = 0; i < obj.logs.length; i++) {
        const logErrors = validateActivityLog(obj.logs[i], i)
        errors.push(...logErrors)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate activity with detailed error messages
 */
function validateActivity(obj: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = []
  const prefix = `activities[${index}]`

  if (!obj || typeof obj !== 'object') {
    errors.push({
      field: prefix,
      message: `Activity at index ${index} must be a valid object.`,
      index,
    })
    return errors
  }

  const activity = obj as Record<string, unknown>

  // Validate ID
  if (typeof activity.id !== 'string') {
    errors.push({
      field: `${prefix}.id`,
      message: `Activity at index ${index} must have a valid string ID.`,
      index,
    })
  } else {
    const idErrors = validateId(activity.id, `${prefix}.id`, index)
    errors.push(...idErrors)
  }

  // Validate name
  if (typeof activity.name !== 'string') {
    errors.push({
      field: `${prefix}.name`,
      message: `Activity at index ${index} must have a valid string name.`,
      index,
    })
  } else {
    if (activity.name.length === 0) {
      errors.push({
        field: `${prefix}.name`,
        message: `Activity at index ${index} name cannot be empty.`,
        index,
      })
    }
    // Deliberately no maximum here, and the reason is that Daylo never had one either.
    // The forms have never limited what you can type, so a name of any length can be in a
    // file Daylo itself wrote. Refusing it threw out the WHOLE import, in both modes, so a
    // person who had once named an activity with a sentence could not restore their own
    // backup at all. The limit is enforced where it belongs now, in the two places a name
    // is typed, which stops new ones without disowning the old.
    //
    // What is still refused is the absurd, below: a single name of more than ten thousand
    // characters did not come from anybody's thumbs and is the shape of a malformed or
    // hostile file.
    if (activity.name.length > VALIDATION_LIMITS.LONGEST_NAME_ACCEPTED) {
      errors.push({
        field: `${prefix}.name`,
        message: `Activity at index ${index} has a name of ${activity.name.length} characters, which is longer than anything Daylo could have written.`,
        index,
      })
    }
  }

  // Validate color
  if (typeof activity.color !== 'string') {
    errors.push({
      field: `${prefix}.color`,
      message: `Activity at index ${index} must have a valid string color.`,
      index,
    })
  } else {
    if (!isValidHexColor(activity.color)) {
      errors.push({
        field: `${prefix}.color`,
        message: `Activity at index ${index} has invalid color format. Must be a hex color (#RGB or #RRGGBB).`,
        index,
      })
    }
    if (activity.color.length > VALIDATION_LIMITS.MAX_COLOR_LENGTH) {
      errors.push({
        field: `${prefix}.color`,
        message: `Activity at index ${index} color exceeds maximum length of ${VALIDATION_LIMITS.MAX_COLOR_LENGTH} characters.`,
        index,
      })
    }
  }

  // Validate createdAt
  if (typeof activity.createdAt !== 'string') {
    errors.push({
      field: `${prefix}.createdAt`,
      message: `Activity at index ${index} must have a valid createdAt timestamp.`,
      index,
    })
  } else if (!isValidISODate(activity.createdAt)) {
    errors.push({
      field: `${prefix}.createdAt`,
      message: `Activity at index ${index} has invalid createdAt format. Must be a valid ISO date string.`,
      index,
    })
  }

  // Validate updatedAt (optional but if present must be valid)
  if (activity.updatedAt !== undefined) {
    if (typeof activity.updatedAt !== 'string') {
      errors.push({
        field: `${prefix}.updatedAt`,
        message: `Activity at index ${index} updatedAt must be a valid string if provided.`,
        index,
      })
    } else if (!isValidISODate(activity.updatedAt)) {
      errors.push({
        field: `${prefix}.updatedAt`,
        message: `Activity at index ${index} has invalid updatedAt format. Must be a valid ISO date string.`,
        index,
      })
    }
  }

  return errors
}

/**
 * Validate activity log with detailed error messages
 */
function validateActivityLog(obj: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = []
  const prefix = `logs[${index}]`

  if (!obj || typeof obj !== 'object') {
    errors.push({ field: prefix, message: `Log at index ${index} must be a valid object.`, index })
    return errors
  }

  const log = obj as Record<string, unknown>

  // Validate ID
  if (typeof log.id !== 'string') {
    errors.push({
      field: `${prefix}.id`,
      message: `Log at index ${index} must have a valid string ID.`,
      index,
    })
  } else {
    const idErrors = validateId(log.id, `${prefix}.id`, index)
    errors.push(...idErrors)
  }

  // Validate activityId
  if (typeof log.activityId !== 'string') {
    errors.push({
      field: `${prefix}.activityId`,
      message: `Log at index ${index} must have a valid string activityId.`,
      index,
    })
  } else {
    const activityIdErrors = validateId(log.activityId, `${prefix}.activityId`, index)
    errors.push(...activityIdErrors)
  }

  // Validate date (YYYY-MM-DD format)
  if (typeof log.date !== 'string') {
    errors.push({
      field: `${prefix}.date`,
      message: `Log at index ${index} must have a valid string date.`,
      index,
    })
  } else if (!isValidDateFormat(log.date)) {
    errors.push({
      field: `${prefix}.date`,
      message: `Log at index ${index} has invalid date format. Must be YYYY-MM-DD.`,
      index,
    })
  }

  // Validate completed
  if (typeof log.completed !== 'boolean') {
    errors.push({
      field: `${prefix}.completed`,
      message: `Log at index ${index} must have a boolean completed field.`,
      index,
    })
  }

  // Validate notes (optional)
  if (log.notes !== undefined && log.notes !== null) {
    if (typeof log.notes !== 'string') {
      errors.push({
        field: `${prefix}.notes`,
        message: `Log at index ${index} notes must be a string if provided.`,
        index,
      })
    } else if (log.notes.length > VALIDATION_LIMITS.LONGEST_NOTES_ACCEPTED) {
      // Same reasoning as the name above: what Daylo wrote, Daylo takes back.
      errors.push({
        field: `${prefix}.notes`,
        message: `Log at index ${index} has a note of ${log.notes.length} characters, which is longer than anything Daylo could have written.`,
        index,
      })
    }
  }

  // Validate createdAt
  if (typeof log.createdAt !== 'string') {
    errors.push({
      field: `${prefix}.createdAt`,
      message: `Log at index ${index} must have a valid createdAt timestamp.`,
      index,
    })
  } else if (!isValidISODate(log.createdAt)) {
    errors.push({
      field: `${prefix}.createdAt`,
      message: `Log at index ${index} has invalid createdAt format. Must be a valid ISO date string.`,
      index,
    })
  }

  return errors
}

/**
 * Validate ID format - must be non-empty string, reasonable length, no HTML
 */
function validateId(id: string, field: string, index?: number): ValidationError[] {
  const errors: ValidationError[] = []

  if (id.length === 0) {
    errors.push({ field, message: `ID cannot be empty.`, index })
  }

  if (id.length > VALIDATION_LIMITS.MAX_ID_LENGTH) {
    errors.push({
      field,
      message: `ID exceeds maximum length of ${VALIDATION_LIMITS.MAX_ID_LENGTH} characters.`,
      index,
    })
  }

  // Check for potentially malicious characters (HTML/script tags)
  if (containsHTML(id)) {
    errors.push({
      field,
      message: `ID contains invalid characters (HTML tags are not allowed).`,
      index,
    })
  }

  // IDs should only contain alphanumeric characters, hyphens, underscores
  const validIdPattern = /^[a-zA-Z0-9_-]+$/
  if (!validIdPattern.test(id)) {
    errors.push({
      field,
      message: `ID contains invalid characters. Only alphanumeric characters, hyphens, and underscores are allowed.`,
      index,
    })
  }

  return errors
}

/**
 * Validate hex color format (#RGB or #RRGGBB)
 */
function isValidHexColor(color: string): boolean {
  const hexColorPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
  return hexColorPattern.test(color)
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(date: string): boolean {
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

/**
 * Validate ISO date string format
 */
function isValidISODate(dateString: string): boolean {
  const date = new Date(dateString)
  return !isNaN(date.getTime())
}

/**
 * Check if string contains HTML tags
 */
function containsHTML(str: string): boolean {
  const htmlPattern = /<[^>]*>/
  return htmlPattern.test(str)
}

/**
 * The words somebody wrote, given back unchanged except for the space around them.
 *
 * This used to strip everything between angle brackets and then re-encode what was left,
 * under a comment saying it prevented XSS. There is no sink for it to have protected:
 * React escapes every string it renders, and this app has no dangerouslySetInnerHTML and
 * no innerHTML anywhere. What it did have was teeth. Measured against names people type:
 *
 *   Read <10 pages>  became  Read
 *   Peso <-> medidas became  Peso  medidas
 *   Gym <3           was shown as  Gym &lt;3
 *   Tom &amp; Jerry  became  Tom & Jerry
 *
 * And it only bit on the way back in. Nothing sanitises on the way out and nothing
 * sanitises a name typed into the app, so the single path that changed somebody's data was
 * the one they take after losing a phone. A backup that comes back different is not a
 * backup.
 *
 * Trimming stays: the space around a name is not content, and it is what the form does
 * when the name is typed in the first place.
 */
function tidy(str: string): string {
  return str.trim()
}

/**
 * Sanitize activity data
 */
function sanitizeActivity(activity: Activity): Activity {
  return {
    ...activity,
    id: activity.id.trim(),
    name: tidy(activity.name),
    color: activity.color.trim().slice(0, VALIDATION_LIMITS.MAX_COLOR_LENGTH),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  }
}

/**
 * Sanitize activity log data
 */
function sanitizeActivityLog(log: ActivityLog): ActivityLog {
  return {
    ...log,
    id: log.id.trim(),
    activityId: log.activityId.trim(),
    date: log.date.trim(),
    completed: log.completed,
    notes: log.notes ? tidy(log.notes) : undefined,
    createdAt: log.createdAt,
  }
}

/**
 * Generate export filename with current date.
 *
 * Only JSON can be imported back, so only JSON is called a backup. Naming a CSV
 * "backup" would invite someone to keep one as their only copy and find out later.
 */
export function generateExportFilename(format: 'json' | 'csv'): string {
  // The date the person is living in, not the one in UTC. toISOString() was naming
  // backups after tomorrow every evening west of Greenwich: at 23:02 in Santo Domingo it
  // produced 2026-09-10, and the file the user saved tonight looked like it came from a
  // day that had not happened yet.
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  const kind = format === 'json' ? 'backup' : 'export'
  return `daylo-${kind}-${date}.${format}`
}

/** Identidad de negocio de un registro: una actividad en un dia concreto. */
function logKey(log: ActivityLog): string {
  return `${log.activityId}|${log.date}`
}

/**
 * Merge imported data with existing data, skipping duplicates.
 *
 * Los registros se descartan por dos motivos, y hacen falta los dos:
 *
 * - Por `id`, porque dos registros con el mismo id romperian las claves de las listas.
 * - Por actividad y dia, porque el id de un dia marcado NO es estable: al desmarcar, el
 *   registro se borra, y volver a marcar crea otro id para el mismo dia. Sin esta
 *   comprobacion, importar un respaldo hecho antes de ese ciclo mete un segundo registro
 *   del mismo dia: el heatmap pinta un nivel que no corresponde, las estadisticas cuentan
 *   el dia dos veces y un clic solo borra uno de los dos.
 *
 * La comprobacion tambien acumula lo ya aceptado, para que un respaldo que traiga el
 * mismo dia repetido no lo duplique contra si mismo.
 */
export function mergeData(
  existingActivities: Activity[],
  existingLogs: ActivityLog[],
  importedActivities: Activity[],
  importedLogs: ActivityLog[]
): { activities: Activity[]; logs: ActivityLog[] } {
  const existingActivityIds = new Set(existingActivities.map((a) => a.id))
  const newActivities = importedActivities.filter((a) => !existingActivityIds.has(a.id))

  const seenIds = new Set(existingLogs.map((l) => l.id))
  const seenKeys = new Set(existingLogs.map(logKey))
  const newLogs: ActivityLog[] = []

  for (const log of importedLogs) {
    if (seenIds.has(log.id) || seenKeys.has(logKey(log))) continue
    seenIds.add(log.id)
    seenKeys.add(logKey(log))
    newLogs.push(log)
  }

  return {
    activities: [...existingActivities, ...newActivities],
    logs: [...existingLogs, ...newLogs],
  }
}
