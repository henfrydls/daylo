import { useMemo } from 'react'
import { useCalendarStore } from '../../store'
import { formatDate, getYearDays } from '../../lib/dates'
import { currentStreak, longestStreak } from '../../lib/streaks'
import { completedDates } from '../../lib/activityYear'

export function StatsPanel() {
  const { selectedYear, activities, logs } = useCalendarStore()

  const stats = useMemo(() => {
    if (activities.length === 0) {
      return {
        totalDays: 0,
        activeDays: 0,
        currentStreak: 0,
        longestStreak: 0,
        completionRate: 0,
      }
    }

    const yearDays = getYearDays(selectedYear)
    const today = new Date()

    // Two sets, because the panel answers two kinds of question. Active days and this
    // month are about the year on screen. The streaks are about the person: they are read
    // over every log there is, so a run through the new year is not cut in half by the
    // calendar, and "current" means the run ending today whatever year is being looked at.
    const everyDayWithActivity = completedDates(logs)
    // Days gone by, in the year on screen. A day still to come is not an active day: an
    // imported file can carry next year in it, and the days elapsed underneath stop at
    // today, so counting them said more days active than there have been.
    const limit = formatDate(today)
    const daysWithActivity = new Set(
      [...everyDayWithActivity].filter(
        (date) => date.startsWith(String(selectedYear)) && date <= limit
      )
    )

    // Completion rate for the current month of the year on screen
    const currentMonth = today.getMonth()
    const currentMonthDays = yearDays.filter((d) => d.getMonth() === currentMonth && d <= today)
    const currentMonthCompleted = currentMonthDays.filter((d) =>
      daysWithActivity.has(formatDate(d))
    ).length
    const completionRate =
      currentMonthDays.length > 0
        ? Math.round((currentMonthCompleted / currentMonthDays.length) * 100)
        : 0

    return {
      totalDays: yearDays.filter((d) => d <= today).length,
      activeDays: daysWithActivity.size,
      currentStreak: currentStreak(everyDayWithActivity, today),
      longestStreak: longestStreak(everyDayWithActivity, today),
      completionRate,
    }
  }, [selectedYear, activities, logs])

  if (activities.length === 0) {
    return null
  }

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4"
      data-testid="stats-panel"
    >
      <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Statistics</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <StatCard label="Active Days" value={stats.activeDays} subtitle="this year" />
        <StatCard label="Current Streak" value={stats.currentStreak} subtitle="days" />
        <StatCard label="Longest Streak" value={stats.longestStreak} subtitle="days" />
        <StatCard label="This Month" value={`${stats.completionRate}%`} subtitle="completion" />
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string
  value: number | string
  subtitle: string
}) {
  return (
    <div className="p-2 sm:p-3 rounded-lg bg-gray-50">
      <div className="text-xl sm:text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs sm:text-sm text-gray-600">{label}</div>
      <div className="text-xs text-gray-400">{subtitle}</div>
    </div>
  )
}
