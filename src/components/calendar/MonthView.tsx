import { useMemo, useCallback } from 'react'
import { useCalendarStore } from '../../store'
import { formatDate, formatMonthYear, checkIsToday } from '../../lib/dates'
import type { Activity, ActivityLog } from '../../types'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DayInfo {
  date: Date
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  logs: ActivityLog[]
}

function getMonthDays(year: number, month: number): DayInfo[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const days: DayInfo[] = []

  // Previous month days
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthLastDay - i)
    days.push({
      date,
      dateStr: formatDate(date),
      isCurrentMonth: false,
      isToday: checkIsToday(date),
      logs: [],
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({
      date,
      dateStr: formatDate(date),
      isCurrentMonth: true,
      isToday: checkIsToday(date),
      logs: [],
    })
  }

  // Next month days to fill the grid (6 rows * 7 days = 42)
  const remainingDays = 42 - days.length
  for (let d = 1; d <= remainingDays; d++) {
    const date = new Date(year, month + 1, d)
    days.push({
      date,
      dateStr: formatDate(date),
      isCurrentMonth: false,
      isToday: checkIsToday(date),
      logs: [],
    })
  }

  return days
}

export function MonthView() {
  const {
    selectedYear,
    selectedMonth,
    setSelectedMonth,
    setSelectedYear,
    setSelectedDate,
    activities,
    logs,
  } = useCalendarStore()

  const monthDays = useMemo(
    () => getMonthDays(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  )

  // Create a map of date -> completed logs
  const logsMap = useMemo(() => {
    const map = new Map<string, ActivityLog[]>()
    logs
      .filter((log) => log.completed)
      .forEach((log) => {
        const existing = map.get(log.date) || []
        existing.push(log)
        map.set(log.date, existing)
      })
    return map
  }, [logs])

  // Enrich days with their logs
  const enrichedDays = useMemo(
    () =>
      monthDays.map((day) => ({
        ...day,
        logs: logsMap.get(day.dateStr) || [],
      })),
    [monthDays, logsMap]
  )

  // Create activity lookup map for colors
  const activityMap = useMemo(() => {
    const map = new Map<string, Activity>()
    activities.forEach((activity) => map.set(activity.id, activity))
    return map
  }, [activities])

  const handlePrevMonth = useCallback((): void => {
    if (selectedMonth === 0) {
      setSelectedYear(selectedYear - 1)
      setSelectedMonth(11)
    } else {
      setSelectedMonth(selectedMonth - 1)
    }
  }, [selectedMonth, selectedYear, setSelectedMonth, setSelectedYear])

  const handleNextMonth = useCallback((): void => {
    if (selectedMonth === 11) {
      setSelectedYear(selectedYear + 1)
      setSelectedMonth(0)
    } else {
      setSelectedMonth(selectedMonth + 1)
    }
  }, [selectedMonth, selectedYear, setSelectedMonth, setSelectedYear])

  const handleToday = useCallback((): void => {
    const today = new Date()
    setSelectedYear(today.getFullYear())
    setSelectedMonth(today.getMonth())
  }, [setSelectedYear, setSelectedMonth])

  const handleDayClick = useCallback(
    (dateStr: string): void => {
      setSelectedDate(dateStr)
    },
    [setSelectedDate]
  )

  const displayDate = new Date(selectedYear, selectedMonth, 1)

  return (
    <div className="p-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{formatMonthYear(displayDate)}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Previous month"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Next month"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
            <button
              onClick={handleToday}
              className="ml-2 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7">
          {enrichedDays.map((day, index) => {
            const isLastRow = index >= 35
            const isLastColumn = (index + 1) % 7 === 0

            return (
              <button
                key={day.dateStr}
                onClick={() => handleDayClick(day.dateStr)}
                className={`
                  relative min-h-[80px] p-2 text-left transition-colors
                  hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500
                  ${!isLastRow ? 'border-b border-gray-200' : ''}
                  ${!isLastColumn ? 'border-r border-gray-200' : ''}
                  ${day.isCurrentMonth ? 'bg-white' : 'bg-gray-50'}
                `}
                aria-label={`${day.dateStr}, ${day.logs.length} activities completed`}
              >
                {/* Day Number */}
                <span
                  className={`
                    inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full
                    ${day.isToday ? 'bg-emerald-500 text-white ring-2 ring-emerald-300' : ''}
                    ${!day.isToday && day.isCurrentMonth ? 'text-gray-900' : ''}
                    ${!day.isToday && !day.isCurrentMonth ? 'text-gray-400' : ''}
                  `}
                >
                  {day.date.getDate()}
                </span>

                {/* Activity Dots */}
                {day.logs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {day.logs.slice(0, 5).map((log) => {
                      const activity = activityMap.get(log.activityId)
                      return (
                        <span
                          key={log.id}
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: activity?.color || '#10B981',
                          }}
                          title={activity?.name}
                        />
                      )
                    })}
                    {day.logs.length > 5 && (
                      <span className="text-xs text-gray-400 font-medium">
                        +{day.logs.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
