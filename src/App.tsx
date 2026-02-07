import { YearView, MonthView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
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
            <ViewToggle />
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
    </div>
  )
}

export default App
