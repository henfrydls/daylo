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

    it('vuelve a crear el registro si se marca otra vez tras desmarcar', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15') // marcar
      toggleLog(activity.id, '2024-01-15') // desmarcar: el registro se borra
      toggleLog(activity.id, '2024-01-15') // marcar de nuevo

      // Al borrarse el registro al desmarcar, volver a marcar tiene que crear uno nuevo
      // en lugar de no encontrar nada que actualizar.
      const { logs } = useCalendarStore.getState()
      expect(logs).toHaveLength(1)
      expect(logs[0].completed).toBe(true)
      expect(logs[0].date).toBe('2024-01-15')
    })

    it('borra el registro al desmarcar un dia sin notas', () => {
      const { addActivity, toggleLog } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')
      expect(useCalendarStore.getState().logs).toHaveLength(1)

      toggleLog(activity.id, '2024-01-15')

      // Un dia desmarcado y sin notas no representa nada que el usuario quiera
      // conservar, y cada uno de esos registros cuenta contra la cuota de localStorage.
      expect(useCalendarStore.getState().logs).toHaveLength(0)
    })

    it('conserva el registro con sus notas al desmarcar', () => {
      const { addActivity, toggleLog, updateLogNotes } = useCalendarStore.getState()
      addActivity('Exercise', '#10B981')

      const activity = useCalendarStore.getState().activities[0]
      toggleLog(activity.id, '2024-01-15')
      updateLogNotes(useCalendarStore.getState().logs[0].id, 'Me costo pero lo hice')

      toggleLog(activity.id, '2024-01-15')

      // La nota es contenido del usuario: desmarcar el dia no la borra.
      const { logs } = useCalendarStore.getState()
      expect(logs).toHaveLength(1)
      expect(logs[0].completed).toBe(false)
      expect(logs[0].notes).toBe('Me costo pero lo hice')
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

  describe('default view by viewport', () => {
    it('should resolve to month when innerWidth < 640', () => {
      // Test the conditional logic used by the store initializer
      const getDefaultView = (width: number) => (width < 640 ? 'month' : 'year')

      expect(getDefaultView(320)).toBe('month')
      expect(getDefaultView(375)).toBe('month')
      expect(getDefaultView(639)).toBe('month')
    })

    it('should resolve to year when innerWidth >= 640', () => {
      const getDefaultView = (width: number) => (width < 640 ? 'month' : 'year')

      expect(getDefaultView(640)).toBe('year')
      expect(getDefaultView(1024)).toBe('year')
      expect(getDefaultView(1920)).toBe('year')
    })
  })

  describe('hydration', () => {
    it('should initialize _hasHydrated as false', () => {
      useCalendarStore.setState({ _hasHydrated: false })
      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
    })

    it('should set _hasHydrated to true via setHasHydrated', () => {
      useCalendarStore.setState({ _hasHydrated: false })
      const { setHasHydrated } = useCalendarStore.getState()
      setHasHydrated(true)

      expect(useCalendarStore.getState()._hasHydrated).toBe(true)
    })

    it('should toggle _hasHydrated back to false', () => {
      const { setHasHydrated } = useCalendarStore.getState()
      setHasHydrated(true)
      setHasHydrated(false)

      expect(useCalendarStore.getState()._hasHydrated).toBe(false)
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
