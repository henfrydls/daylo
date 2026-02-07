import { useState } from 'react'
import { Button, Modal } from '../ui'
import { ACTIVITY_COLORS } from '../../lib/colors'
import { useCalendarStore } from '../../store'
import type { Activity } from '../../types'

interface ActivityFormProps {
  isOpen: boolean
  onClose: () => void
  activity?: Activity
}

export function ActivityForm({ isOpen, onClose, activity }: ActivityFormProps) {
  const [name, setName] = useState(activity?.name || '')
  const [color, setColor] = useState(activity?.color || ACTIVITY_COLORS[0].value)

  const { addActivity, updateActivity } = useCalendarStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (activity) {
      updateActivity(activity.id, { name: name.trim(), color })
    } else {
      addActivity(name.trim(), color)
    }

    setName('')
    setColor(ACTIVITY_COLORS[0].value)
    onClose()
  }

  const handleClose = () => {
    setName(activity?.name || '')
    setColor(activity?.color || ACTIVITY_COLORS[0].value)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={activity ? 'Edit Activity' : 'New Activity'} data-testid="activity-form-modal">
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

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                className={`w-8 h-8 rounded-full transition-all ${
                  color === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c.value }}
                aria-label={`Select ${c.name} color`}
                data-testid="color-option"
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()} data-testid="activity-form-submit">
            {activity ? 'Save Changes' : 'Create Activity'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
