import { useState, useCallback, memo } from 'react'
import { Button, ConfirmDialog, PencilIcon, TrashIcon, useToast } from '../ui'
import { ActivityForm } from './ActivityForm'
import { useCalendarStore } from '../../store'
import type { Activity } from '../../types'
import { useShallow } from 'zustand/react/shallow'

export const ActivityList = memo(function ActivityList() {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | undefined>()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean
    activityId: string | null
  }>({
    isOpen: false,
    activityId: null,
  })

  // Use individual selectors to prevent over-subscription
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const deleteActivity = useCalendarStore((state) => state.deleteActivity)
  const { showToast } = useToast()

  const handleEdit = useCallback((activity: Activity) => {
    setEditingActivity(activity)
    setIsFormOpen(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false)
    setEditingActivity(undefined)
  }, [])

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteConfirm({ isOpen: true, activityId: id })
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirm.activityId) {
      deleteActivity(deleteConfirm.activityId)
      showToast('Activity deleted', 'success')
    }
  }, [deleteConfirm.activityId, deleteActivity, showToast])

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeleteConfirm({ isOpen: false, activityId: null })
  }, [])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">Activities</h2>
        <Button
          size="sm"
          onClick={() => setIsFormOpen(true)}
          data-testid="add-activity-button"
          className="min-h-[44px] sm:min-h-0"
        >
          + Add
        </Button>
      </div>

      {activities.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          No activities yet. Create one to start tracking!
        </p>
      ) : (
        <ul className="space-y-2" role="list" aria-label="Activities list">
          {activities.map((activity) => (
            <li
              key={activity.id}
              className="flex items-center justify-between p-2 sm:p-3 rounded-lg hover:bg-gray-50 focus-within:bg-gray-50 transition-colors group"
              data-testid="activity-item"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: activity.color }}
                  aria-hidden="true"
                />
                <span className="text-gray-900 font-medium text-sm sm:text-base truncate">
                  {activity.name}
                </span>
              </div>
              {/* Always visible on mobile (touch devices), hover-only on desktop */}
              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity flex-shrink-0">
                <button
                  onClick={() => handleEdit(activity)}
                  className="p-2.5 sm:p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:opacity-100 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                  aria-label={`Edit ${activity.name}`}
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteClick(activity.id)}
                  className="p-2.5 sm:p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:opacity-100 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                  aria-label={`Delete ${activity.name}`}
                >
                  <TrashIcon className="w-4 h-4" />
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
})
