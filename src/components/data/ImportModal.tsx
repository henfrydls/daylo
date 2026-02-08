import { useState, useCallback, useRef } from 'react'
import { Modal, Button, ConfirmDialog } from '../ui'
import { useCalendarStore } from '../../store'
import { parseImportFileWithValidation, mergeData } from '../../lib/dataExport'
import type { Activity, ActivityLog } from '../../types'
import type { ValidationError } from '../../lib/dataExport'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
}

type ImportMode = 'merge' | 'replace'

interface ParsedData {
  activities: Activity[]
  logs: ActivityLog[]
}

export function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [isDragging, setIsDragging] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showConfirm, setShowConfirm] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { activities, logs } = useCalendarStore()

  const resetState = useCallback(() => {
    setParsedData(null)
    setError(null)
    setValidationErrors([])
    setImportMode('merge')
    setShowConfirm(false)
    setIsImporting(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleClose = () => {
    resetState()
    onClose()
  }

  const processFile = useCallback((file: File) => {
    setError(null)
    setValidationErrors([])
    setParsedData(null)

    // Validate file type
    if (!file.name.endsWith('.json')) {
      setError('Please select a JSON file (.json)')
      return
    }

    // Validate file size (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      setError('File is too large. Maximum file size is 10MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const result = parseImportFileWithValidation(content)

      if (!result.valid || !result.sanitizedData) {
        if (result.errors.length > 0) {
          // Show the first error as the main error message
          setError(result.errors[0].message)
          // Store all errors for detailed display
          setValidationErrors(result.errors)
        } else {
          setError(
            'Invalid file format. Please ensure the file was exported from Activity Tracker.'
          )
        }
        return
      }

      setParsedData(result.sanitizedData)
    }
    reader.onerror = () => {
      setError('Failed to read file. Please try again.')
    }
    reader.readAsText(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  const handleImportClick = () => {
    setShowConfirm(true)
  }

  const handleConfirmImport = () => {
    if (!parsedData) return

    setIsImporting(true)
    setShowConfirm(false)

    try {
      const store = useCalendarStore.getState()

      if (importMode === 'replace') {
        // Replace all data
        useCalendarStore.setState({
          activities: parsedData.activities,
          logs: parsedData.logs,
        })
      } else {
        // Merge with existing data
        const merged = mergeData(
          store.activities,
          store.logs,
          parsedData.activities,
          parsedData.logs
        )
        useCalendarStore.setState({
          activities: merged.activities,
          logs: merged.logs,
        })
      }

      handleClose()
    } finally {
      setIsImporting(false)
    }
  }

  const getConfirmMessage = () => {
    if (!parsedData) return ''

    if (importMode === 'replace') {
      return `This will replace all your current data (${activities.length} activities, ${logs.length} logs) with the imported data (${parsedData.activities.length} activities, ${parsedData.logs.length} logs). This action cannot be undone.`
    }

    return `This will merge ${parsedData.activities.length} activities and ${parsedData.logs.length} logs with your existing data. Duplicates will be skipped.`
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title="Import Data">
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50'
                  : parsedData
                    ? 'border-emerald-300 bg-emerald-50'
                    : error
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-300 hover:border-emerald-400 hover:bg-gray-50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            {parsedData ? (
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">File validated</p>
                <p className="text-sm text-gray-500">Click to select a different file</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">Drop your backup file here</p>
                <p className="text-sm text-gray-500">or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supports JSON files only</p>
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
                <svg
                  className="w-5 h-5 text-red-500 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              {/* Show additional validation errors if there are more than one */}
              {validationErrors.length > 1 && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs font-medium text-red-700 mb-2">
                    Additional validation errors ({validationErrors.length - 1}):
                  </p>
                  <ul className="text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
                    {validationErrors.slice(1, 6).map((err, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <span className="text-red-400">-</span>
                        <span>{err.message}</span>
                      </li>
                    ))}
                    {validationErrors.length > 6 && (
                      <li className="text-red-400 italic">
                        ...and {validationErrors.length - 6} more errors
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {parsedData && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-900 mb-2">Found in file:</p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {parsedData.activities.length}{' '}
                  {parsedData.activities.length === 1 ? 'activity' : 'activities'}
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {parsedData.logs.length}{' '}
                  {parsedData.logs.length === 1 ? 'log entry' : 'log entries'}
                </li>
              </ul>
            </div>
          )}

          {/* Import mode selection */}
          {parsedData && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Import mode:</p>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
                <input
                  type="radio"
                  name="importMode"
                  value="merge"
                  checked={importMode === 'merge'}
                  onChange={() => setImportMode('merge')}
                  className="mt-0.5 h-4 w-4 text-emerald-500 border-gray-300 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">Merge with existing</span>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Add new items, skip duplicates. Your current data stays intact.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
                <input
                  type="radio"
                  name="importMode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                  className="mt-0.5 h-4 w-4 text-emerald-500 border-gray-300 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">Replace all</span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      Caution
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Clear all current data and import fresh.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleImportClick}
              disabled={!parsedData || isImporting}
              className="flex-1"
            >
              {isImporting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Importing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Import Data
                </span>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmImport}
        title={importMode === 'replace' ? 'Replace All Data?' : 'Confirm Import'}
        message={getConfirmMessage()}
        confirmText={importMode === 'replace' ? 'Replace All' : 'Import'}
        variant={importMode === 'replace' ? 'warning' : 'default'}
      />
    </>
  )
}
