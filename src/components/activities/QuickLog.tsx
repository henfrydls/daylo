import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useCalendarStore } from '../../store'
import { formatDisplayDate, parseDateString } from '../../lib/dates'
import { ACTIVITY_COLORS } from '../../lib/colors'
import { Button, Checkbox, ColorPicker, PlusIcon, XIcon } from '../ui'
import { useFocusTrap, useAnimatedPresence } from '../../hooks'
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
  const [bouncingId, setBouncingId] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Every color already worn by an activity: this form only ever creates, so none of
  // them belongs to what is being edited.
  const colorsInUse = useMemo(() => activities.map((a) => a.color), [activities])

  const handleClose = useCallback(() => {
    setSelectedDate(null)
  }, [setSelectedDate])

  useFocusTrap(modalRef, !!selectedDate, { onEscape: handleClose })

  useEffect(() => {
    if (isCreating && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isCreating])

  const isOpen = !!selectedDate
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 250)

  /**
   * One frame under the bottom edge before it comes up.
   *
   * A transition only runs when the value it is leaving has been painted, and this sheet
   * was being put into the page already arrived: `isVisible` is true on the very first
   * render, so there was never a frame at `translate-y-full` for it to travel from. It
   * appeared, and Henfry said so the first time he held 1.4.1. Two frames rather than one,
   * the same as the bottom sheet, because one is not reliably enough for the first state
   * to have been drawn.
   */
  const [hasEntered, setHasEntered] = useState(false)
  useEffect(() => {
    if (!isVisible) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setHasEntered(false)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    // The frames belong to this opening. A sheet shut before they land would otherwise be
    // marked as arrived while it is closed, and the next opening would have nowhere to
    // come up from: it would be back to appearing, which is the whole fault being fixed.
    let thisOpening = true
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (thisOpening) setHasEntered(true)
      })
    )
    return () => {
      thisOpening = false
    }
  }, [isVisible])

  const showing = hasEntered && isVisible

  /**
   * The day the sheet is showing, which outlives the day that is selected.
   *
   * Closing clears the selection at once and the sheet is still on the screen for a
   * quarter of a second after that. Reading the selection here would empty the sheet
   * halfway out, which is worse than the jump this is fixing.
   */
  const [dayShown, setDayShown] = useState<string | null>(null)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (selectedDate) setDayShown(selectedDate)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedDate])
  const day = selectedDate ?? dayShown

  // Memoize day logs to prevent recalculation on every render
  const dayLogs = useMemo(() => {
    if (!day) return []
    return logs.filter((l) => l.date === day)
  }, [logs, day])

  // Memoize completed activity IDs set for O(1) lookups
  const completedActivityIds = useMemo(() => {
    const ids = new Set<string>()
    dayLogs.forEach((l) => {
      if (l.completed) ids.add(l.activityId)
    })
    return ids
  }, [dayLogs])

  const isActivityCompleted = useCallback(
    (activityId: string): boolean => {
      return completedActivityIds.has(activityId)
    },
    [completedActivityIds]
  )

  const handleToggleLog = useCallback(
    (activityId: string): void => {
      if (!selectedDate) return
      toggleLog(activityId, selectedDate)
      setBouncingId(activityId)
    },
    [selectedDate, toggleLog]
  )

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCreateActivity()
      } else if (e.key === 'Escape') {
        handleCancelCreating()
      }
    },
    [handleCreateActivity, handleCancelCreating]
  )

  // Early return after all hooks. On the way out `selectedDate` is already null and this
  // used to return null with it, which is why mounting the sheet for longer would not have
  // been enough on its own: it took itself off the page.
  if (!shouldRender || !day) return null

  const date = parseDateString(day)

  const renderCreationForm = ({ centered, inputId }: { centered?: boolean; inputId: string }) => (
    <div className="space-y-3">
      <div>
        <label htmlFor={inputId} className="sr-only">
          Activity name
        </label>
        <input
          id={inputId}
          ref={nameInputRef}
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Activity name"
          aria-label="New activity name"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] sm:min-h-0"
          data-testid="quicklog-new-activity-input"
        />
      </div>
      <ColorPicker
        value={newColor}
        onChange={setNewColor}
        colors={ACTIVITY_COLORS}
        colorsInUse={colorsInUse}
        size="sm"
        label=""
        testIdPrefix="quicklog-color"
        autoCollapse
        {...(centered ? { centered: true } : {})}
      />
      <div className={`flex gap-2 ${centered ? 'justify-center' : 'justify-end'}`}>
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
  )

  const renderActivityList = () => (
    <div className="space-y-2 sm:space-y-3">
      {activities.map((activity) => {
        const isCompleted = isActivityCompleted(activity.id)
        return (
          <label
            key={activity.id}
            className={`flex items-center gap-3 p-3 sm:p-3 rounded-lg cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500 min-h-[48px] ${
              isCompleted ? 'bg-emerald-50' : 'hover:bg-gray-50'
            }`}
            // The animation event comes from the checkbox and bubbles to here.
            onAnimationEnd={() => {
              if (bouncingId === activity.id) setBouncingId(null)
            }}
          >
            <Checkbox
              checked={isCompleted}
              onChange={() => handleToggleLog(activity.id)}
              className={bouncingId === activity.id ? 'checkbox-bounce' : ''}
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
          </label>
        )
      })}

      <button
        onClick={handleStartCreating}
        className="flex items-center gap-2 w-full p-3 border-2 border-dashed border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[48px] sm:min-h-0"
        data-testid="quicklog-new-activity-button"
      >
        <PlusIcon className="w-5 h-5" />
        <span className="font-medium">New activity</span>
      </button>
    </div>
  )

  const renderEmptyState = () => (
    <div className="text-center py-4">
      {isCreating ? (
        renderCreationForm({ centered: true, inputId: 'quicklog-empty-activity-name' })
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
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-250 ${showing ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => setSelectedDate(null)}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4 px-6 py-4 sm:p-6 max-h-[85dvh] overflow-y-auto transition-all duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          showing
            ? 'translate-y-0 opacity-100 sm:scale-100'
            : 'translate-y-full opacity-0 sm:translate-y-0 sm:scale-95'
        }`}
        data-testid="quicklog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quicklog-title"
      >
        {/* Drag handle - mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden" aria-hidden="true">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <h2 id="quicklog-title" className="text-base sm:text-lg font-semibold text-gray-900">
            {formatDisplayDate(date)}
          </h2>
          <button
            onClick={() => setSelectedDate(null)}
            className="p-2.5 sm:p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Close quick log"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div
          key={isCreating ? 'creating' : 'list'}
          style={{ animation: 'view-fade 150ms ease both' }}
        >
          {isCreating ? (
            renderCreationForm({ inputId: 'quicklog-activity-name' })
          ) : (
            <>
              {activities.length === 0 ? renderEmptyState() : renderActivityList()}
              {/* Done closes a sheet whose work is done, and with no activities there is
                  no work: nothing here can be ticked. The only thing to do is create the
                  first one, and the cross in the corner is already the way out. Two
                  buttons where one of them does nothing make somebody read both to find
                  out which is which. */}
              {activities.length > 0 && (
                <div className="mt-4 sm:mt-6 flex justify-end">
                  <Button
                    onClick={() => setSelectedDate(null)}
                    data-testid="quicklog-done-button"
                    className="w-full sm:w-auto"
                  >
                    Done
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
})
