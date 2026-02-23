import { useMemo, useCallback, memo } from 'react'
import { formatDate, checkIsToday } from '../../lib/dates'
import { calculateHeatmapLevel, getHeatmapColor } from '../../lib/colors'
import type { Activity } from '../../types'

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface MonthHeatmapDetailProps {
  year: number
  month: number // 0-11
  activities: Activity[]
  logsByDate: Map<string, number>
  onDateSelect: (dateStr: string) => void
  onMonthChange: (month: number) => void
}

interface DayCellData {
  date: Date | null
  dateStr: string
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  level: 0 | 1 | 2 | 3 | 4
}

function getMonthGridDays(year: number, month: number): DayCellData[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startOffset = firstDay.getDay() // 0 = Sunday

  const cells: DayCellData[] = []

  // Previous month trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate()
  for (let i = startOffset - 1; i >= 0; i--) {
    const date = new Date(year, month - 1, prevMonthLastDay - i)
    cells.push({
      date,
      dateStr: formatDate(date),
      dayNumber: prevMonthLastDay - i,
      isCurrentMonth: false,
      isToday: checkIsToday(date),
      level: 0,
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    cells.push({
      date,
      dateStr: formatDate(date),
      dayNumber: d,
      isCurrentMonth: true,
      isToday: checkIsToday(date),
      level: 0,
    })
  }

  // Next month leading days to fill grid (6 rows = 42 cells)
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d)
    cells.push({
      date,
      dateStr: formatDate(date),
      dayNumber: d,
      isCurrentMonth: false,
      isToday: checkIsToday(date),
      level: 0,
    })
  }

  return cells
}

export const MonthHeatmapDetail = memo(function MonthHeatmapDetail({
  year,
  month,
  activities,
  logsByDate,
  onDateSelect,
  onMonthChange,
}: MonthHeatmapDetailProps) {
  const totalActivities = activities.length

  const cells = useMemo(() => {
    const baseCells = getMonthGridDays(year, month)

    // Enrich with heatmap levels
    return baseCells.map((cell) => {
      const completedCount = logsByDate.get(cell.dateStr) || 0
      const level = calculateHeatmapLevel(completedCount, totalActivities)
      return { ...cell, level }
    })
  }, [year, month, totalActivities, logsByDate])

  const handlePrevMonth = useCallback(() => {
    if (month === 0) {
      // Stay at January - don't cross year boundary in this detail view
      onMonthChange(0)
    } else {
      onMonthChange(month - 1)
    }
  }, [month, onMonthChange])

  const handleNextMonth = useCallback(() => {
    if (month === 11) {
      // Stay at December - don't cross year boundary in this detail view
      onMonthChange(11)
    } else {
      onMonthChange(month + 1)
    }
  }, [month, onMonthChange])

  return (
    <div className="mt-4">
      {/* Header with month name and navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={handlePrevMonth}
          disabled={month === 0}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous month"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h2 className="text-lg font-bold text-gray-900">
          {MONTHS_FULL[month]}
        </h2>

        <button
          type="button"
          onClick={handleNextMonth}
          disabled={month === 11}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_SHORT.map((day, i) => (
          <div
            key={`${day}-${i}`}
            className="text-center text-xs font-semibold text-gray-400 uppercase py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTHS_FULL[month]} ${year} detail`}>
        {cells.map((cell) => {
          const heatmapClass = cell.isCurrentMonth ? getHeatmapColor(cell.level) : ''

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => cell.isCurrentMonth && onDateSelect(cell.dateStr)}
              disabled={!cell.isCurrentMonth}
              className={`
                w-full aspect-square rounded-lg flex items-center justify-center
                text-sm font-medium transition-colors
                focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
                ${cell.isCurrentMonth
                  ? `${heatmapClass} ${cell.level === 0 ? 'border border-gray-200' : ''} active:scale-95`
                  : 'text-gray-300 cursor-default'
                }
                ${cell.isToday && cell.isCurrentMonth ? 'ring-2 ring-offset-1 ring-blue-500' : ''}
              `}
              style={{ minHeight: '46px' }}
              aria-label={
                cell.isCurrentMonth
                  ? `${cell.dateStr}${cell.isToday ? ' (today)' : ''}`
                  : undefined
              }
              data-testid={cell.isCurrentMonth ? 'month-detail-cell' : undefined}
            >
              <span
                className={`
                  ${cell.isCurrentMonth ? 'text-gray-800' : 'text-gray-300'}
                  ${cell.isToday && cell.isCurrentMonth ? 'font-bold' : ''}
                  ${cell.level >= 3 && cell.isCurrentMonth ? 'text-white' : ''}
                `}
              >
                {cell.dayNumber}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
