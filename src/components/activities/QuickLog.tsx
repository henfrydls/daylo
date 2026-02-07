import { useState, useRef, useEffect } from 'react'
import { useCalendarStore } from '../../store'
import { formatDisplayDate, parseDateString } from '../../lib/dates'
import { ACTIVITY_COLORS } from '../../lib/colors'
import { Button } from '../ui'

export function QuickLog() {
  const { selectedDate, setSelectedDate, activities, logs, toggleLog, addActivity } =
    useCalendarStore()

  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(ACTIVITY_COLORS[0].value)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isCreating])

  if (!selectedDate) return null

  const date = parseDateString(selectedDate)
  const dayLogs = logs.filter((l) => l.date === selectedDate)

  const isActivityCompleted = (activityId: string): boolean => {
    return dayLogs.some((l) => l.activityId === activityId && l.completed)
  }

  const handleStartCreating = (): void => {
    setIsCreating(true)
    setNewName('')
    setNewColor(ACTIVITY_COLORS[0].value)
  }

  const handleCancelCreating = (): void => {
    setIsCreating(false)
    setNewName('')
    setNewColor(ACTIVITY_COLORS[0].value)
  }

  const handleCreateActivity = (): void => {
    if (!newName.trim()) return

    addActivity(newName.trim(), newColor)

    // Get the newly created activity (last one in the array)
    const updatedActivities = useCalendarStore.getState().activities
    const newActivity = updatedActivities[updatedActivities.length - 1]

    if (newActivity) {
      toggleLog(newActivity.id, selectedDate)
    }

    setIsCreating(false)
    setNewName('')
    setNewColor(ACTIVITY_COLORS[0].value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateActivity()
    } else if (e.key === 'Escape') {
      handleCancelCreating()
    }
  }

  const renderActivityList = () => (
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

      {isCreating ? (
        <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg space-y-3">
          <input
            ref={nameInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Activity name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            data-testid="quicklog-new-activity-input"
          />
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => setNewColor(color.value)}
                className={`w-6 h-6 rounded-full transition-all ${
                  newColor === color.value
                    ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: color.value }}
                aria-label={`Select ${color.name} color`}
                data-testid={`quicklog-color-${color.name.toLowerCase()}`}
              />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelCreating}
              data-testid="quicklog-cancel-create"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateActivity}
              disabled={!newName.trim()}
              data-testid="quicklog-add-activity"
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleStartCreating}
          className="flex items-center gap-2 w-full p-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          data-testid="quicklog-new-activity-button"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="font-medium">New activity</span>
        </button>
      )}
    </div>
  )

  const renderEmptyState = () => (
    <div className="text-center py-8">
      {isCreating ? (
        <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg space-y-3">
          <input
            ref={nameInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Activity name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            data-testid="quicklog-new-activity-input"
          />
          <div className="flex flex-wrap gap-2 justify-center">
            {ACTIVITY_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => setNewColor(color.value)}
                className={`w-6 h-6 rounded-full transition-all ${
                  newColor === color.value
                    ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                    : 'hover:scale-110'
                }`}
                style={{ backgroundColor: color.value }}
                aria-label={`Select ${color.name} color`}
                data-testid={`quicklog-color-${color.name.toLowerCase()}`}
              />
            ))}
          </div>
          <div className="flex gap-2 justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelCreating}
              data-testid="quicklog-cancel-create"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateActivity}
              disabled={!newName.trim()}
              data-testid="quicklog-add-activity"
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-gray-500 mb-4">No activities to log yet.</p>
          <Button onClick={handleStartCreating} data-testid="quicklog-create-first-activity">
            Create your first activity
          </Button>
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        data-testid="quicklog-modal"
      >
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

        {activities.length === 0 ? renderEmptyState() : renderActivityList()}

        <div className="mt-6 flex justify-end">
          <Button onClick={() => setSelectedDate(null)} data-testid="quicklog-done-button">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
