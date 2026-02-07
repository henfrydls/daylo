import { useState, useEffect } from 'react'
import { Button, Modal } from '../ui'
import { ACTIVITY_COLORS } from '../../lib/colors'
import { useCalendarStore } from '../../store'
import { formatDate } from '../../lib/dates'
import type { Activity } from '../../types'

interface ActivityFormProps {
  isOpen: boolean
  onClose: () => void
  activity?: Activity
}

export function ActivityForm({ isOpen, onClose, activity }: ActivityFormProps) {
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

  const { addActivity, updateActivity, toggleLog } = useCalendarStore()

  const isEditing = Boolean(activity)

  const handleSubmit = (e: React.FormEvent): void => {
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
  }

  const handleClose = (): void => {
    setName(activity?.name || '')
    setColor(activity?.color || ACTIVITY_COLORS[0].value)
    setLogForDate(false)
    setSelectedDate(formatDate(new Date()))
    onClose()
  }

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

        <fieldset className="mb-4">
          <legend className="block text-sm font-medium text-gray-700 mb-2">Color</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select activity color">
            {ACTIVITY_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`w-8 h-8 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${
                  color === c.value
                    ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c.value }}
                aria-label={`${c.name} color`}
                aria-pressed={color === c.value}
                data-testid="color-option"
              />
            ))}
          </div>
        </fieldset>

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
}
