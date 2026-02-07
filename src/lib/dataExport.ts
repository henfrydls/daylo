import type { Activity, ActivityLog } from '../types'

export interface ExportData {
  activities: Activity[]
  logs: ActivityLog[]
  exportedAt: string
  version: string
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
 */
export function parseImportFile(
  content: string
): { activities: Activity[]; logs: ActivityLog[] } | null {
  try {
    const data = JSON.parse(content)
    if (!validateImportData(data)) {
      return null
    }
    return {
      activities: data.activities,
      logs: data.logs,
    }
  } catch {
    return null
  }
}

/**
 * Validate the structure of imported data
 */
export function validateImportData(data: unknown): data is ExportData {
  if (!data || typeof data !== 'object') {
    return false
  }

  const obj = data as Record<string, unknown>

  // Check activities array
  if (!Array.isArray(obj.activities)) {
    return false
  }

  // Validate each activity
  for (const activity of obj.activities) {
    if (!isValidActivity(activity)) {
      return false
    }
  }

  // Check logs array
  if (!Array.isArray(obj.logs)) {
    return false
  }

  // Validate each log
  for (const log of obj.logs) {
    if (!isValidActivityLog(log)) {
      return false
    }
  }

  return true
}

/**
 * Validate activity structure
 */
function isValidActivity(obj: unknown): obj is Activity {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  const activity = obj as Record<string, unknown>

  return (
    typeof activity.id === 'string' &&
    typeof activity.name === 'string' &&
    typeof activity.color === 'string' &&
    typeof activity.createdAt === 'string'
  )
}

/**
 * Validate activity log structure
 */
function isValidActivityLog(obj: unknown): obj is ActivityLog {
  if (!obj || typeof obj !== 'object') {
    return false
  }

  const log = obj as Record<string, unknown>

  return (
    typeof log.id === 'string' &&
    typeof log.activityId === 'string' &&
    typeof log.date === 'string' &&
    typeof log.completed === 'boolean' &&
    typeof log.createdAt === 'string'
  )
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
