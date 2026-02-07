import { describe, it, expect, beforeEach } from 'vitest'
import { useCalendarStore } from './index'

describe('useCalendarStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCalendarStore.setState({
      activities: [],
      logs: [],
      selectedYear: new Date().getFullYear(),
      selectedDate: null,
    })
  })

  describe('activities', () => {
    it('should add activity', () => {
      const { addActivity } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const { activities } = useCalendarStore.getState()
      expect(activities.length).toBe(1)
      expect(activities[0].name).toBe('Exercise')
      expect(activities[0].color).toBe('#10B981')
    })

    it('should update activity', () => {
      const { addActivity, updateActivity } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      updateActivity(activity.id, { name: 'Workout', color: '#3B82F6' })

      const updated = useCalendarStore.getState().activities[0]
      expect(updated.name).toBe('Workout')
      expect(updated.color).toBe('#3B82F6')
    })

    it('should delete activity and related logs', () => {
      const { addActivity, toggleLog, deleteActivity } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')

      expect(useCalendarStore.getState().logs.length).toBe(1)

      deleteActivity(activity.id)

      expect(useCalendarStore.getState().activities.length).toBe(0)
      expect(useCalendarStore.getState().logs.length).toBe(0)
    })
  })

  describe('logs', () => {
    it('should toggle log on (create)', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')

      const { logs } = useCalendarStore.getState()
      expect(logs.length).toBe(1)
      expect(logs[0].activityId).toBe(activity.id)
      expect(logs[0].date).toBe('2024-01-15')
      expect(logs[0].completed).toBe(true)
    })

    it('should toggle log off (update)', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15') // Create
      toggleLog(activity.id, '2024-01-15') // Toggle off

      const { logs } = useCalendarStore.getState()
      expect(logs[0].completed).toBe(false)
    })

    it('should update log notes', () => {
      const { addActivity, toggleLog, updateLogNotes } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')

      const log = useCalendarStore.getState().logs[0]
      updateLogNotes(log.id, 'Great workout!')

      expect(useCalendarStore.getState().logs[0].notes).toBe('Great workout!')
    })
  })

  describe('navigation', () => {
    it('should set selected year', () => {
      const { setSelectedYear } = useCalendarStore.getState()
      setSelectedYear(2023)

      expect(useCalendarStore.getState().selectedYear).toBe(2023)
    })

    it('should set selected date', () => {
      const { setSelectedDate } = useCalendarStore.getState()
      setSelectedDate('2024-01-15')

      expect(useCalendarStore.getState().selectedDate).toBe('2024-01-15')
    })

    it('should clear selected date', () => {
      const { setSelectedDate } = useCalendarStore.getState()
      setSelectedDate('2024-01-15')
      setSelectedDate(null)

      expect(useCalendarStore.getState().selectedDate).toBe(null)
    })
  })

  describe('helpers', () => {
    it('should get logs for date', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')
      addActivity('Reading', '#3B82F6')

      const activities = useCalendarStore.getState().activities
      toggleLog(activities[0].id, '2024-01-15')
      toggleLog(activities[1].id, '2024-01-15')
      toggleLog(activities[0].id, '2024-01-16')

      const logsForDate = useCalendarStore.getState().getLogsForDate('2024-01-15')
      expect(logsForDate.length).toBe(2)
    })

    it('should get logs for activity', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')
      toggleLog(activity.id, '2024-01-16')
      toggleLog(activity.id, '2024-01-17')

      const logsForActivity = useCalendarStore.getState().getLogsForActivity(activity.id)
      expect(logsForActivity.length).toBe(3)
    })
  })
})
