import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useCalendarStore } from '../../store'
import { formatDisplayDate, parseDateString } from '../../lib/dates'
import { ACTIVITY_COLORS } from '../../lib/colors'
import { Button, CheckIcon, ColorPicker, PlusIcon, XIcon } from '../ui'
import { useFocusTrap } from '../../hooks'
import { useShallow } from 'zustand/react/shallow'

export const QuickLog = memo(function QuickLog() {
  // Use individual selectors to prevent over-subscription
  const selectedDate = useCalendarStore((state) => state.selectedDate)
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const logs = useCalendarStore(useShallow((state) => state.logs))
  const toggleLog = useCalendarStore((state) => state.toggleLog)
  const addActivity = useCalendarStore((state) => state.addActivity)

  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(ACTIVITY_COLORS[0].value)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setSelectedDate(null)
  }, [setSelectedDate])

  useFocusTrap(modalRef, !!selectedDate, { onEscape: handleClose })

  useEffect(() => {
    if (isCreating && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isCreating])

  // Memoize day logs to prevent recalculation on every render
  const dayLogs = useMemo(() => {
    if (!selectedDate) return []
    return logs.filter((l) => l.date === selectedDate)
  }, [logs, selectedDate])

  // Memoize completed activity IDs set for O(1) lookups
  const completedActivityIds = useMemo(() => {
    const ids = new Set<string>()
    dayLogs.forEach((l) => {
      if (l.completed) ids.add(l.activityId)
    })
    return ids
  }, [dayLogs])

  const isActivityCompleted = useCallback((activityId: string): boolean => {
    return completedActivityIds.has(activityId)
  }, [completedActivityIds])

  const handleToggleLog = useCallback((activityId: string): void => {
    if (!selectedDate) return
    toggleLog(activityId, selectedDate)
  }, [selectedDate, toggleLog])

  if (!selectedDate) return null

  const date = parseDateString(selectedDate)

  const handleStartCreating = useCallback((): void => {
    setIsCreating(true)
    setNewName('')
    setNewColor(ACTIVITY_COLORS[0].value)
  }, [])

  const handleCancelCreating = useCallback((): void => {
    setIsCreating(false)
    setNewName('')
    setNewColor(ACTIVITY_COLORS[0].value)
  }, [])

  const handleCreateActivity = useCallback((): void => {
    if (!newName.trim() || !selectedDate) return

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
  }, [newName, newColor, selectedDate, addActivity, toggleLog])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateActivity()
    } else if (e.key === 'Escape') {
      handleCancelCreating()
    }
  }, [handleCreateActivity, handleCancelCreating])

  const renderActivityList = () => (
    <div className="space-y-2 sm:space-y-3">
      {activities.map((activity) => {
        const isCompleted = isActivityCompleted(activity.id)
        return (
          <label
            key={activity.id}
            className={`flex items-center gap-3 p-3 sm:p-3 rounded-lg cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-emerald-500 min-h-[48px] ${
              isCompleted ? 'bg-emerald-50' : 'hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={() => handleToggleLog(activity.id)}
              className="w-5 h-5 sm:w-5 sm:h-5 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
              aria-label={`Mark ${activity.name} as ${isCompleted ? 'incomplete' : 'complete'}`}
              data-testid="quicklog-activity-checkbox"
            />
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: activity.color }}
              aria-hidden="true"
            />
            <span
              className={`font-medium text-sm sm:text-base ${isCompleted ? 'text-emerald-700' : 'text-gray-900'}`}
            >
              {activity.name}
            </span>
            {isCompleted && (
              <CheckIcon className="w-5 h-5 text-emerald-500 ml-auto flex-shrink-0" />
            )}
          </label>
        )
      })}

      {isCreating ? (
        <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg space-y-3">
          <div>
            <label htmlFor="quicklog-activity-name" className="sr-only">Activity name</label>
            <input
              id="quicklog-activity-name"
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Activity name"
              aria-label="New activity name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              data-testid="quicklog-new-activity-input"
            />
          </div>
          <ColorPicker
            value={newColor}
            onChange={setNewColor}
            colors={ACTIVITY_COLORS}
            size="sm"
            testIdPrefix="quicklog-color"
          />
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
          className="flex items-center gap-2 w-full p-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500"
          data-testid="quicklog-new-activity-button"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="font-medium">New activity</span>
        </button>
      )}
    </div>
  )

  const renderEmptyState = () => (
    <div className="text-center py-8">
      {isCreating ? (
        <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg space-y-3">
          <div>
            <label htmlFor="quicklog-empty-activity-name" className="sr-only">Activity name</label>
            <input
              id="quicklog-empty-activity-name"
              ref={nameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Activity name"
              aria-label="New activity name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              data-testid="quicklog-new-activity-input"
            />
          </div>
          <ColorPicker
            value={newColor}
            onChange={setNewColor}
            colors={ACTIVITY_COLORS}
            size="sm"
            testIdPrefix="quicklog-color"
            centered
          />
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
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quicklog-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setSelectedDate(null)}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className="relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4 p-4 sm:p-6 max-h-[85vh] overflow-y-auto"
        data-testid="quicklog-modal"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="quicklog-title" className="text-base sm:text-lg font-semibold text-gray-900">{formatDisplayDate(date)}</h2>
          <button
            onClick={() => setSelectedDate(null)}
            className="p-2.5 sm:p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Close quick log"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {activities.length === 0 ? renderEmptyState() : renderActivityList()}

        <div className="mt-4 sm:mt-6 flex justify-end">
          <Button onClick={() => setSelectedDate(null)} data-testid="quicklog-done-button" className="min-h-[44px] sm:min-h-0 w-full sm:w-auto">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
})
