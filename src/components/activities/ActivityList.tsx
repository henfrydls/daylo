import { useState } from 'react'
import { Button, ConfirmDialog } from '../ui'
import { ActivityForm } from './ActivityForm'
import { useCalendarStore } from '../../store'
import type { Activity } from '../../types'

export function ActivityList() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | undefined>()
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; activityId: string | null }>({
    isOpen: false,
    activityId: null,
  })

  const { activities, deleteActivity } = useCalendarStore()

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity)
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setEditingActivity(undefined)
  }

  const handleDeleteClick = (id: string) => {
    setDeleteConfirm({ isOpen: true, activityId: id })
  }

  const handleConfirmDelete = () => {
    if (deleteConfirm.activityId) {
      deleteActivity(deleteConfirm.activityId)
    }
  }

  const handleCloseDeleteConfirm = () => {
    setDeleteConfirm({ isOpen: false, activityId: null })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Activities</h2>
        <Button size="sm" onClick={() => setIsFormOpen(true)} data-testid="add-activity-button">
          + Add
        </Button>
      </div>

      {activities.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          No activities yet. Create one to start tracking!
        </p>
      ) : (
        <ul className="space-y-2">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
              data-testid="activity-item"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: activity.color }}
                />
                <span className="text-gray-900 font-medium">{activity.name}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(activity)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  aria-label={`Edit ${activity.name}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteClick(activity.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  aria-label={`Delete ${activity.name}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ActivityForm isOpen={isFormOpen} onClose={handleCloseForm} activity={editingActivity} />

      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        onClose={handleCloseDeleteConfirm}
        onConfirm={handleConfirmDelete}
        title="Delete Activity"
        message="Are you sure you want to delete this activity? All related logs will be lost."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        data-testid="delete-activity-confirm"
      />
    </div>
  )
}
