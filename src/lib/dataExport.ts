import type { Activity, ActivityLog } from '../types'

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
  MAX_NAME_LENGTH: 100,
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
    if (activity.name.length > VALIDATION_LIMITS.MAX_NAME_LENGTH) {
      errors.push({
        field: `${prefix}.name`,
        message: `Activity at index ${index} name exceeds maximum length of ${VALIDATION_LIMITS.MAX_NAME_LENGTH} characters.`,
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
    } else if (log.notes.length > VALIDATION_LIMITS.MAX_NOTES_LENGTH) {
      errors.push({
        field: `${prefix}.notes`,
        message: `Log at index ${index} notes exceeds maximum length of ${VALIDATION_LIMITS.MAX_NOTES_LENGTH} characters.`,
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
 * Sanitize string by removing HTML tags to prevent XSS
 */
function sanitizeString(str: string): string {
  return str
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<') // Decode common entities for re-encoding
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/</g, '&lt;') // Re-encode dangerous characters
    .replace(/>/g, '&gt;')
    .trim()
}

/**
 * Sanitize activity data
 */
function sanitizeActivity(activity: Activity): Activity {
  return {
    ...activity,
    id: activity.id.trim(),
    name: sanitizeString(activity.name).slice(0, VALIDATION_LIMITS.MAX_NAME_LENGTH),
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
    notes: log.notes
      ? sanitizeString(log.notes).slice(0, VALIDATION_LIMITS.MAX_NOTES_LENGTH)
      : undefined,
    createdAt: log.createdAt,
  }
}

/**
 * Generate export filename with current date
 */
export function generateExportFilename(format: 'json' | 'csv'): string {
  const date = new Date().toISOString().split('T')[0]
  return `activity-tracker-backup-${date}.${format}`
}

/**
 * Merge imported data with existing data, skipping duplicates by ID
 */
export function mergeData(
  existingActivities: Activity[],
  existingLogs: ActivityLog[],
  importedActivities: Activity[],
  importedLogs: ActivityLog[]
): { activities: Activity[]; logs: ActivityLog[] } {
  const existingActivityIds = new Set(existingActivities.map((a) => a.id))
  const existingLogIds = new Set(existingLogs.map((l) => l.id))

  const newActivities = importedActivities.filter((a) => !existingActivityIds.has(a.id))
  const newLogs = importedLogs.filter((l) => !existingLogIds.has(l.id))

  return {
    activities: [...existingActivities, ...newActivities],
    logs: [...existingLogs, ...newLogs],
  }
}
