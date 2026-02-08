import { useMemo, useCallback, memo } from 'react'
import { useCalendarStore } from '../../store'
import { formatDate, formatMonthYear, checkIsToday } from '../../lib/dates'
import type { Activity, ActivityLog } from '../../types'
import { useShallow } from 'zustand/react/shallow'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_OF_WEEK_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

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

export const MonthView = memo(function MonthView() {
  // Use individual selectors to prevent over-subscription
  const selectedYear = useCalendarStore((state) => state.selectedYear)
  const selectedMonth = useCalendarStore((state) => state.selectedMonth)
  const setSelectedMonth = useCalendarStore((state) => state.setSelectedMonth)
  const setSelectedYear = useCalendarStore((state) => state.setSelectedYear)
  const setSelectedDate = useCalendarStore((state) => state.setSelectedDate)
  const activities = useCalendarStore(useShallow((state) => state.activities))
  const logs = useCalendarStore(useShallow((state) => state.logs))

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
    <div className="p-3 sm:p-4 md:p-6">
      {/* Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{formatMonthYear(displayDate)}</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevMonth}
            className="p-2.5 sm:p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Previous month"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
            className="p-2.5 sm:p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            aria-label="Next month"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
            className="ml-2 px-3 py-2 sm:py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 min-h-[44px] sm:min-h-0"
            aria-label="Go to current month"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAYS_OF_WEEK.map((day, index) => (
            <div
              key={day}
              className="px-1 sm:px-2 py-2 sm:py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
            >
              {/* Show single letter on mobile, full abbreviation on larger screens */}
              <span className="sm:hidden">{DAYS_OF_WEEK_SHORT[index]}</span>
              <span className="hidden sm:inline">{day}</span>
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
                  relative min-h-[60px] sm:min-h-[80px] p-1.5 sm:p-2 text-left transition-colors
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
                    inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 text-xs sm:text-sm font-medium rounded-full
                    ${day.isToday ? 'bg-emerald-500 text-white ring-2 ring-emerald-300' : ''}
                    ${!day.isToday && day.isCurrentMonth ? 'text-gray-900' : ''}
                    ${!day.isToday && !day.isCurrentMonth ? 'text-gray-400' : ''}
                  `}
                >
                  {day.date.getDate()}
                </span>

                {/* Activity Dots */}
                {day.logs.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-1" aria-hidden="true">
                    {day.logs.slice(0, 3).map((log) => {
                      const activity = activityMap.get(log.activityId)
                      return (
                        <span
                          key={log.id}
                          className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
                          style={{
                            backgroundColor: activity?.color || '#10B981',
                          }}
                        />
                      )
                    })}
                    {day.logs.length > 3 && (
                      <span className="text-[10px] sm:text-xs text-gray-400 font-medium">
                        +{day.logs.length - 3}
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
})
