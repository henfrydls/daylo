import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  exportToJSON,
  exportToCSV,
  parseImportFile,
  parseImportFileWithValidation,
  validateImportData,
  validateImportDataWithErrors,
  generateExportFilename,
  mergeData,
  type ExportData,
} from './dataExport'
import type { Activity, ActivityLog } from '../types'

// Helper function to create valid test activities
function createValidActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-1',
    name: 'Test Activity',
    color: '#10B981',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

// Helper function to create valid test logs
function createValidLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: 'log-1',
    activityId: 'activity-1',
    date: '2024-01-15',
    completed: true,
    notes: 'Test notes',
    createdAt: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

// Helper function to create valid export data
function createValidExportData(
  activities: Activity[] = [createValidActivity()],
  logs: ActivityLog[] = [createValidLog()]
): ExportData {
  return {
    activities,
    logs,
    exportedAt: '2024-01-15T10:00:00.000Z',
    version: '1.0',
  }
}

describe('dataExport utility functions', () => {
  describe('exportToJSON', () => {
    it('should generate valid JSON string', () => {
      const activities = [createValidActivity()]
      const logs = [createValidLog()]

      const result = exportToJSON(activities, logs)

      expect(() => JSON.parse(result)).not.toThrow()
    })

    it('should include activities in export', () => {
      const activities = [
        createValidActivity({ id: 'act-1', name: 'Exercise' }),
        createValidActivity({ id: 'act-2', name: 'Reading' }),
      ]
      const logs: ActivityLog[] = []

      const result = exportToJSON(activities, logs)
      const parsed = JSON.parse(result) as ExportData

      expect(parsed.activities).toHaveLength(2)
      expect(parsed.activities[0].id).toBe('act-1')
      expect(parsed.activities[1].id).toBe('act-2')
    })

    it('should include logs in export', () => {
      const activities: Activity[] = []
      const logs = [
        createValidLog({ id: 'log-1', date: '2024-01-15' }),
        createValidLog({ id: 'log-2', date: '2024-01-16' }),
      ]

      const result = exportToJSON(activities, logs)
      const parsed = JSON.parse(result) as ExportData

      expect(parsed.logs).toHaveLength(2)
      expect(parsed.logs[0].id).toBe('log-1')
      expect(parsed.logs[1].id).toBe('log-2')
    })

    it('should include exportedAt timestamp', () => {
      const result = exportToJSON([], [])
      const parsed = JSON.parse(result) as ExportData

      expect(parsed.exportedAt).toBeDefined()
      expect(() => new Date(parsed.exportedAt)).not.toThrow()
    })

    it('should include version', () => {
      const result = exportToJSON([], [])
      const parsed = JSON.parse(result) as ExportData

      expect(parsed.version).toBe('1.0')
    })

    it('should format JSON with indentation', () => {
      const result = exportToJSON([], [])

      expect(result).toContain('\n')
      expect(result).toContain('  ')
    })

    it('should handle empty arrays', () => {
      const result = exportToJSON([], [])
      const parsed = JSON.parse(result) as ExportData

      expect(parsed.activities).toEqual([])
      expect(parsed.logs).toEqual([])
    })
  })

  describe('exportToCSV', () => {
    it('should generate valid CSV structure', () => {
      const activities = [createValidActivity()]
      const logs = [createValidLog()]

      const result = exportToCSV(activities, logs)

      expect(result).toContain('# Activities')
      expect(result).toContain('# Logs')
    })

    it('should include activities header', () => {
      const result = exportToCSV([], [])

      expect(result).toContain('id,name,color,createdAt,updatedAt')
    })

    it('should include logs header', () => {
      const result = exportToCSV([], [])

      expect(result).toContain('id,activityId,date,completed,notes,createdAt')
    })

    it('should include activity data', () => {
      const activities = [createValidActivity({ id: 'act-1', name: 'Exercise', color: '#10B981' })]

      const result = exportToCSV(activities, [])

      expect(result).toContain('act-1')
      expect(result).toContain('Exercise')
      expect(result).toContain('#10B981')
    })

    it('should include log data', () => {
      const logs = [createValidLog({ id: 'log-1', activityId: 'act-1', date: '2024-01-15' })]

      const result = exportToCSV([], logs)

      expect(result).toContain('log-1')
      expect(result).toContain('act-1')
      expect(result).toContain('2024-01-15')
    })

    it('should escape fields with commas', () => {
      const activities = [createValidActivity({ name: 'Exercise, daily' })]

      const result = exportToCSV(activities, [])

      expect(result).toContain('"Exercise, daily"')
    })

    it('should escape fields with quotes', () => {
      const activities = [createValidActivity({ name: 'Exercise "hard"' })]

      const result = exportToCSV(activities, [])

      expect(result).toContain('"Exercise ""hard"""')
    })

    it('should escape fields with newlines', () => {
      const logs = [createValidLog({ notes: 'Line1\nLine2' })]

      const result = exportToCSV([], logs)

      expect(result).toContain('"Line1\nLine2"')
    })

    it('should handle logs without notes', () => {
      const logs = [createValidLog({ notes: undefined })]

      const result = exportToCSV([], logs)
      const lines = result.split('\n')
      const logLine = lines.find((line) => line.includes('log-1'))

      expect(logLine).toBeDefined()
      expect(logLine).not.toContain('undefined')
    })
  })

  describe('parseImportFile', () => {
    it('should parse valid JSON correctly', () => {
      const exportData = createValidExportData()
      const content = JSON.stringify(exportData)

      const result = parseImportFile(content)

      expect(result).not.toBeNull()
      expect(result!.activities).toHaveLength(1)
      expect(result!.logs).toHaveLength(1)
    })

    it('should return null for invalid JSON', () => {
      const result = parseImportFile('not valid json')

      expect(result).toBeNull()
    })

    it('should return null for missing activities array', () => {
      const content = JSON.stringify({ logs: [] })

      const result = parseImportFile(content)

      expect(result).toBeNull()
    })

    it('should return null for missing logs array', () => {
      const content = JSON.stringify({ activities: [] })

      const result = parseImportFile(content)

      expect(result).toBeNull()
    })

    it('should return sanitized data', () => {
      const exportData = createValidExportData([
        createValidActivity({ name: '<script>alert("xss")</script>Safe Name' }),
      ])
      const content = JSON.stringify(exportData)

      const result = parseImportFile(content)

      expect(result).not.toBeNull()
      expect(result!.activities[0].name).not.toContain('<script>')
    })
  })

  describe('parseImportFileWithValidation', () => {
    it('should return valid result for correct data', () => {
      const exportData = createValidExportData()
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.sanitizedData).toBeDefined()
    })

    it('should return error for invalid JSON syntax', () => {
      const result = parseImportFileWithValidation('{invalid json}')

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].field).toBe('file')
      expect(result.errors[0].message).toContain('Invalid JSON')
    })

    it('should return error for non-object data', () => {
      const result = parseImportFileWithValidation('"string"')

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('valid object'))).toBe(true)
    })

    it('should return error for null data', () => {
      const result = parseImportFileWithValidation('null')

      expect(result.valid).toBe(false)
    })

    it('should sanitize activity names for XSS', () => {
      const exportData = createValidExportData([
        createValidActivity({ name: '<img src=x onerror=alert(1)>Test' }),
      ])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.valid).toBe(true)
      expect(result.sanitizedData!.activities[0].name).not.toContain('<img')
    })

    it('should sanitize log notes for XSS', () => {
      const exportData = createValidExportData(
        [createValidActivity()],
        [createValidLog({ notes: '<script>steal(cookies)</script>Notes' })]
      )
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.valid).toBe(true)
      expect(result.sanitizedData!.logs[0].notes).not.toContain('<script>')
    })
  })

  describe('validateImportData', () => {
    it('should return true for valid export data', () => {
      const data = createValidExportData()

      expect(validateImportData(data)).toBe(true)
    })

    it('should return false for null', () => {
      expect(validateImportData(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(validateImportData(undefined)).toBe(false)
    })

    it('should return false for non-object', () => {
      expect(validateImportData('string')).toBe(false)
      expect(validateImportData(123)).toBe(false)
      expect(validateImportData([])).toBe(false)
    })

    it('should return false when activities is not an array', () => {
      const data = { activities: 'not array', logs: [] }

      expect(validateImportData(data)).toBe(false)
    })

    it('should return false when logs is not an array', () => {
      const data = { activities: [], logs: 'not array' }

      expect(validateImportData(data)).toBe(false)
    })

    it('should accept data with empty arrays', () => {
      const data = { activities: [], logs: [] }

      expect(validateImportData(data)).toBe(true)
    })
  })

  describe('validateImportDataWithErrors', () => {
    describe('basic structure validation', () => {
      it('should return error for non-object data', () => {
        const result = validateImportDataWithErrors('not an object')

        expect(result.valid).toBe(false)
        expect(result.errors[0].message).toContain('valid object')
      })

      it('should return error for missing activities', () => {
        const result = validateImportDataWithErrors({ logs: [] })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field === 'activities')).toBe(true)
      })

      it('should return error for missing logs', () => {
        const result = validateImportDataWithErrors({ activities: [] })

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field === 'logs')).toBe(true)
      })
    })

    describe('validation limits', () => {
      it('should reject too many activities', () => {
        const activities = Array.from({ length: 10001 }, (_, i) =>
          createValidActivity({ id: `activity-${i}` })
        )
        const data = { activities, logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('Too many activities'))).toBe(true)
      })

      it('should accept maximum allowed activities', () => {
        const activities = Array.from({ length: 10000 }, (_, i) =>
          createValidActivity({ id: `activity-${i}` })
        )
        const data = { activities, logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should reject too many logs', () => {
        const logs = Array.from({ length: 100001 }, (_, i) => createValidLog({ id: `log-${i}` }))
        const data = { activities: [], logs }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('Too many log entries'))).toBe(true)
      })

      it('should accept maximum allowed logs', () => {
        const logs = Array.from({ length: 100000 }, (_, i) => createValidLog({ id: `log-${i}` }))
        const data = { activities: [], logs }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })
    })

    describe('activity validation', () => {
      it('should return error for activity that is not an object', () => {
        const data = { activities: ['not an object'], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors[0].index).toBe(0)
      })

      it('should return error for activity with missing id', () => {
        const activity = { name: 'Test', color: '#10B981', createdAt: '2024-01-15T10:00:00.000Z' }
        const data = { activities: [activity], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.id'))).toBe(true)
      })

      it('should return error for activity with empty id', () => {
        const data = { activities: [createValidActivity({ id: '' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('ID cannot be empty'))).toBe(true)
      })

      it('should return error for activity with id exceeding max length', () => {
        const data = { activities: [createValidActivity({ id: 'a'.repeat(101) })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('ID exceeds maximum length'))).toBe(
          true
        )
      })

      it('should return error for activity with HTML in id', () => {
        const data = {
          activities: [createValidActivity({ id: '<script>test</script>' })],
          logs: [],
        }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('HTML tags'))).toBe(true)
      })

      it('should return error for activity with invalid id characters', () => {
        const data = { activities: [createValidActivity({ id: 'invalid id!' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('invalid characters'))).toBe(true)
      })

      it('should accept activity with valid id using hyphens and underscores', () => {
        const data = { activities: [createValidActivity({ id: 'valid-id_123' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should return error for activity with missing name', () => {
        const activity = { id: 'test-id', color: '#10B981', createdAt: '2024-01-15T10:00:00.000Z' }
        const data = { activities: [activity], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.name'))).toBe(true)
      })

      it('should return error for activity with empty name', () => {
        const data = { activities: [createValidActivity({ name: '' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('name cannot be empty'))).toBe(true)
      })

      it('should return error for activity with name exceeding max length', () => {
        const data = { activities: [createValidActivity({ name: 'a'.repeat(101) })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('name exceeds maximum length'))).toBe(
          true
        )
      })

      it('should return error for activity with missing color', () => {
        const activity = { id: 'test-id', name: 'Test', createdAt: '2024-01-15T10:00:00.000Z' }
        const data = { activities: [activity], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.color'))).toBe(true)
      })

      it('should return error for activity with invalid color format', () => {
        const data = { activities: [createValidActivity({ color: 'red' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('invalid color format'))).toBe(true)
      })

      it('should accept activity with 3-digit hex color', () => {
        const data = { activities: [createValidActivity({ color: '#ABC' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should accept activity with 6-digit hex color', () => {
        const data = { activities: [createValidActivity({ color: '#AABBCC' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should accept activity with lowercase hex color', () => {
        const data = { activities: [createValidActivity({ color: '#aabbcc' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should reject color without hash', () => {
        const data = { activities: [createValidActivity({ color: 'AABBCC' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
      })

      it('should reject color with invalid hex characters', () => {
        const data = { activities: [createValidActivity({ color: '#GGHHII' })], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
      })

      it('should return error for activity with missing createdAt', () => {
        const activity = { id: 'test-id', name: 'Test', color: '#10B981' }
        const data = { activities: [activity], logs: [] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.createdAt'))).toBe(true)
      })

      it('should return error for activity with invalid createdAt', () => {
        const data = {
          activities: [createValidActivity({ createdAt: 'not a date' })],
          logs: [],
        }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('invalid createdAt format'))).toBe(true)
      })

      it('should return error for activity with invalid updatedAt', () => {
        const data = {
          activities: [createValidActivity({ updatedAt: 'not a date' })],
          logs: [],
        }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('invalid updatedAt format'))).toBe(true)
      })
    })

    describe('log validation', () => {
      it('should return error for log that is not an object', () => {
        const data = { activities: [], logs: ['not an object'] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors[0].index).toBe(0)
      })

      it('should return error for log with missing id', () => {
        const log = {
          activityId: 'act-1',
          date: '2024-01-15',
          completed: true,
          createdAt: '2024-01-15T10:00:00.000Z',
        }
        const data = { activities: [], logs: [log] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.id'))).toBe(true)
      })

      it('should return error for log with missing activityId', () => {
        const log = {
          id: 'log-1',
          date: '2024-01-15',
          completed: true,
          createdAt: '2024-01-15T10:00:00.000Z',
        }
        const data = { activities: [], logs: [log] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.activityId'))).toBe(true)
      })

      it('should return error for log with missing date', () => {
        const log = {
          id: 'log-1',
          activityId: 'act-1',
          completed: true,
          createdAt: '2024-01-15T10:00:00.000Z',
        }
        const data = { activities: [], logs: [log] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.date'))).toBe(true)
      })

      it('should return error for log with invalid date format', () => {
        const data = { activities: [], logs: [createValidLog({ date: '15-01-2024' })] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('Must be YYYY-MM-DD'))).toBe(true)
      })

      it('should return error for log with invalid date value', () => {
        const data = { activities: [], logs: [createValidLog({ date: '2024-13-45' })] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
      })

      it('should accept log with valid date format', () => {
        const data = { activities: [], logs: [createValidLog({ date: '2024-01-15' })] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should return error for log with missing completed field', () => {
        const log = {
          id: 'log-1',
          activityId: 'act-1',
          date: '2024-01-15',
          createdAt: '2024-01-15T10:00:00.000Z',
        }
        const data = { activities: [], logs: [log] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.completed'))).toBe(true)
      })

      it('should return error for log with non-boolean completed', () => {
        const data = {
          activities: [],
          logs: [{ ...createValidLog(), completed: 'true' }],
        }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('boolean completed'))).toBe(true)
      })

      it('should accept log without notes', () => {
        const log = createValidLog()
        delete (log as Partial<ActivityLog>).notes
        const data = { activities: [], logs: [log] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should accept log with null notes', () => {
        const data = { activities: [], logs: [{ ...createValidLog(), notes: null }] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(true)
      })

      it('should return error for log with non-string notes', () => {
        const data = { activities: [], logs: [{ ...createValidLog(), notes: 123 }] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('notes must be a string'))).toBe(true)
      })

      it('should return error for log with notes exceeding max length', () => {
        const data = { activities: [], logs: [createValidLog({ notes: 'a'.repeat(1001) })] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('notes exceeds maximum length'))).toBe(
          true
        )
      })

      it('should return error for log with missing createdAt', () => {
        const log = { id: 'log-1', activityId: 'act-1', date: '2024-01-15', completed: true }
        const data = { activities: [], logs: [log] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.field.includes('.createdAt'))).toBe(true)
      })

      it('should return error for log with invalid createdAt', () => {
        const data = { activities: [], logs: [createValidLog({ createdAt: 'invalid' })] }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.message.includes('invalid createdAt format'))).toBe(true)
      })
    })

    describe('multiple errors', () => {
      it('should collect multiple validation errors', () => {
        const data = {
          activities: [
            { id: '', name: '', color: 'invalid' },
            { id: 'valid-id', name: 'Test', color: '#FFF', createdAt: '2024-01-15T10:00:00.000Z' },
          ],
          logs: [{ id: '', activityId: '', date: 'invalid', completed: 'not boolean' }],
        }

        const result = validateImportDataWithErrors(data)

        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(1)
      })
    })
  })

  describe('XSS sanitization', () => {
    it('should remove script tags from activity name', () => {
      const exportData = createValidExportData([
        createValidActivity({ name: 'Test<script>alert(1)</script>' }),
      ])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.sanitizedData!.activities[0].name).not.toContain('<script>')
      expect(result.sanitizedData!.activities[0].name).not.toContain('</script>')
    })

    it('should remove img tags with onerror from activity name', () => {
      const exportData = createValidExportData([
        createValidActivity({ name: 'Test<img src=x onerror=alert(1)>' }),
      ])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.sanitizedData!.activities[0].name).not.toContain('<img')
    })

    it('should remove standalone angle brackets', () => {
      const exportData = createValidExportData([createValidActivity({ name: 'Test < > value' })])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      // The sanitization removes < and > characters
      expect(result.sanitizedData!.activities[0].name).not.toContain('<')
      expect(result.sanitizedData!.activities[0].name).not.toContain('>')
    })

    it('should handle HTML entities', () => {
      const exportData = createValidExportData([
        createValidActivity({ name: 'Test &amp; &lt;script&gt;' }),
      ])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.sanitizedData!.activities[0].name).not.toContain('<script>')
    })

    it('should sanitize log notes', () => {
      const exportData = createValidExportData(
        [createValidActivity()],
        [createValidLog({ notes: '<div onclick="steal()">Click me</div>' })]
      )
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.sanitizedData!.logs[0].notes).not.toContain('<div')
      expect(result.sanitizedData!.logs[0].notes).not.toContain('onclick')
    })

    it('should trim whitespace from sanitized strings', () => {
      const exportData = createValidExportData([createValidActivity({ name: '  Test Name  ' })])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.sanitizedData!.activities[0].name).toBe('Test Name')
    })

    it('should truncate names that are at max length', () => {
      // Use exactly max length name (100 chars) - should pass validation and not be truncated
      const maxLengthName = 'a'.repeat(100)
      const exportData = createValidExportData([createValidActivity({ name: maxLengthName })])
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.valid).toBe(true)
      expect(result.sanitizedData!.activities[0].name.length).toBe(100)
    })

    it('should truncate notes that are at max length', () => {
      // Use exactly max length notes (1000 chars) - should pass validation and not be truncated
      const maxLengthNotes = 'a'.repeat(1000)
      const exportData = createValidExportData(
        [createValidActivity()],
        [createValidLog({ notes: maxLengthNotes })]
      )
      const content = JSON.stringify(exportData)

      const result = parseImportFileWithValidation(content)

      expect(result.valid).toBe(true)
      expect(result.sanitizedData!.logs[0].notes!.length).toBe(1000)
    })
  })

  describe('generateExportFilename', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should generate JSON filename with date', () => {
      const filename = generateExportFilename('json')

      expect(filename).toBe('activity-tracker-backup-2024-06-15.json')
    })

    it('should generate CSV filename with date', () => {
      const filename = generateExportFilename('csv')

      expect(filename).toBe('activity-tracker-backup-2024-06-15.csv')
    })
  })

  describe('mergeData', () => {
    it('should merge activities without duplicates', () => {
      const existing = [createValidActivity({ id: 'act-1', name: 'Existing' })]
      const imported = [
        createValidActivity({ id: 'act-1', name: 'Imported Same' }),
        createValidActivity({ id: 'act-2', name: 'Imported New' }),
      ]

      const result = mergeData(existing, [], imported, [])

      expect(result.activities).toHaveLength(2)
      expect(result.activities[0].name).toBe('Existing')
      expect(result.activities[1].name).toBe('Imported New')
    })

    it('should merge logs without duplicates', () => {
      const existing = [createValidLog({ id: 'log-1', date: '2024-01-15' })]
      const imported = [
        createValidLog({ id: 'log-1', date: '2024-01-16' }),
        createValidLog({ id: 'log-2', date: '2024-01-17' }),
      ]

      const result = mergeData([], existing, [], imported)

      expect(result.logs).toHaveLength(2)
      expect(result.logs[0].date).toBe('2024-01-15')
      expect(result.logs[1].date).toBe('2024-01-17')
    })

    it('should preserve existing data', () => {
      const existingActivities = [createValidActivity({ id: 'act-1' })]
      const existingLogs = [createValidLog({ id: 'log-1' })]

      const result = mergeData(existingActivities, existingLogs, [], [])

      expect(result.activities).toHaveLength(1)
      expect(result.logs).toHaveLength(1)
    })

    it('should add all imported data when no duplicates', () => {
      const imported = [createValidActivity({ id: 'act-1' }), createValidActivity({ id: 'act-2' })]
      const importedLogs = [createValidLog({ id: 'log-1' }), createValidLog({ id: 'log-2' })]

      const result = mergeData([], [], imported, importedLogs)

      expect(result.activities).toHaveLength(2)
      expect(result.logs).toHaveLength(2)
    })

    it('should handle empty imports', () => {
      const existing = [createValidActivity()]
      const existingLogs = [createValidLog()]

      const result = mergeData(existing, existingLogs, [], [])

      expect(result.activities).toEqual(existing)
      expect(result.logs).toEqual(existingLogs)
    })

    it('should handle all duplicates', () => {
      const existing = [createValidActivity({ id: 'act-1' }), createValidActivity({ id: 'act-2' })]
      const imported = [createValidActivity({ id: 'act-1' }), createValidActivity({ id: 'act-2' })]

      const result = mergeData(existing, [], imported, [])

      expect(result.activities).toHaveLength(2)
    })
  })

  describe('date format validation', () => {
    it('should accept valid YYYY-MM-DD date', () => {
      const data = { activities: [], logs: [createValidLog({ date: '2024-12-31' })] }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(true)
    })

    it('should reject date with wrong separator', () => {
      const data = { activities: [], logs: [createValidLog({ date: '2024/01/15' })] }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(false)
    })

    it('should reject date with invalid month', () => {
      const data = { activities: [], logs: [createValidLog({ date: '2024-13-15' })] }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(false)
    })

    it('should reject date with invalid day', () => {
      const data = { activities: [], logs: [createValidLog({ date: '2024-02-30' })] }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(false)
    })

    it('should accept leap year date', () => {
      const data = { activities: [], logs: [createValidLog({ date: '2024-02-29' })] }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(true)
    })

    it('should reject Feb 29 in non-leap year', () => {
      const data = { activities: [], logs: [createValidLog({ date: '2023-02-29' })] }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(false)
    })
  })

  describe('ISO date validation', () => {
    it('should accept valid ISO date string', () => {
      const data = {
        activities: [createValidActivity({ createdAt: '2024-01-15T10:30:00.000Z' })],
        logs: [],
      }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(true)
    })

    it('should accept ISO date without milliseconds', () => {
      const data = {
        activities: [createValidActivity({ createdAt: '2024-01-15T10:30:00Z' })],
        logs: [],
      }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(true)
    })

    it('should accept ISO date with timezone offset', () => {
      const data = {
        activities: [createValidActivity({ createdAt: '2024-01-15T10:30:00+05:00' })],
        logs: [],
      }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(true)
    })

    it('should reject completely invalid date string', () => {
      const data = {
        activities: [createValidActivity({ createdAt: 'not-a-date-at-all' })],
        logs: [],
      }

      const result = validateImportDataWithErrors(data)

      expect(result.valid).toBe(false)
    })
  })
})
