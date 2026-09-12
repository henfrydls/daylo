import { useMemo, memo } from 'react'
import { formatDate, getYearDays } from '../../lib/dates'

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

interface YearProgressBarProps {
  year: number
  logsByDate: Map<string, number>
  totalActivities: number
  /**
   * The run ending today, worked out over every log there is rather than over this year.
   * It arrives as a number instead of being computed here so that this bar and the
   * Statistics panel cannot disagree about the same run.
   */
  currentStreak: number
}

export const YearProgressBar = memo(function YearProgressBar({
  year,
  logsByDate,
  totalActivities,
  currentStreak,
}: YearProgressBarProps) {
  const { activeDays, totalDaysElapsed, percentage, bestMonth } = useMemo(() => {
    const yearDays = getYearDays(year)
    const today = new Date()

    // Count days elapsed up to today
    const elapsed = yearDays.filter((d) => d <= today).length

    // Count days with at least one completion
    // Days gone by only: the bar reads "N/M days active", and M stops at today, so a day
    // still to come on the left of that slash would be claiming the impossible.
    const limit = formatDate(today)
    const daysWithActivity = new Set<string>()
    logsByDate.forEach((count, dateStr) => {
      if (count > 0 && dateStr.startsWith(String(year)) && dateStr <= limit) {
        daysWithActivity.add(dateStr)
      }
    })

    const active = daysWithActivity.size
    const pct = elapsed > 0 ? Math.round((active / elapsed) * 100) : 0

    // Best month by active days count
    const monthCounts = new Array(12).fill(0)
    daysWithActivity.forEach((dateStr) => {
      const monthIdx = parseInt(dateStr.substring(5, 7), 10) - 1
      monthCounts[monthIdx]++
    })

    let bestMonthIdx = 0
    let bestMonthCount = 0
    for (let i = 0; i < 12; i++) {
      if (monthCounts[i] > bestMonthCount) {
        bestMonthCount = monthCounts[i]
        bestMonthIdx = i
      }
    }

    return {
      activeDays: active,
      totalDaysElapsed: elapsed,
      percentage: pct,
      bestMonth: bestMonthCount > 0 ? MONTHS_SHORT[bestMonthIdx] : null,
    }
  }, [year, logsByDate])

  if (totalActivities === 0) {
    return null
  }

  return (
    <div className="space-y-2" data-testid="year-progress-bar">
      {/* Progress bar */}
      <div
        className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Year progress: ${percentage}%`}
      >
        <div
          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          <span className="font-semibold text-gray-700">{activeDays}</span>/{totalDaysElapsed} days
          active
        </span>
        <div className="flex items-center gap-3">
          {currentStreak > 0 && (
            <span>
              <span className="font-semibold text-gray-700">{currentStreak}</span>d streak
            </span>
          )}
          {bestMonth && (
            <span>
              Best: <span className="font-semibold text-gray-700">{bestMonth}</span>
            </span>
          )}
          <span className="font-semibold text-emerald-600">{percentage}%</span>
        </div>
      </div>
    </div>
  )
})
