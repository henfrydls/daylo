import { useMemo } from 'react'
import { DayCell } from './DayCell'
import { useCalendarStore } from '../../store'
import { getYearDays, formatDate, getFirstDayOffset } from '../../lib/dates'
import { calculateHeatmapLevel } from '../../lib/colors'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function YearView() {
  const { selectedYear, activities, logs, setSelectedDate, setSelectedYear, navigateToMonth } = useCalendarStore()

  const yearDays = useMemo(() => getYearDays(selectedYear), [selectedYear])
  const firstDayOffset = useMemo(() => getFirstDayOffset(selectedYear), [selectedYear])

  const dayDataMap = useMemo(() => {
    const map = new Map<
      string,
      { completedCount: number; level: 0 | 1 | 2 | 3 | 4 }
    >()
    const totalActivities = activities.length

    yearDays.forEach((date) => {
      const dateStr = formatDate(date)
      const dayLogs = logs.filter((l) => l.date === dateStr && l.completed)
      const completedCount = dayLogs.length
      const level = calculateHeatmapLevel(completedCount, totalActivities)
      map.set(dateStr, { completedCount, level })
    })

    return map
  }, [yearDays, activities.length, logs])

  const handlePrevYear = () => setSelectedYear(selectedYear - 1)
  const handleNextYear = () => setSelectedYear(selectedYear + 1)
  const handleCurrentYear = () => setSelectedYear(new Date().getFullYear())

  const weeks = useMemo(() => {
    const result: (Date | null)[][] = []
    let currentWeek: (Date | null)[] = []

    // Add empty cells for the first week offset
    for (let i = 0; i < firstDayOffset; i++) {
      currentWeek.push(null)
    }

    yearDays.forEach((date) => {
      currentWeek.push(date)
      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
      }
    })

    // Fill the last week with nulls if needed
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      result.push(currentWeek)
    }

    return result
  }, [yearDays, firstDayOffset])

  return (
    <div className="p-6">
      {/* Year Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{selectedYear}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevYear}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Previous year"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNextYear}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Next year"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={handleCurrentYear}
              className="ml-2 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Today
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-100" />
            <div className="w-3 h-3 rounded-sm bg-emerald-100" />
            <div className="w-3 h-3 rounded-sm bg-emerald-300" />
            <div className="w-3 h-3 rounded-sm bg-emerald-400" />
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          </div>
          <span>More</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Month Labels */}
          <div className="flex mb-2 text-xs text-gray-500">
            <div className="w-8" /> {/* Spacer for day labels */}
            {MONTHS.map((month, index) => (
              <button
                key={month}
                onClick={() => navigateToMonth(selectedYear, index)}
                className="flex-1 min-w-[52px] text-center hover:text-emerald-600 hover:font-medium transition-colors cursor-pointer rounded py-0.5"
                aria-label={`View ${month} ${selectedYear}`}
              >
                {month}
              </button>
            ))}
          </div>

          {/* Grid with Day Labels */}
          <div className="flex">
            {/* Day Labels */}
            <div className="flex flex-col gap-1 mr-2 text-xs text-gray-500">
              {DAYS.map((day, i) => (
                <div key={day} className="h-3 flex items-center">
                  {i % 2 === 1 ? day : ''}
                </div>
              ))}
            </div>

            {/* Weeks Grid */}
            <div className="flex gap-1">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((date, dayIndex) => {
                    if (!date) {
                      return <div key={`empty-${dayIndex}`} className="w-3 h-3" />
                    }
                    const dateStr = formatDate(date)
                    const dayData = dayDataMap.get(dateStr) || { completedCount: 0, level: 0 as const }
                    return (
                      <DayCell
                        key={dateStr}
                        date={date}
                        level={dayData.level}
                        completedCount={dayData.completedCount}
                        totalActivities={activities.length}
                        onClick={() => setSelectedDate(dateStr)}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
