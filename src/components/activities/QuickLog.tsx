import { useCalendarStore } from '../../store'
import { formatDisplayDate, parseDateString } from '../../lib/dates'
import { Button } from '../ui'

export function QuickLog() {
  const { selectedDate, setSelectedDate, activities, logs, toggleLog } = useCalendarStore()

  if (!selectedDate) return null

  const date = parseDateString(selectedDate)
  const dayLogs = logs.filter((l) => l.date === selectedDate)

  const isActivityCompleted = (activityId: string) => {
    return dayLogs.some((l) => l.activityId === activityId && l.completed)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6" data-testid="quicklog-modal">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{formatDisplayDate(date)}</h2>
          <button
            onClick={() => setSelectedDate(null)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {activities.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No activities to log. Create an activity first!
          </p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => {
              const isCompleted = isActivityCompleted(activity.id)
              return (
                <label
                  key={activity.id}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    isCompleted ? 'bg-emerald-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={() => toggleLog(activity.id, selectedDate)}
                    className="w-5 h-5 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                    data-testid="quicklog-activity-checkbox"
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activity.color }}
                  />
                  <span
                    className={`font-medium ${isCompleted ? 'text-emerald-700' : 'text-gray-900'}`}
                  >
                    {activity.name}
                  </span>
                  {isCompleted && (
                    <svg
                      className="w-5 h-5 text-emerald-500 ml-auto"
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
                  )}
                </label>
              )
            })}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button onClick={() => setSelectedDate(null)} data-testid="quicklog-done-button">Done</Button>
        </div>
      </div>
    </div>
  )
}
