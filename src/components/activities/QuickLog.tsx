import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useCalendarStore } from '../../store'
import { formatDisplayDate, formatTodayTitle, parseDateString } from '../../lib/dates'
import { useToday } from '../../lib/today'
import { onScreen } from '../../lib/onScreen'
import { ACTIVITY_COLORS, firstFreeColor } from '../../lib/colors'
import { Button, Checkbox, ColorPicker, PlusIcon, XIcon } from '../ui'
import { useFocusTrap, useAnimatedPresence } from '../../hooks'
import { useShallow } from 'zustand/react/shallow'
import { LONGEST_NAME } from '../../lib/limits'
import { YesterdayLine } from './YesterdayLine'

export const QuickLog = memo(function QuickLog() {
  // Use individual selectors to prevent over-subscription
  const selectedDate = useCalendarStore((state) => state.selectedDate)
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const logs = useCalendarStore(useShallow((state) => state.logs))
  const toggleLog = useCalendarStore((state) => state.toggleLog)
  const addActivity = useCalendarStore((state) => state.addActivity)
  // The app's day, which is what "Today" in the title and in the first day's line mean.
  const todayStr = useToday()

  /**
   * Today's sheet with no activities opens on the form. The door on the first day leads
   * here, and the only thing to do on this sheet is to name the first activity; the
   * empty state's button in between was one more press for nothing. Only as it opens:
   * Cancel goes back to the empty state and stays there. Any other day opens as it did.
   */
  const opensOnTheForm = (date: string | null) => activities.length === 0 && date === todayStr

  const [isCreating, setIsCreating] = useState(() => opensOnTheForm(selectedDate))
  /**
   * Whether the first activity was born in this opening of today's sheet, which is all the
   * line under the title remembers, and only for as long as the sheet is open. Nothing is
   * saved. Never on another day's sheet: "Today is in" would not be true there. Gone for
   * good, in this opening too, once today is unticked or the form opens again.
   */
  const [firstBornHere, setFirstBornHere] = useState(false)
  const [newName, setNewName] = useState('')
  // Only what the person picked. Until they pick, the form offers the first color free
  // at that moment, worked out as it is drawn, so it cannot go stale while it waits.
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const [bouncingId, setBouncingId] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Every color already worn by an activity: this form only ever creates, so none of
  // them belongs to what is being edited.
  const colorsInUse = useMemo(() => activities.map((a) => a.color), [activities])
  // Painted with the rule the store uses when it is not handed a color, over the same
  // activities, so the activity is saved in the color it was shown in.
  const newColor = pickedColor ?? firstFreeColor(colorsInUse)

  const handleClose = useCallback(() => {
    setSelectedDate(null)
  }, [setSelectedDate])

  // The door that opens today's sheet on the first day is gone once the first activity is
  // made there, and the Today bar is in its place: that is where the focus goes back to.
  // Closed with nothing made, the door is still there, but maybe not the one that was
  // pressed: from Year it went into the hidden view on the way to Month, and the focus
  // goes to the door on the month instead. Asked one after the other: one selector with
  // both would take whichever comes first on the page, not the bar first.
  useFocusTrap(modalRef, !!selectedDate, {
    onEscape: handleClose,
    fallbackFocus: () =>
      onScreen('[data-testid="log-today-bar"]') ?? onScreen('[data-testid="first-day-door"]'),
  })

  const isOpen = !!selectedDate
  const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 250)

  // When the sheet opens straight on the form, the field is not on the page yet as
  // `isCreating` turns true: the sheet is put there a render later. So this waits for the
  // sheet as well. And once more after the focus trap's own first focus, which goes to the
  // first thing it finds (the cross) a moment after a sheet that was still on the page
  // opens again.
  useEffect(() => {
    if (!isCreating || !shouldRender) return
    nameInputRef.current?.focus()
    const again = setTimeout(() => nameInputRef.current?.focus(), 0)
    return () => clearTimeout(again)
  }, [isCreating, shouldRender])

  // A half-made activity goes with the sheet. Closing it with the form open used to leave
  // the form open, holding what was typed and picked, and the next day opened straight
  // onto it. Cleared as the sheet opens again rather than as it closes: closing it there
  // would fold the form up while the sheet is still sliding away, and waiting for the
  // sheet to finish leaving let a quick close and reopen bring the form back.
  const [wasOpen, setWasOpen] = useState(isOpen)
  // Counts the openings, so what yesterday's line remembers lasts one of them. A quick close
  // and reopen keeps the sheet mounted, and without this the line would remember the last.
  const [opening, setOpening] = useState(0)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setOpening((n) => n + 1)
      setIsCreating(opensOnTheForm(selectedDate))
      setFirstBornHere(false)
      setNewName('')
      setPickedColor(null)
    }
  }

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
      // While the first day's line is up, the one row there is the activity just born
      // ticked, so any tick unticks it and "Today is in" stops being true. It goes, and
      // ticking again does not bring it back: it has been said.
      setFirstBornHere(false)
    },
    [selectedDate, toggleLog]
  )

  const handleStartCreating = useCallback((): void => {
    // Once means once: Cancel must not bring the line back to be read out again.
    setFirstBornHere(false)
    setIsCreating(true)
    setNewName('')
    setPickedColor(null)
  }, [])

  const handleCancelCreating = useCallback((): void => {
    setIsCreating(false)
    setNewName('')
  }, [])

  const handleCreateActivity = useCallback((): void => {
    if (!newName.trim() || !selectedDate) return

    const isFirst = useCalendarStore.getState().activities.length === 0

    // The color only if somebody picked one; otherwise the store gives it the free one,
    // which is what the form has been showing.
    addActivity(newName.trim(), pickedColor ?? undefined)

    // Get the newly created activity (last one in the array)
    const updatedActivities = useCalendarStore.getState().activities
    const newActivity = updatedActivities[updatedActivities.length - 1]

    // Logged on the sheet's own day, whichever day that is: the person opened that day to
    // say they did it.
    if (newActivity) {
      toggleLog(newActivity.id, selectedDate)
    }
    if (isFirst && selectedDate === todayStr) setFirstBornHere(true)

    setIsCreating(false)
    setNewName('')
  }, [newName, pickedColor, selectedDate, todayStr, addActivity, toggleLog])

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
          placeholder="e.g., Exercise, Read, Meditate"
          aria-label="New activity name"
          // See ActivityForm: the limit belongs where the name is made, not where a backup
          // of it comes home.
          maxLength={LONGEST_NAME}
          // The browser's placeholder grey is half the text colour, 3.41:1 on white, and the
          // examples are words to read now. gray-500 is 4.84:1.
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] sm:min-h-0"
          data-testid="quicklog-new-activity-input"
        />
      </div>
      <ColorPicker
        value={newColor}
        onChange={setPickedColor}
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
            className={`flex items-center gap-3 p-3 sm:p-3 rounded-lg cursor-pointer transition-colors has-focus-visible:ring-2 has-focus-visible:ring-emerald-500 min-h-[48px] ${
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
        // Read by index.css, which dims the scrollbar's strip along with the page.
        data-backdrop="dim"
        data-shown={showing}
      />
      <div
        ref={modalRef}
        className={`relative bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full mx-0 sm:mx-4 px-6 pt-4 pb-[calc(1rem+var(--inset-bottom))] sm:pt-6 sm:pb-[calc(1.5rem+var(--inset-bottom))] max-h-[85dvh] overflow-y-auto transition-all duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
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
            {day === todayStr ? formatTodayTitle(date) : formatDisplayDate(date)}
          </h2>
          <button
            onClick={() => setSelectedDate(null)}
            className="p-2.5 sm:p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Close quick log"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Only on yesterday's sheet, and only on a morning when yesterday is still open. */}
        <YesterdayLine key={`${opening}-${day}`} day={day} />

        {/* The first day's reward, said once: in the opening of today's sheet where the
            first activity was born, until today is unticked or another activity is started.
            Closing the sheet takes it for good. The same box as
            yesterday's line, so the list does not move: -mt-2 brings it to the title, mb-4
            parts it from the row. gray-600 on white is 7.56:1. */}
        {firstBornHere ? (
          <p
            className="-mt-2 mb-4 text-sm text-gray-600 sm:text-balance"
            aria-live="polite"
            data-testid="first-day-line"
          >
            Today is in. Log it again tomorrow.
          </p>
        ) : null}

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
