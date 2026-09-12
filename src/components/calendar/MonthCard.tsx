import { useMemo, memo } from 'react'
import { formatDate } from '../../lib/dates'
import { calculateHeatmapLevel, getHeatmapColor } from '../../lib/colors'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

interface MonthCardProps {
  year: number
  month: number
  totalActivities: number
  logsByDate: Map<string, number>
  onSelect: (month: number) => void
}

export const MonthCard = memo(function MonthCard({
  year,
  month,
  totalActivities,
  logsByDate,
  onSelect,
}: MonthCardProps) {
  const { cells, daysInMonth, daysCompleted, percentage } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days = lastDay.getDate()
    const startOffset = firstDay.getDay()

    const gridCells: (Date | null)[] = []

    for (let i = 0; i < startOffset; i++) {
      gridCells.push(null)
    }

    let completed = 0
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d)
      gridCells.push(date)
      const dateStr = formatDate(date)
      const count = logsByDate.get(dateStr) || 0
      if (count > 0) completed++
    }

    // Trailing empty cells
    const remainder = gridCells.length % 7
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        gridCells.push(null)
      }
    }

    const pct = days > 0 ? Math.round((completed / days) * 100) : 0

    return { cells: gridCells, daysInMonth: days, daysCompleted: completed, percentage: pct }
  }, [year, month, logsByDate])

  return (
    <button
      type="button"
      onClick={() => onSelect(month)}
      className="flex flex-col p-3 rounded-xl bg-white border border-gray-200 hover:border-emerald-300 hover:shadow-sm transition-all active:scale-[0.98] min-h-[44px] text-left w-full"
      aria-label={`${MONTHS[month]} ${year}: ${daysCompleted} of ${daysInMonth} days active, ${percentage}%. Tap to view month.`}
      data-testid="month-card"
    >
      {/* Header: Month name + stats */}
      <div
        className="flex items-center justify-between gap-1 mb-2 w-full"
        data-testid="month-card-header"
      >
        <span className="text-sm font-semibold text-gray-800" data-testid="month-card-name">
          {MONTHS_SHORT[month]}
        </span>
        {/* One line, always. On a 360 phone a card is 95px wide and "28/28 &middot; 100%"
            does not fit beside the month name, so it used to wrap into it. The count is
            dropped at that width rather than shrunk: the percentage is the part somebody
            reads at a glance, and the grid below already shows the days. Nothing is lost
            to a screen reader, which gets the full figures from the card's aria-label. */}
        <span className="text-xs text-gray-500 whitespace-nowrap" data-testid="month-card-stats">
          <span className="hidden sm:inline">
            {daysCompleted}/{daysInMonth} &middot;{' '}
          </span>
          {percentage}%
        </span>
      </div>

      {/* Mini heatmap grid */}
      <div className="grid grid-cols-7 gap-[3px] w-full" role="presentation" aria-hidden="true">
        {cells.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="w-full aspect-square rounded-[2px]" />
          }

          const dateStr = formatDate(date)
          const completedCount = logsByDate.get(dateStr) || 0
          const level = calculateHeatmapLevel(completedCount, totalActivities)
          const heatmapClass = getHeatmapColor(level)

          return (
            <div
              key={dateStr}
              className={`w-full aspect-square rounded-[2px] ${heatmapClass} ${level === 0 ? 'border border-gray-200/60' : ''}`}
            />
          )
        })}
      </div>
    </button>
  )
})
