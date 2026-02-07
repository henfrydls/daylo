import { YearView } from './components/calendar'
import { ActivityList, QuickLog } from './components/activities'
import { StatsPanel } from './components/stats'
import { useCalendarStore } from './store'

function App() {
  const { selectedDate } = useCalendarStore()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Section */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200">
            <YearView />
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
