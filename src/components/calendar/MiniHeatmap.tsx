import { useMemo, memo } from 'react'
import { formatDate } from '../../lib/dates'
import { calculateHeatmapLevel, getHeatmapColor } from '../../lib/colors'
import type { Activity } from '../../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface MiniHeatmapProps {
  year: number
  activities: Activity[]
  logsByDate: Map<string, number>
  selectedMonth: number
  onMonthSelect: (month: number) => void
}

interface MiniMonthData {
  month: number
  cells: (Date | null)[]
}

export const MiniHeatmap = memo(function MiniHeatmap({
  year,
  activities,
  logsByDate,
  selectedMonth,
  onMonthSelect,
}: MiniHeatmapProps) {
  const totalActivities = activities.length

  // Build mini-month grids: 7 cols x enough rows per month
  const miniMonths = useMemo(() => {
    const months: MiniMonthData[] = []

    for (let month = 0; month < 12; month++) {
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      const daysInMonth = lastDay.getDate()
      const startOffset = firstDay.getDay() // 0=Sun

      const cells: (Date | null)[] = []

      // Leading empty cells
      for (let i = 0; i < startOffset; i++) {
        cells.push(null)
      }

      // Days of the month
      for (let d = 1; d <= daysInMonth; d++) {
        cells.push(new Date(year, month, d))
      }

      // Trailing empty cells to fill last week row
      const remainder = cells.length % 7
      if (remainder > 0) {
        for (let i = 0; i < 7 - remainder; i++) {
          cells.push(null)
        }
      }

      months.push({ month, cells })
    }

    return months
  }, [year])

  return (
    <div
      className="grid grid-cols-3 gap-3"
      role="grid"
      aria-label={`Mini heatmap for ${year}`}
    >
      {miniMonths.map(({ month, cells }) => {
        const isSelected = month === selectedMonth
        const weeksCount = cells.length / 7

        return (
          <button
            key={month}
            type="button"
            onClick={() => onMonthSelect(month)}
            className={`
              flex flex-col items-center p-1.5 rounded-lg transition-colors
              ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-50' : 'bg-white hover:bg-gray-50'}
            `}
            aria-label={`${MONTHS[month]} ${year}${isSelected ? ' (selected)' : ''}`}
            aria-pressed={isSelected}
          >
            {/* Month label */}
            <span className="text-[10px] font-semibold text-gray-600 mb-1">
              {MONTHS[month]}
            </span>

            {/* Mini grid */}
            <div
              className="grid grid-cols-7 gap-[2px]"
              role="presentation"
            >
              {cells.map((date, idx) => {
                if (!date) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="w-[6px] h-[6px] sm:w-[14px] sm:h-[14px]"
                      style={{ width: '6px', height: '6px' }}
                    />
                  )
                }

                const dateStr = formatDate(date)
                const completedCount = logsByDate.get(dateStr) || 0
                const level = calculateHeatmapLevel(completedCount, totalActivities)
                const heatmapClass = getHeatmapColor(level)

                return (
                  <div
                    key={dateStr}
                    className={`w-[6px] h-[6px] rounded-[1px] ${heatmapClass} ${level === 0 ? 'border border-gray-200' : ''}`}
                    style={{ width: '6px', height: '6px' }}
                    aria-hidden="true"
                  />
                )
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
})
