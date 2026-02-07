import { useMemo } from 'react'
import { DayCell } from './DayCell'
import { useCalendarStore } from '../../store'
import { getYearDays, formatDate } from '../../lib/dates'
import { calculateHeatmapLevel } from '../../lib/colors'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Fixed number of weeks per month for consistent layout
const WEEKS_PER_MONTH = 6

interface MonthData {
  month: number
  weeks: (Date | null)[][]
}

export function YearView() {
  const { selectedYear, activities, logs, setSelectedDate, setSelectedYear, navigateToMonth } = useCalendarStore()

  const yearDays = useMemo(() => getYearDays(selectedYear), [selectedYear])

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

  // Group days by month with exactly 6 weeks (42 cells) per month for consistent layout
  const monthsData = useMemo(() => {
    const months: MonthData[] = []

    for (let month = 0; month < 12; month++) {
      // Get all days for this month
      const monthDays = yearDays.filter((date) => date.getMonth() === month)

      if (monthDays.length === 0) continue

      // Get the day of week for the first day of the month (0 = Sunday, 6 = Saturday)
      const firstDayOfMonth = monthDays[0].getDay()

      // Create array of 42 cells (6 weeks x 7 days)
      const cells: (Date | null)[] = []

      // Add empty cells at the beginning for offset
      for (let i = 0; i < firstDayOfMonth; i++) {
        cells.push(null)
      }

      // Add all days of the month
      monthDays.forEach((date) => {
        cells.push(date)
      })

      // Fill remaining cells to complete 42 (6 weeks)
      const totalCells = WEEKS_PER_MONTH * 7 // 42 cells
      while (cells.length < totalCells) {
        cells.push(null)
      }

      // Convert flat array to weeks (7 days each)
      const weeks: (Date | null)[][] = []
      for (let i = 0; i < WEEKS_PER_MONTH; i++) {
        weeks.push(cells.slice(i * 7, (i + 1) * 7))
      }

      months.push({ month, weeks })
    }

    return months
  }, [yearDays])

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full">
      {/* Year Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{selectedYear}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevYear}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
              aria-label="Previous year"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNextYear}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
              aria-label="Next year"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={handleCurrentYear}
              className="ml-2 px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800 rounded-lg transition-colors border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
              aria-label="Go to current year"
            >
              Today
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-sm text-gray-500" role="group" aria-label="Activity level legend">
          <span className="font-medium" id="legend-less">Less</span>
          <div className="flex gap-1" role="list" aria-labelledby="legend-less legend-more">
            <div className="w-[14px] h-[14px] rounded-sm bg-gray-100 border border-gray-200" role="listitem" aria-label="No activity: 0%" />
            <div className="w-[14px] h-[14px] rounded-sm bg-emerald-100" role="listitem" aria-label="Low activity: 1-25%" />
            <div className="w-[14px] h-[14px] rounded-sm bg-emerald-300" role="listitem" aria-label="Medium activity: 26-50%" />
            <div className="w-[14px] h-[14px] rounded-sm bg-emerald-400" role="listitem" aria-label="High activity: 51-75%" />
            <div className="w-[14px] h-[14px] rounded-sm bg-emerald-500" role="listitem" aria-label="Very high activity: 76-100%" />
          </div>
          <span className="font-medium" id="legend-more">More</span>
        </div>
      </div>

      {/* Calendar Grid - Organized by Months */}
      <div className="w-full">
        {/* Day Labels Column Header */}
        <div className="flex mb-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Activity Calendar
          </div>
        </div>

        {/* Months Grid - Responsive with auto-fit */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          {monthsData.map(({ month, weeks }) => (
            <div key={month} className="flex flex-col min-h-0">
              {/* Month Label */}
              <button
                onClick={() => navigateToMonth(selectedYear, month)}
                className="mb-2 text-sm font-semibold text-gray-700 hover:text-emerald-600 transition-colors text-left"
                aria-label={`View ${MONTHS[month]} ${selectedYear}`}
              >
                {MONTHS[month]}
              </button>

              {/* Month Grid Container - Flexible to fill available space */}
              <div className="flex flex-1 bg-white rounded-lg border border-gray-100 p-3 shadow-sm min-h-0">
                {/* Day Labels for this month */}
                <div className="grid grid-rows-7 gap-1 mr-2 pr-2 border-r border-gray-100">
                  {DAYS.map((day, i) => (
                    <div
                      key={day}
                      className="min-h-[10px] flex items-center justify-end text-[10px] text-gray-400 font-medium"
                    >
                      {i % 2 === 1 ? day.charAt(0) : ''}
                    </div>
                  ))}
                </div>

                {/* Weeks Grid - 6 columns (weeks) x 7 rows (days) with flexible cells */}
                <div className="grid grid-cols-6 gap-x-2 gap-y-1 flex-1">
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="grid grid-rows-7 gap-1">
                      {week.map((date, dayIndex) => {
                        if (!date) {
                          return (
                            <div
                              key={`empty-${weekIndex}-${dayIndex}`}
                              className="min-w-[10px] min-h-[10px] aspect-square"
                            />
                          )
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
          ))}
        </div>

        {/* Bottom Summary */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex flex-wrap gap-6 text-sm text-gray-500">
            <div>
              <span className="font-medium text-gray-700">{activities.length}</span> activities tracked
            </div>
            <div>
              <span className="font-medium text-gray-700">{logs.filter(l => l.completed).length}</span> completions this year
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
