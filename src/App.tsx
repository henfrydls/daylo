import { useState, lazy, Suspense } from 'react'
import { YearView, MonthView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
import { DropdownMenu, ErrorBoundary, ToastContainer } from './components/ui'
import type { DropdownMenuItem } from './components/ui'
import { useCalendarStore } from './store'
import { useAppVersion } from './hooks'

// Lazy load modals - they are rarely used
const ExportModal = lazy(() =>
  import('./components/data/ExportModal').then((module) => ({
    default: module.ExportModal,
  }))
)
const ImportModal = lazy(() =>
  import('./components/data/ImportModal').then((module) => ({
    default: module.ImportModal,
  }))
)

function ViewToggle() {
  const { currentView, setCurrentView } = useCalendarStore()

  return (
    <div
      className="inline-flex rounded-lg bg-gray-100 p-1"
      role="group"
      aria-label="Calendar view toggle"
    >
      <button
        onClick={() => setCurrentView('year')}
        className={`
          px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
          min-h-[44px] sm:min-h-0 min-w-[44px]
          ${
            currentView === 'year'
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
          px-3 py-2 sm:py-1.5 text-sm font-medium rounded-md transition-all duration-150
          focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
          min-h-[44px] sm:min-h-0 min-w-[44px]
          ${
            currentView === 'month'
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
  const appVersion = useAppVersion()

  const menuItems: DropdownMenuItem[] = [
    {
      label: 'Export Data',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
      ),
      onClick: () => setIsExportOpen(true),
    },
    {
      label: 'Import Data',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      ),
      onClick: () => setIsImportOpen(true),
    },
    { type: 'divider' },
    {
      type: 'info',
      label: `v${appVersion}`,
    },
  ]

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Skip Link for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-500 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          Skip to main content
        </a>

        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div
                className="flex items-center justify-between sm:justify-start gap-3"
                data-testid="app-header"
              >
                <div className="flex items-center gap-3">
                  <img src="/favicon.svg" alt="Daylo logo" className="w-8 h-8 rounded-lg" />
                  <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
                    Daylo
                    <span className="hidden md:inline text-sm font-normal text-gray-400 ml-2">
                      · Simple Activity Tracking
                    </span>
                  </h1>
                </div>
                {/* Menu button visible on mobile next to title */}
                <div className="sm:hidden">
                  <DropdownMenu
                    trigger={
                      <span
                        className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="More options"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </span>
                    }
                    items={menuItems}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3">
                <ViewToggle />
                {/* Menu button hidden on mobile, visible on larger screens */}
                <div className="hidden sm:block">
                  <DropdownMenu
                    trigger={
                      <span
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        aria-label="More options"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </span>
                    }
                    items={menuItems}
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main
          id="main-content"
          className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6"
          tabIndex={-1}
        >
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

        {/* Export/Import Modals - Lazy loaded */}
        <Suspense fallback={null}>
          {isExportOpen && (
            <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
          )}
        </Suspense>
        <Suspense fallback={null}>
          {isImportOpen && (
            <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
          )}
        </Suspense>

        {/* Toast Notifications */}
        <ToastContainer />
      </div>
    </ErrorBoundary>
  )
}

export default App
