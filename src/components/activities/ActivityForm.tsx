import { useState, useEffect, useCallback, memo } from 'react'
import { Button, Modal, ColorPicker } from '../ui'
import { ACTIVITY_COLORS } from '../../lib/colors'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'
import type { Activity } from '../../types'

interface ActivityFormProps {
  isOpen: boolean
  onClose: () => void
  activity?: Activity
}

export const ActivityForm = memo(function ActivityForm({ isOpen, onClose, activity }: ActivityFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(ACTIVITY_COLORS[0].value)
  const [logForDate, setLogForDate] = useState(false)
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))

  // Sync form state with activity prop when modal opens or activity changes
  useEffect(() => {
    if (isOpen) {
      setName(activity?.name || '')
      setColor(activity?.color || ACTIVITY_COLORS[0].value)
      setLogForDate(false)
      setSelectedDate(formatDate(new Date()))
    }
  }, [isOpen, activity])

  // Use individual selectors to prevent over-subscription
  const addActivity = useCalendarStore((state) => state.addActivity)
  const updateActivity = useCalendarStore((state) => state.updateActivity)
  const toggleLog = useCalendarStore((state) => state.toggleLog)

  const isEditing = Boolean(activity)

  const handleSubmit = useCallback((e: React.FormEvent): void => {
    e.preventDefault()
    if (!name.trim()) return

    if (isEditing && activity) {
      updateActivity(activity.id, { name: name.trim(), color })
    } else {
      // Create the activity
      addActivity(name.trim(), color)

      // If logForDate is enabled, log for the selected date
      if (logForDate) {
        // Get the newly created activity (it's the last one in the array after addActivity)
        const newActivity = useCalendarStore.getState().activities.at(-1)
        if (newActivity) {
          toggleLog(newActivity.id, selectedDate)
        }
      }
    }

    // Reset form state
    setName('')
    setColor(ACTIVITY_COLORS[0].value)
    setLogForDate(false)
    setSelectedDate(formatDate(new Date()))
    onClose()
  }, [name, color, isEditing, activity, logForDate, selectedDate, addActivity, updateActivity, toggleLog, onClose])

  const handleClose = useCallback((): void => {
    setName(activity?.name || '')
    setColor(activity?.color || ACTIVITY_COLORS[0].value)
    setLogForDate(false)
    setSelectedDate(formatDate(new Date()))
    onClose()
  }, [activity, onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={activity ? 'Edit Activity' : 'New Activity'}
      data-testid="activity-form-modal"
    >
      <form onSubmit={handleSubmit}>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            autoFocus
            data-testid="activity-name-input"
          />
        </div>

        <ColorPicker
          value={color}
          onChange={setColor}
          colors={ACTIVITY_COLORS}
          label="Color"
          size="md"
          className="mb-4"
        />

        {/* Date logging section - only show when creating new activity */}
        {!isEditing && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <input
                id="log-for-date"
                type="checkbox"
                checked={logForDate}
                onChange={(e) => setLogForDate(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  data-testid="selected-date-input"
                />
              </div>
            )}
          </div>
        )}

        {/* Add bottom margin when editing (no date section shown) */}
        {isEditing && <div className="mb-2" />}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()} data-testid="activity-form-submit">
            {isEditing ? 'Save Changes' : logForDate ? 'Create & Log' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </Modal>
  )
})
