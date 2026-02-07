import { useState } from 'react'
import { YearView, MonthView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
import { ExportModal, ImportModal } from './components/data'
import { DropdownMenu, ToastContainer } from './components/ui'
import type { DropdownMenuItem } from './components/ui'
import { useCalendarStore } from './store'

function ViewToggle() {
  const { currentView, setCurrentView } = useCalendarStore()

  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      <button
        onClick={() => setCurrentView('year')}
        className={`
          px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150
          ${currentView === 'year'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
          }
        `}
        aria-pressed={currentView === 'year'}
      >
        Year
      </button>
      <button
        onClick={() => setCurrentView('month')}
        className={`
          px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150
          ${currentView === 'month'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
          }
        `}
        aria-pressed={currentView === 'month'}
      >
        Month
      </button>
    </div>
  )
}

function App() {
  const { selectedDate, currentView } = useCalendarStore()
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)

  const menuItems: DropdownMenuItem[] = [
    {
      label: 'Export Data',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
      onClick: () => setIsExportOpen(true),
    },
    {
      label: 'Import Data',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
      onClick: () => setIsImportOpen(true),
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3" data-testid="app-header">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Activity Tracker</h1>
            </div>
            <div className="flex items-center gap-3">
              <ViewToggle />
              <DropdownMenu
                trigger={
                  <button
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    aria-label="More options"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                }
                items={menuItems}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200">
            {currentView === 'year' ? <YearView /> : <MonthView />}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <ActivityList />
            <StatsPanel />
          </div>
        </div>
      </main>

      {/* Quick Log Modal */}
      {selectedDate && <QuickLog />}

      {/* Export/Import Modals */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  )
}

export default App
