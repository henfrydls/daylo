import { useState, useCallback, useMemo, memo } from 'react'
import { Button, Checkbox, ColorPicker, Modal } from '../ui'
import { ACTIVITY_COLORS, firstFreeColor } from '../../lib/colors'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'
import type { Activity } from '../../types'
import { LONGEST_NAME } from '../../lib/limits'

interface ActivityFormProps {
  isOpen: boolean
  onClose: () => void
  activity?: Activity
}

/**
 * The submit button lives in the modal's pinned footer, which is outside the form
 * element, so it is tied back to it with the form attribute. Without this the button
 * renders fine and does nothing, which is how four tests caught it.
 */
const FORM_ID = 'activity-form'

/** What an open form with no activity was opened for: making a new one. Not an id. */
const NEW_ACTIVITY = '<new>'

export const ActivityForm = memo(function ActivityForm({
  isOpen,
  onClose,
  activity,
}: ActivityFormProps) {
  const [name, setName] = useState('')
  // Only what the person picked. Until they pick, the form shows the activity's own color,
  // or for a new one the first color nobody wears yet, worked out as it is drawn.
  const [pickedColor, setPickedColor] = useState<string | null>(null)
  const [logForDate, setLogForDate] = useState(false)
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))

  // Use individual selectors to prevent over-subscription
  const activities = useCalendarStore((state) => state.activities)

  // The colors other activities already wear. The one being edited is left out, so its
  // own color is not reported back to it as taken.
  const colorsInUse = useMemo(
    () => activities.filter((a) => a.id !== activity?.id).map((a) => a.color),
    [activities, activity?.id]
  )

  // Painted with the same rule the store uses when it is not handed a color, over the same
  // activities, so a new activity is saved in the color it was shown in without the form
  // passing it on: the store is the one place that decides.
  const color = pickedColor ?? activity?.color ?? firstFreeColor(colorsInUse)

  // Fill the form in each time it opens, or opens onto another activity. Done while
  // rendering rather than in an effect, so the first frame of an open form is already
  // right. Keyed on the activity's id: never on the list of activities, and not on the
  // activity object either, so neither another activity changing nor this one coming
  // back as a new object counts as opening the form again and wipes what was typed.
  // Nothing is reset on the way out, so the form does not empty itself while the dialog
  // is still leaving.
  const openedFor = isOpen ? (activity?.id ?? NEW_ACTIVITY) : null
  const [filledFor, setFilledFor] = useState<string | null>(null)
  if (openedFor !== filledFor) {
    setFilledFor(openedFor)
    if (openedFor !== null) {
      setName(activity?.name || '')
      setPickedColor(null)
      setLogForDate(false)
      setSelectedDate(formatDate(new Date()))
    }
  }

  const addActivity = useCalendarStore((state) => state.addActivity)
  const updateActivity = useCalendarStore((state) => state.updateActivity)
  const toggleLog = useCalendarStore((state) => state.toggleLog)

  const isEditing = Boolean(activity)

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      if (!name.trim()) return

      if (isEditing && activity) {
        updateActivity(activity.id, { name: name.trim(), color })
      } else {
        // The color only if somebody picked one; otherwise the store gives it the free
        // one, which is what the form has been showing.
        addActivity(name.trim(), pickedColor ?? undefined)

        // If logForDate is enabled, log for the selected date
        if (logForDate) {
          // Get the newly created activity (it's the last one in the array after addActivity)
          const newActivity = useCalendarStore.getState().activities.at(-1)
          if (newActivity) {
            toggleLog(newActivity.id, selectedDate)
          }
        }
      }

      // Don't reset state here: it is filled in again when the modal reopens
      // Resetting before onClose causes a flash of "New Activity" during exit animation
      onClose()
    },
    [
      name,
      color,
      pickedColor,
      isEditing,
      activity,
      logForDate,
      selectedDate,
      addActivity,
      updateActivity,
      toggleLog,
      onClose,
    ]
  )

  const handleClose = useCallback((): void => {
    // Don't reset state here: it is filled in again when the modal reopens
    onClose()
  }, [onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={activity ? 'Edit Activity' : 'New Activity'}
      data-testid="activity-form-modal"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!name.trim()}
            data-testid="activity-form-submit"
          >
            {isEditing ? 'Save Changes' : logForDate ? 'Create & Log' : 'Create Activity'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="activity-name" className="block text-sm font-medium text-gray-700 mb-1">
            Activity Name
          </label>
          <input
            id="activity-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Exercise, Read, Meditate"
            // The same number an import will take back, enforced where somebody can see it
            // happen. It used to be checked only on the way in, which is the one direction
            // where it could not help: a name long enough to be refused could only exist
            // because this form had allowed it, and refusing it there threw out the whole
            // backup rather than the name.
            maxLength={LONGEST_NAME}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] sm:min-h-0"
            autoFocus={!isEditing}
            data-testid="activity-name-input"
          />
        </div>

        <ColorPicker
          value={color}
          onChange={setPickedColor}
          colors={ACTIVITY_COLORS}
          colorsInUse={colorsInUse}
          label="Color"
          size="md"
          className="mb-4"
          autoCollapse
        />

        {/* Date logging section - only show when creating new activity */}
        {!isEditing && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 min-h-[44px] sm:min-h-0">
              <Checkbox
                id="log-for-date"
                checked={logForDate}
                onChange={(e) => setLogForDate(e.target.checked)}
                data-testid="log-for-date-checkbox"
              />
              <label htmlFor="log-for-date" className="text-sm font-medium text-gray-700">
                Also log for a date
              </label>
            </div>

            {logForDate && (
              <div className="mt-2">
                <label
                  htmlFor="selected-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Date
                </label>
                <input
                  id="selected-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent min-h-[44px] sm:min-h-0"
                  data-testid="selected-date-input"
                />
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  )
})
