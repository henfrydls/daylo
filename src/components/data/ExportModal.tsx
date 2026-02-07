import { useState } from 'react'
import { Modal, Button } from '../ui'
import { useCalendarStore } from '../../store'
import {
  exportToJSON,
  exportToCSV,
  downloadFile,
  generateExportFilename,
} from '../../lib/dataExport'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
}

type ExportFormat = 'json' | 'csv'

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('json')
  const [isExporting, setIsExporting] = useState(false)
  const { activities, logs } = useCalendarStore()

  const handleExport = () => {
    setIsExporting(true)

    try {
      const filename = generateExportFilename(format)

      if (format === 'json') {
        const content = exportToJSON(activities, logs)
        downloadFile(content, filename, 'application/json')
      } else {
        const content = exportToCSV(activities, logs)
        downloadFile(content, filename, 'text/csv')
      }

      onClose()
    } finally {
      setIsExporting(false)
    }
  }

  const hasData = activities.length > 0 || logs.length > 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Your Data">
      <div className="space-y-6">
        {/* Data summary */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-2">Data to export:</p>
            <ul className="space-y-1">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {logs.length} {logs.length === 1 ? 'log entry' : 'log entries'}
              </li>
            </ul>
          </div>
        </div>

        {/* Format selection */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Select format:</p>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
            <input
              type="radio"
              name="exportFormat"
              value="json"
              checked={format === 'json'}
              onChange={() => setFormat('json')}
              className="mt-0.5 h-4 w-4 text-emerald-500 border-gray-300 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">JSON</span>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                Best for importing back into the app. Preserves all data structure.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50">
            <input
              type="radio"
              name="exportFormat"
              value="csv"
              checked={format === 'csv'}
              onChange={() => setFormat('csv')}
              className="mt-0.5 h-4 w-4 text-emerald-500 border-gray-300 focus:ring-emerald-500"
            />
            <div className="flex-1">
              <span className="font-medium text-gray-900">CSV</span>
              <p className="text-sm text-gray-500 mt-0.5">
                Compatible with Excel and Google Sheets. Good for analysis.
              </p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!hasData || isExporting} className="flex-1">
            {isExporting ? (
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
                Exporting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export {format.toUpperCase()}
              </span>
            )}
          </Button>
        </div>

        {!hasData && (
          <p className="text-sm text-amber-600 text-center">
            No data to export. Add some activities first.
          </p>
        )}
      </div>
    </Modal>
  )
}
